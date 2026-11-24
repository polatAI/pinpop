from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class UtcDateTime(TypeDecorator[datetime]):
    """Timezone-aware timestamps on every backend (SQLite drops the offset otherwise)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


#: JSONB on PostgreSQL, JSON text on SQLite.
Json = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default="user")
    locale: Mapped[str] = mapped_column(String(10), default="en")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    github_id: Mapped[str | None] = mapped_column(Text, unique=True)
    google_id: Mapped[str | None] = mapped_column(Text, unique=True)
    #: {provider, model?, baseUrl?, apiKeyEnc?}; the key is AES-GCM encrypted with APP_SECRET.
    ai_settings: Mapped[dict[str, Any] | None] = mapped_column(Json)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("sessions_user_idx", "user_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class ApiToken(Base):
    __tablename__ = "api_tokens"
    __table_args__ = (Index("api_tokens_user_idx", "user_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    prefix: Mapped[str] = mapped_column(Text)
    last_used_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class Quiz(Base):
    __tablename__ = "quizzes"
    __table_args__ = (Index("quizzes_owner_idx", "owner_id"), Index("quizzes_visibility_idx", "visibility"))

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(10), default="en")
    visibility: Mapped[str] = mapped_column(String(16), default="private")
    tags: Mapped[list[str]] = mapped_column(Json, default=list)
    cover_image: Mapped[str | None] = mapped_column(Text)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(Json, default=list)
    play_count: Mapped[int] = mapped_column(Integer, default=0)
    forked_from: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class Game(Base):
    """A finished live game, kept as a report."""

    __tablename__ = "games"
    __table_args__ = (Index("games_host_idx", "host_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    quiz_id: Mapped[str | None] = mapped_column(ForeignKey("quizzes.id", ondelete="SET NULL"))
    host_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    quiz_title: Mapped[str] = mapped_column(Text)
    pin: Mapped[str] = mapped_column(String(6))
    settings: Mapped[dict[str, Any]] = mapped_column(Json)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(Json)
    players: Mapped[list[dict[str, Any]]] = mapped_column(Json)
    player_count: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(UtcDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UtcDateTime)


class AiUsage(Base):
    __tablename__ = "ai_usage"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class Assignment(Base):
    """Self-paced "homework" game played individually through a share link."""

    __tablename__ = "assignments"
    __table_args__ = (Index("assignments_owner_idx", "owner_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    quiz_id: Mapped[str | None] = mapped_column(ForeignKey("quizzes.id", ondelete="SET NULL"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(Json)
    #: {shuffleQuestions, shuffleAnswers, showAnswers}
    settings: Mapped[dict[str, Any]] = mapped_column(Json)
    deadline: Mapped[datetime | None] = mapped_column(UtcDateTime)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class AssignmentAttempt(Base):
    __tablename__ = "assignment_attempts"
    __table_args__ = (Index("attempts_assignment_idx", "assignment_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"))
    nickname: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text)
    #: Per-attempt question order (indexes into the assignment questions).
    order: Mapped[list[int]] = mapped_column(Json)
    answers: Mapped[list[dict[str, Any]]] = mapped_column(Json, default=list)
    score: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    #: When the current question was served; None until the student asks for it.
    current_started_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    started_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
