from __future__ import annotations

import os
import resource
import time
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, select, update

from ..ai.service import AiSettingsInput
from ..db.models import ApiToken, Game, Quiz, Session, User, utcnow
from ..deps import AdminUser, Ctx, CurrentUser, rate_limit
from ..errors import bad_request, not_found, unauthorized
from ..security import hash_password, verify_password
from ..services.auth import SESSION_COOKIE, to_public_user
from ..util import iso

router = APIRouter()


class ProfileBody(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=60)] | None = None
    locale: Annotated[str, Field(min_length=2, max_length=10)] | None = None


class PasswordBody(BaseModel):
    currentPassword: Annotated[str, Field(min_length=1, max_length=200)]
    newPassword: Annotated[str, Field(min_length=8, max_length=200)]


class DeleteAccountBody(BaseModel):
    confirm: Literal["DELETE"]


class TokenBody(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=60)]


@router.patch("/api/me", tags=["account"])
async def update_profile(body: ProfileBody, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    values = {k: v.strip() if k == "name" else v for k, v in body.model_dump(exclude_none=True).items()}
    if values.get("name") == "":
        raise bad_request("validation_error", "name: String should have at least 1 character")
    async with ctx.db.session() as s, s.begin():
        if values:
            await s.execute(update(User).where(User.id == user.id).values(**values))
        updated = await s.get(User, user.id)
    if not updated:
        raise not_found()
    return {"user": to_public_user(updated)}


@router.post("/api/me/password", tags=["account"], dependencies=[Depends(rate_limit(10))])
async def change_password(body: PasswordBody, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    if user.password_hash and not await verify_password(body.currentPassword, user.password_hash):
        raise unauthorized("invalid_credentials")
    new_hash = await hash_password(body.newPassword)
    async with ctx.db.session() as s, s.begin():
        await s.execute(update(User).where(User.id == user.id).values(password_hash=new_hash))
    return {"ok": True}


@router.get("/api/me/export", tags=["account"])
async def export_data(user: CurrentUser, ctx: Ctx) -> JSONResponse:
    """GDPR/KVKK: everything Pinpop stores about the user, as JSON."""
    async with ctx.db.session() as s:
        quizzes = (await s.execute(select(Quiz).where(Quiz.owner_id == user.id))).scalars().all()
        games = (await s.execute(select(Game).where(Game.host_id == user.id))).scalars().all()

    body = {
        "user": to_public_user(user),
        "quizzes": [_row_dict(q) for q in quizzes],
        "games": [_row_dict(g) for g in games],
        "exportedAt": iso(utcnow()),
    }
    return JSONResponse(body, headers={"content-disposition": 'attachment; filename="pinpop-export.json"'})


def _row_dict(obj: Quiz | Game) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.key)
        out[to_camel(column.key)] = iso(value) if isinstance(value, datetime) else value
    return out


@router.delete("/api/me", tags=["account"])
async def delete_account(
    body: DeleteAccountBody, request: Request, response: Response, user: CurrentUser, ctx: Ctx
) -> dict[str, bool]:
    await ctx.auth.destroy_session(request, response)
    async with ctx.db.session() as s, s.begin():
        await s.execute(delete(User).where(User.id == user.id))
    return {"ok": True}


@router.post("/api/me/sessions/revoke-all", tags=["account"])
async def revoke_sessions(response: Response, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    async with ctx.db.session() as s, s.begin():
        await s.execute(delete(Session).where(Session.user_id == user.id))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


# ---------------------------------------------------------------- AI settings


@router.get("/api/me/ai", tags=["ai"])
async def get_ai_settings(user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    s = user.ai_settings
    return {
        "status": await ctx.ai.status(user),
        "settings": {
            "provider": s["provider"],
            "model": s.get("model"),
            "baseUrl": s.get("baseUrl"),
            "hasKey": bool(s.get("apiKeyEnc")),
        }
        if s
        else None,
    }


@router.put("/api/me/ai", tags=["ai"])
async def put_ai_settings(body: AiSettingsInput, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    await ctx.ai.save_user_settings(user, body)
    return {"ok": True}


@router.delete("/api/me/ai", tags=["ai"])
async def delete_ai_settings(user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    await ctx.ai.save_user_settings(user, None)
    return {"ok": True}


# ---------------------------------------------------------------- API tokens


@router.get("/api/me/tokens", tags=["tokens"])
async def list_tokens(user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    async with ctx.db.session() as s:
        rows = (
            await s.execute(select(ApiToken).where(ApiToken.user_id == user.id).order_by(ApiToken.created_at.desc()))
        ).scalars()
        items = [
            {
                "id": t.id,
                "name": t.name,
                "prefix": t.prefix,
                "lastUsedAt": iso(t.last_used_at),
                "createdAt": iso(t.created_at),
            }
            for t in rows
        ]
    return {"items": items}


@router.post("/api/me/tokens", tags=["tokens"])
async def create_token(body: TokenBody, request: Request, user: CurrentUser, ctx: Ctx) -> dict[str, str]:
    # API tokens cannot mint more tokens; only an interactive session can.
    if request.headers.get("authorization"):
        raise unauthorized("session_required")
    async with ctx.db.session() as s:
        existing = (
            await s.execute(select(func.count()).select_from(ApiToken).where(ApiToken.user_id == user.id))
        ).scalar_one()
    if existing >= 20:
        raise bad_request("too_many_tokens")
    return await ctx.auth.create_api_token(user.id, body.name.strip())


@router.delete("/api/me/tokens/{token_id}", tags=["tokens"])
async def delete_token(token_id: str, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    async with ctx.db.session() as s, s.begin():
        await s.execute(delete(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == user.id))
    return {"ok": True}


# ---------------------------------------------------------------- instance & admin


@router.get("/api/health", tags=["meta"])
async def health(ctx: Ctx) -> dict[str, str]:
    return {"status": "ok", "version": ctx.version}


@router.get("/api/instance", tags=["meta"])
async def instance(ctx: Ctx) -> dict[str, Any]:
    s = ctx.settings
    return {
        "name": s.INSTANCE_NAME,
        "version": ctx.version,
        "registrationOpen": s.ALLOW_REGISTRATION or await ctx.auth.user_count() == 0,
        "ai": {"enabled": ctx.ai.instance_enabled, "provider": s.AI_PROVIDER, "userKeysAllowed": s.AI_ALLOW_USER_KEYS},
        "oauth": {"github": s.github_enabled, "google": s.google_enabled},
        "hosted": s.HOSTED_MODE,
        "maxPlayers": s.MAX_PLAYERS,
        "publicUrl": s.public_url,
    }


@router.get("/api/admin/stats", tags=["admin"])
async def admin_stats(_: AdminUser, ctx: Ctx) -> dict[str, Any]:
    async with ctx.db.session() as s:
        users = (await s.execute(select(func.count()).select_from(User))).scalar_one()
        quizzes = (await s.execute(select(func.count()).select_from(Quiz))).scalar_one()
        games = (await s.execute(select(func.count()).select_from(Game))).scalar_one()
    rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {
        "users": users,
        "quizzes": quizzes,
        "gamesPlayed": games,
        "liveGames": len(ctx.games),
        "memoryMb": round(_current_rss_mb() or rss_kb / 1024),
        "uptimeSeconds": round(time.monotonic() - ctx.started_at),
    }


def _current_rss_mb() -> float | None:
    try:
        with open(f"/proc/{os.getpid()}/statm") as f:
            return int(f.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") / 1024 / 1024
    except OSError:
        return None


@router.get("/api/admin/users", tags=["admin"])
async def admin_users(_: AdminUser, ctx: Ctx) -> dict[str, Any]:
    async with ctx.db.session() as s:
        rows = (await s.execute(select(User).order_by(User.created_at.desc()).limit(500))).scalars()
        return {"items": [to_public_user(u) for u in rows]}


class RoleBody(BaseModel):
    role: Literal["admin", "user"]


@router.patch("/api/admin/users/{user_id}", tags=["admin"])
async def admin_set_role(user_id: str, body: RoleBody, admin: AdminUser, ctx: Ctx) -> dict[str, bool]:
    if admin.id == user_id:
        raise bad_request("cannot_change_own_role")
    async with ctx.db.session() as s, s.begin():
        await s.execute(update(User).where(User.id == user_id).values(role=body.role))
    return {"ok": True}


@router.delete("/api/admin/users/{user_id}", tags=["admin"])
async def admin_delete_user(user_id: str, admin: AdminUser, ctx: Ctx) -> dict[str, bool]:
    if admin.id == user_id:
        raise bad_request("cannot_delete_self")
    async with ctx.db.session() as s, s.begin():
        await s.execute(delete(User).where(User.id == user_id))
    return {"ok": True}
