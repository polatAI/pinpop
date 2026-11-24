from __future__ import annotations

import os
import secrets
from functools import cached_property
from pathlib import Path
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AiProvider = Literal["anthropic", "openai", "openrouter", "ollama", "openai-compatible"]
AI_PROVIDERS: tuple[str, ...] = ("anthropic", "openai", "openrouter", "ollama", "openai-compatible")


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables and an optional `.env` file."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore", case_sensitive=True)

    ENV: Literal["development", "production", "test"] = "development"
    PORT: int = 3000
    HOST: str = "0.0.0.0"
    PUBLIC_URL: AnyHttpUrl | None = None
    INSTANCE_NAME: str = "Pinpop"
    LOG_LEVEL: Literal["critical", "error", "warning", "info", "debug"] = "info"
    TRUST_PROXY: bool = False

    DATA_DIR: Path = Path("./data")
    DATABASE_URL: str | None = None
    APP_SECRET: str | None = None
    WEB_DIST: Path | None = None

    ALLOW_REGISTRATION: bool = True
    HOSTED_MODE: bool = False
    MAX_PLAYERS: int = Field(default=500, ge=1, le=10_000)
    MAX_GAMES: int = Field(default=1000, ge=1)
    UPLOAD_MAX_MB: float = Field(default=5, ge=1, le=100)

    AI_PROVIDER: AiProvider | None = None
    AI_API_KEY: str | None = None
    AI_MODEL: str | None = None
    AI_BASE_URL: str | None = None
    AI_ALLOW_USER_KEYS: bool = True
    AI_DAILY_LIMIT: int = Field(default=0, ge=0)

    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: str | None = None
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        # `FOO=` in a .env file means "not configured", not an empty string.
        return None if value == "" else value

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _lower_log_level(cls, value: object) -> object:
        return value.lower() if isinstance(value, str) else value

    @cached_property
    def public_url(self) -> str:
        return str(self.PUBLIC_URL or f"http://localhost:{self.PORT}").rstrip("/")

    @cached_property
    def data_dir(self) -> Path:
        path = self.DATA_DIR.resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @cached_property
    def uploads_dir(self) -> Path:
        path = self.data_dir / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @cached_property
    def database_url(self) -> str:
        """SQLAlchemy async URL. Without DATABASE_URL an SQLite file in the data directory is used."""
        url = self.DATABASE_URL
        if not url:
            if self.ENV == "test":
                return "sqlite+aiosqlite:///:memory:"
            return f"sqlite+aiosqlite:///{self.data_dir / 'pinpop.db'}"
        if url.startswith(("postgres://", "postgresql://")):
            return "postgresql+asyncpg://" + url.split("://", 1)[1]
        return url

    @cached_property
    def app_secret(self) -> str:
        return self.APP_SECRET or _load_or_create_secret(self.data_dir, persist=self.ENV != "test")

    @property
    def secure_cookies(self) -> bool:
        return self.public_url.startswith("https://")

    @property
    def github_enabled(self) -> bool:
        return bool(self.GITHUB_CLIENT_ID and self.GITHUB_CLIENT_SECRET)

    @property
    def google_enabled(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)


def _load_or_create_secret(data_dir: Path, *, persist: bool) -> str:
    """Without APP_SECRET a random secret is generated once and kept in the data directory."""
    file = data_dir / ".secret"
    if file.exists():
        return file.read_text().strip()
    secret = secrets.token_hex(32)
    if persist:
        file.write_text(secret)
        os.chmod(file, 0o600)
    return secret
