from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from .models import Base

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


class Database:
    """Owns the engine and session factory. PostgreSQL in production, SQLite for zero-setup installs."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.kind = "postgres" if url.startswith("postgresql") else "sqlite"
        kwargs: dict[str, object] = {}
        if self.kind == "sqlite":
            kwargs["connect_args"] = {"check_same_thread": False}
            if ":memory:" in url:
                kwargs["poolclass"] = StaticPool
        else:
            kwargs.update(pool_size=10, pool_pre_ping=True)
        self.engine: AsyncEngine = create_async_engine(url, **kwargs)
        if self.kind == "sqlite":
            event.listen(self.engine.sync_engine, "connect", _sqlite_pragmas)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> AsyncSession:
        return self.sessions()

    async def migrate(self) -> None:
        """Brings the schema up to date. In-memory test databases are created directly from the models."""
        if ":memory:" in self.url:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        async with self.engine.begin() as conn:
            await conn.run_sync(_run_alembic_upgrade)

    async def close(self) -> None:
        await self.engine.dispose()


def _sqlite_pragmas(dbapi_connection: object, _record: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def alembic_config() -> AlembicConfig:
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    return cfg


def _run_alembic_upgrade(connection: object) -> None:
    cfg = alembic_config()
    cfg.attributes["connection"] = connection
    command.upgrade(cfg, "head")
