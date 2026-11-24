from __future__ import annotations

import asyncio
import contextlib
import os
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import httpx
import pytest
import uvicorn
from asgi_lifespan import LifespanManager
from sqlalchemy import text

from pinpop.app import Pinpop
from pinpop.config import Settings


def make_settings(tmp_path: Path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "ENV": "test",
        "DATA_DIR": tmp_path,
        "APP_SECRET": "test-secret",
        # CI also runs the suite against PostgreSQL; locally a temporary SQLite file is migrated with Alembic.
        "DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        "PUBLIC_URL": "http://localhost:3000",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def settings_factory(tmp_path: Path) -> Callable[..., Settings]:
    return lambda **overrides: make_settings(tmp_path, **overrides)


@contextlib.asynccontextmanager
async def running(app: Pinpop) -> AsyncIterator[httpx.AsyncClient]:
    async with LifespanManager(app.api):
        if os.environ.get("TEST_DATABASE_URL"):
            await _reset_postgres(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost:3000") as client:
            yield client


async def _reset_postgres(app: Pinpop) -> None:
    async with app.db.engine.begin() as conn:
        await conn.execute(text("TRUNCATE users, quizzes, games, assignments CASCADE"))


@pytest.fixture
async def app(settings_factory: Callable[..., Settings]) -> AsyncIterator[Pinpop]:
    pinpop = Pinpop(settings_factory())
    if os.environ.get("TEST_DATABASE_URL"):
        await pinpop.db.migrate()
        await _reset_postgres(pinpop)
    yield pinpop


@pytest.fixture
async def client(app: Pinpop) -> AsyncIterator[httpx.AsyncClient]:
    async with running(app) as c:
        yield c


async def register(client: httpx.AsyncClient, name: str = "Ada", email: str = "ada@example.com") -> dict[str, object]:
    res = await client.post("/api/auth/register", json={"name": name, "email": email, "password": "supersecret"})
    assert res.status_code == 200, res.text
    return res.json()["user"]


@contextlib.asynccontextmanager
async def live_server(app: Pinpop) -> AsyncIterator[str]:
    """Runs the app on a real port so Socket.IO clients can connect."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task
