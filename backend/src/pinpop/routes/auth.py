from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update

from ..db.models import User
from ..deps import Ctx, OptionalUser, rate_limit
from ..errors import conflict, forbidden, not_found, unauthorized
from ..security import hash_password, new_id, verify_password
from ..services.auth import to_public_user

log = logging.getLogger("pinpop.auth")
router = APIRouter(tags=["auth"])
auth_limit = Depends(rate_limit(10))

# Compared against when the email is unknown so response time doesn't reveal whether an account exists.
_DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A" * 86 + "=="


# Deliberately permissive: self-hosted installs often use internal domains such as school.local.
Email = Annotated[str, Field(max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]


class RegisterBody(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=60)]
    email: Email
    password: Annotated[str, Field(min_length=8, max_length=200)]

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.lower()


class LoginBody(BaseModel):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=200)]

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.lower()


async def _registration_allowed(ctx: Ctx) -> bool:
    return ctx.settings.ALLOW_REGISTRATION or await ctx.auth.user_count() == 0


@router.post("/api/auth/register", dependencies=[auth_limit])
async def register(body: RegisterBody, request: Request, response: Response, ctx: Ctx) -> dict[str, Any]:
    if not await _registration_allowed(ctx):
        raise forbidden("registration_closed")
    async with ctx.db.session() as s:
        if (await s.execute(select(User.id).where(User.email == body.email))).first():
            raise conflict("email_taken")
    accept_language = request.headers.get("accept-language", "").lower()
    user = User(
        id=new_id(),
        name=body.name,
        email=body.email,
        password_hash=await hash_password(body.password),
        role=await ctx.auth.new_user_role(),
        locale="tr" if accept_language.startswith("tr") else "en",
    )
    async with ctx.db.session() as s, s.begin():
        s.add(user)
    await ctx.auth.create_session(response, user.id, request.headers.get("user-agent"))
    return {"user": to_public_user(user)}


@router.post("/api/auth/login", dependencies=[auth_limit])
async def login(body: LoginBody, request: Request, response: Response, ctx: Ctx) -> dict[str, Any]:
    async with ctx.db.session() as s:
        user = (await s.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    ok = await verify_password(body.password, (user.password_hash if user else None) or _DUMMY_HASH)
    if not user or not ok:
        raise unauthorized("invalid_credentials")
    await ctx.auth.create_session(response, user.id, request.headers.get("user-agent"))
    return {"user": to_public_user(user)}


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response, ctx: Ctx) -> dict[str, bool]:
    await ctx.auth.destroy_session(request, response)
    return {"ok": True}


@router.get("/api/auth/me")
async def me(user: OptionalUser) -> dict[str, Any]:
    return {"user": to_public_user(user) if user else None}


# ---------------------------------------------------------------- OAuth

Provider = Literal["github", "google"]
_COOKIE_MAX_AGE = 600


def _callback(ctx: Ctx, provider: str) -> str:
    return f"{ctx.settings.public_url}/api/auth/oauth/{provider}/callback"


def _set_temp_cookie(ctx: Ctx, response: Response, name: str, value: str) -> None:
    response.set_cookie(
        name,
        value,
        path="/",
        httponly=True,
        samesite="lax",
        secure=ctx.settings.secure_cookies,
        max_age=_COOKIE_MAX_AGE,
    )


@router.get("/api/auth/oauth/{provider}", dependencies=[auth_limit])
async def oauth_start(provider: Provider, ctx: Ctx) -> RedirectResponse:
    s = ctx.settings
    state = secrets.token_urlsafe(24)
    if provider == "github":
        if not s.github_enabled:
            raise not_found("provider_disabled")
        params = {
            "client_id": s.GITHUB_CLIENT_ID,
            "redirect_uri": _callback(ctx, "github"),
            "scope": "read:user user:email",
            "state": state,
        }
        response = RedirectResponse(f"https://github.com/login/oauth/authorize?{urlencode(params)}", status_code=302)
    else:
        if not s.google_enabled:
            raise not_found("provider_disabled")
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        params = {
            "response_type": "code",
            "client_id": s.GOOGLE_CLIENT_ID,
            "redirect_uri": _callback(ctx, "google"),
            "scope": "openid profile email",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        response = RedirectResponse(
            f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}", status_code=302
        )
        _set_temp_cookie(ctx, response, "pp_oauth_verifier", verifier)
    _set_temp_cookie(ctx, response, "pp_oauth_state", state)
    return response


@router.get("/api/auth/oauth/{provider}/callback")
async def oauth_callback(
    provider: Provider, request: Request, ctx: Ctx, code: str | None = None, state: str | None = None
) -> RedirectResponse:
    expected = request.cookies.get("pp_oauth_state")

    def redirect(url: str) -> RedirectResponse:
        response = RedirectResponse(url, status_code=302)
        response.delete_cookie("pp_oauth_state", path="/")
        response.delete_cookie("pp_oauth_verifier", path="/")
        return response

    if not code or not state or not expected or not secrets.compare_digest(state, expected):
        return redirect("/login?error=oauth_state")
    try:
        if provider == "github":
            profile = await _github_profile(ctx, code)
        else:
            profile = await _google_profile(ctx, code, request.cookies.get("pp_oauth_verifier"))
    except Exception:
        log.warning("oauth login failed", exc_info=True)
        return redirect("/login?error=oauth_failed")

    id_column = User.github_id if provider == "github" else User.google_id
    id_field = "github_id" if provider == "github" else "google_id"
    async with ctx.db.session() as s, s.begin():
        user = (await s.execute(select(User).where(id_column == profile["id"]))).scalar_one_or_none()
        if not user:
            # Link to an existing account with the same verified email address.
            user = (await s.execute(select(User).where(User.email == profile["email"]))).scalar_one_or_none()
            if user:
                await s.execute(update(User).where(User.id == user.id).values({id_field: profile["id"]}))
            else:
                if not await _registration_allowed(ctx):
                    return redirect("/login?error=registration_closed")
                user = User(
                    id=new_id(),
                    email=profile["email"],
                    name=profile["name"],
                    avatar_url=profile["avatarUrl"],
                    role=await ctx.auth.new_user_role(),
                    **{id_field: profile["id"]},
                )
                s.add(user)
    response = redirect("/dashboard")
    await ctx.auth.create_session(response, user.id, request.headers.get("user-agent"))
    return response


async def _github_profile(ctx: Ctx, code: str) -> dict[str, Any]:
    s = ctx.settings
    async with httpx.AsyncClient(timeout=15) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"accept": "application/json"},
            data={
                "client_id": s.GITHUB_CLIENT_ID,
                "client_secret": s.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": _callback(ctx, "github"),
            },
        )
        access_token = token_res.json()["access_token"]
        headers = {"authorization": f"Bearer {access_token}", "user-agent": "Pinpop"}
        u = (await client.get("https://api.github.com/user", headers=headers)).json()
        emails = (await client.get("https://api.github.com/user/emails", headers=headers)).json()
    email = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None) or next(
        (e["email"] for e in emails if e.get("verified")), None
    )
    if not email:
        raise ValueError("GitHub account has no verified email")
    return {
        "id": str(u["id"]),
        "email": email.lower(),
        "name": u.get("name") or u["login"],
        "avatarUrl": u.get("avatar_url"),
    }


async def _google_profile(ctx: Ctx, code: str, verifier: str | None) -> dict[str, Any]:
    s = ctx.settings
    if not verifier:
        raise ValueError("missing PKCE verifier")
    async with httpx.AsyncClient(timeout=15) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": s.GOOGLE_CLIENT_ID,
                "client_secret": s.GOOGLE_CLIENT_SECRET,
                "redirect_uri": _callback(ctx, "google"),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
        access_token = token_res.json()["access_token"]
        u = (
            await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo", headers={"authorization": f"Bearer {access_token}"}
            )
        ).json()
    if not u.get("email_verified"):
        raise ValueError("Google email not verified")
    email = u["email"].lower()
    return {
        "id": u["sub"],
        "email": email,
        "name": u.get("name") or email.split("@")[0] or "Player",
        "avatarUrl": u.get("picture"),
    }
