from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import socketio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Receive, Scope, Send

from . import __version__
from .ai.service import AiService
from .config import Settings
from .db.database import Database
from .deps import AppContext
from .errors import HttpError
from .game.engine import FinishedGame
from .game.manager import GameManager
from .game.sockets import create_io, register_game_sockets
from .mcp.remote import McpEndpoint
from .routes import account, ai, assignments, auth, games, quizzes, uploads
from .services.assignments import AssignmentService
from .services.auth import AuthService
from .services.quizzes import QuizService
from .services.reports import ReportService

log = logging.getLogger("pinpop")

API_DESCRIPTION = (
    "REST API of Pinpop. Authenticate with a session cookie or an API token: `Authorization: Bearer pp_…`."
)
SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"x-frame-options", b"SAMEORIGIN"),
]


def find_web_dist(settings: Settings) -> Path | None:
    if settings.WEB_DIST:
        return settings.WEB_DIST.resolve()
    here = Path(__file__).resolve().parent
    candidates = [here / "web", here.parents[2] / "frontend" / "dist", Path.cwd() / "frontend" / "dist"]
    return next((d for d in candidates if (d / "index.html").exists()), None)


class Pinpop:
    """The whole server as one ASGI app: Socket.IO at /socket.io, MCP at /mcp, everything else FastAPI."""

    def __init__(self, settings: Settings, *, database: Database | None = None) -> None:
        self.settings = settings
        self.db = database or Database(settings.database_url)
        self._owns_db = database is None
        self.sio = socketio.AsyncServer(
            async_mode="asgi",
            cors_allowed_origins="*",
            ping_interval=10,
            ping_timeout=8,
            max_http_buffer_size=64 * 1024,
        )
        self.reports = ReportService(self.db)
        quizzes = QuizService(self.db)
        self._pending: set[asyncio.Task[Any]] = set()
        self.games = GameManager(
            max_players=settings.MAX_PLAYERS,
            max_games=settings.MAX_GAMES,
            create_io=create_io(self.sio),
            on_finish=self._save_report,
        )
        register_game_sockets(self.sio, self.games)
        auth_service = AuthService(self.db, secure_cookies=settings.secure_cookies)
        self.ctx = AppContext(
            settings=settings,
            db=self.db,
            sio=self.sio,
            auth=auth_service,
            games=self.games,
            ai=AiService(settings, self.db),
            quizzes=quizzes,
            reports=self.reports,
            assignments=AssignmentService(self.db, quizzes, settings.public_url),
        )
        self.api = self._build_api()
        self.mcp = McpEndpoint(self.api, auth_service, __version__)
        self._asgi = socketio.ASGIApp(self.sio, other_asgi_app=self._route, socketio_path="socket.io")

    def _save_report(self, game: FinishedGame) -> None:
        if not game.players:
            return
        task = asyncio.get_running_loop().create_task(self.reports.save(game))
        self._pending.add(task)

        def done(t: asyncio.Task[Any]) -> None:
            self._pending.discard(t)
            if not t.cancelled() and t.exception():
                log.error("failed to save game report", exc_info=t.exception())

        task.add_done_callback(done)

    async def _route(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] in ("/mcp", "/mcp/"):
            await self.mcp(scope, receive, _with_security_headers(send))
            return
        await self.api(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self._asgi(scope, receive, send)

    @asynccontextmanager
    async def lifespan(self, _: FastAPI) -> AsyncIterator[None]:
        await self.db.migrate()
        log.info("Database: %s", self.db.kind)
        self.games.start_sweeper()
        async with self.mcp.session_manager.run():
            yield
        await self.games.stop()
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)
        if self._owns_db:
            await self.db.close()

    def _build_api(self) -> FastAPI:
        app = FastAPI(
            title="Pinpop API",
            description=API_DESCRIPTION,
            version=__version__,
            docs_url="/api/docs",
            redoc_url=None,
            openapi_url="/api/openapi.json",
            lifespan=self.lifespan,
        )
        app.state.ctx = self.ctx
        _install_error_handlers(app)
        app.add_middleware(_SecurityHeaders)
        for module in (auth, account, quizzes, games, assignments, ai, uploads):
            app.include_router(module.router)

        app.mount("/uploads", StaticFiles(directory=self.settings.uploads_dir, check_dir=False), name="uploads")
        web_dist = find_web_dist(self.settings)
        if web_dist:
            _mount_web(app, web_dist)
        return app


class _SecurityHeaders:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await self.app(scope, receive, _with_security_headers(send))


def _with_security_headers(send: Send) -> Send:
    async def wrapped(message: Any) -> None:
        if message["type"] == "http.response.start":
            message = {**message, "headers": [*message.get("headers", []), *SECURITY_HEADERS]}
        await send(message)

    return wrapped


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status)


def _install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def http_error(_: Request, err: HttpError) -> JSONResponse:
        return _error(err.status, err.code, err.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, err: RequestValidationError) -> JSONResponse:
        first = err.errors()[0] if err.errors() else None
        if first is None:
            return _error(400, "validation_error", "Invalid request")
        loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
        message = str(first.get("msg", "Invalid value")).removeprefix("Value error, ")
        return _error(400, "validation_error", f"{'.'.join(loc) or 'body'} {message}")

    @app.exception_handler(StarletteHTTPException)
    async def starlette_error(_: Request, err: StarletteHTTPException) -> JSONResponse:
        codes = {404: "not_found", 405: "method_not_allowed", 413: "file_too_large", 429: "rate_limited"}
        return _error(err.status_code, codes.get(err.status_code, "bad_request"), str(err.detail))

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, err: Exception) -> JSONResponse:
        log.exception("request failed: %s %s", request.method, request.url.path, exc_info=err)
        return _error(500, "internal_error", "Something went wrong")


def _mount_web(app: FastAPI, web_dist: Path) -> None:
    """Serves the built web app with an SPA fallback to index.html."""
    root = web_dist.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    async def web(path: str) -> Any:
        if path.startswith(("api/", "uploads/")) or path == "api":
            return _error(404, "not_found", "Not found")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            immutable = path.startswith("assets/")
            cache = "public, max-age=31536000, immutable" if immutable else "public, max-age=3600"
            return FileResponse(candidate, headers={"cache-control": cache})
        return FileResponse(index, headers={"cache-control": "no-cache"})


def create_app(settings: Settings | None = None) -> Pinpop:
    return Pinpop(settings or Settings())
