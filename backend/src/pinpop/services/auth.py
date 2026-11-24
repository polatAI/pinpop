from __future__ import annotations

import time
from datetime import timedelta
from typing import Any

from fastapi import Request, Response
from sqlalchemy import delete, func, select, update

from ..db.database import Database
from ..db.models import ApiToken, Session, User, utcnow
from ..errors import unauthorized
from ..security import new_id, random_token, sha256
from ..util import iso

SESSION_COOKIE = "pp_session"
SESSION_TTL = timedelta(days=30)
TOKEN_TOUCH_INTERVAL_S = 60
API_TOKEN_PREFIX = "pp_"  # noqa: S105 - a prefix, not a secret


def to_public_user(u: User) -> dict[str, Any]:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "locale": u.locale,
        "avatarUrl": u.avatar_url,
        "createdAt": iso(u.created_at),
    }


class AuthService:
    def __init__(self, db: Database, *, secure_cookies: bool) -> None:
        self._db = db
        self._secure = secure_cookies
        self._token_touches: dict[str, float] = {}

    async def user_count(self) -> int:
        async with self._db.session() as s:
            return int((await s.execute(select(func.count()).select_from(User))).scalar_one())

    async def new_user_role(self) -> str:
        """The very first account becomes the instance admin."""
        return "admin" if await self.user_count() == 0 else "user"

    async def create_session(self, response: Response, user_id: str, user_agent: str | None) -> None:
        token = random_token(40)
        expires = utcnow() + SESSION_TTL
        async with self._db.session() as s, s.begin():
            s.add(
                Session(
                    id=sha256(token),
                    user_id=user_id,
                    expires_at=expires,
                    user_agent=(user_agent or "")[:300] or None,
                )
            )
        response.set_cookie(
            SESSION_COOKIE,
            token,
            path="/",
            httponly=True,
            samesite="lax",
            secure=self._secure,
            expires=expires,
        )

    async def destroy_session(self, request: Request, response: Response) -> None:
        if token := request.cookies.get(SESSION_COOKIE):
            async with self._db.session() as s, s.begin():
                await s.execute(delete(Session).where(Session.id == sha256(token)))
        response.delete_cookie(SESSION_COOKIE, path="/")

    async def resolve_user(self, request: Request) -> User | None:
        """Resolves the current user from the session cookie or an `Authorization: Bearer pp_…` API token."""
        header = request.headers.get("authorization", "")
        if header.startswith("Bearer "):
            return await self.user_for_token(header[7:].strip())
        cookie = request.cookies.get(SESSION_COOKIE)
        if not cookie:
            return None
        async with self._db.session() as s:
            stmt = (
                select(User)
                .join(Session, Session.user_id == User.id)
                .where(Session.id == sha256(cookie), Session.expires_at > utcnow())
            )
            return (await s.execute(stmt)).scalar_one_or_none()

    async def user_for_token(self, token: str) -> User | None:
        if not token.startswith(API_TOKEN_PREFIX):
            return None
        async with self._db.session() as s:
            row = (
                await s.execute(
                    select(User, ApiToken.id)
                    .join(ApiToken, ApiToken.user_id == User.id)
                    .where(ApiToken.token_hash == sha256(token))
                )
            ).first()
            if not row:
                return None
            user, token_id = row
            now = time.monotonic()
            if now - self._token_touches.get(token_id, 0) > TOKEN_TOUCH_INTERVAL_S:
                self._token_touches[token_id] = now
                await s.execute(update(ApiToken).where(ApiToken.id == token_id).values(last_used_at=utcnow()))
                await s.commit()
            return user

    async def create_api_token(self, user_id: str, name: str) -> dict[str, str]:
        token = f"{API_TOKEN_PREFIX}{random_token(40)}"
        token_id = new_id()
        prefix = token[:10]
        async with self._db.session() as s, s.begin():
            s.add(ApiToken(id=token_id, user_id=user_id, name=name, token_hash=sha256(token), prefix=prefix))
        return {"id": token_id, "token": token, "prefix": prefix}


def require(user: User | None) -> User:
    if user is None:
        raise unauthorized()
    return user
