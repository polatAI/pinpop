from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Annotated, Any

import socketio
from fastapi import Depends, Request

from . import __version__
from .ai.service import AiService
from .config import Settings
from .db.database import Database
from .db.models import User
from .errors import forbidden, too_many_requests, unauthorized
from .game.manager import GameManager
from .services.assignments import AssignmentService
from .services.auth import AuthService
from .services.quizzes import QuizService
from .services.reports import ReportService


class RateLimiter:
    """In-memory sliding window per client IP and route. Good enough for a single-process server."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}

    def check(self, key: tuple[str, str], max_hits: int, window_s: float) -> bool:
        now = time.monotonic()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] > window_s:
            hits.popleft()
        if len(hits) >= max_hits:
            return False
        hits.append(now)
        if len(self._hits) > 50_000:
            self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < window_s}
        return True


@dataclass
class AppContext:
    settings: Settings
    db: Database
    sio: socketio.AsyncServer
    auth: AuthService
    games: GameManager
    ai: AiService
    quizzes: QuizService
    reports: ReportService
    assignments: AssignmentService
    version: str = __version__
    started_at: float = field(default_factory=time.monotonic)
    limiter: RateLimiter = field(default_factory=RateLimiter)


def get_ctx(request: Request) -> AppContext:
    ctx: AppContext = request.app.state.ctx
    return ctx


Ctx = Annotated[AppContext, Depends(get_ctx)]

_UNSET = object()


async def get_optional_user(request: Request, ctx: Ctx) -> User | None:
    cached = getattr(request.state, "user", _UNSET)
    if cached is _UNSET:
        cached = await ctx.auth.resolve_user(request)
        request.state.user = cached
    return cached  # type: ignore[return-value]


async def get_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise unauthorized()
    return user


async def get_admin(user: Annotated[User, Depends(get_user)]) -> User:
    if user.role != "admin":
        raise forbidden()
    return user


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
CurrentUser = Annotated[User, Depends(get_user)]
AdminUser = Annotated[User, Depends(get_admin)]


def rate_limit(max_hits: int, window_s: float = 60) -> Callable[..., Coroutine[Any, Any, None]]:
    async def dependency(request: Request, ctx: Ctx) -> None:
        client = request.client.host if request.client else "unknown"
        route = request.scope.get("route")
        name = getattr(route, "path", request.url.path)
        if not ctx.limiter.check((client, f"{request.method} {name}"), max_hits, window_s):
            raise too_many_requests()

    return dependency
