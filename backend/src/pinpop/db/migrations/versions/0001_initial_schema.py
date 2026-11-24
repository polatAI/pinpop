"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-25 02:56:28.532660
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

import pinpop.db.models

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:

    op.create_table(
        "users",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("github_id", sa.Text(), nullable=True),
        sa.Column("google_id", sa.Text(), nullable=True),
        sa.Column(
            "ai_settings",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("created_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("github_id"),
        sa.UniqueConstraint("google_id"),
    )
    op.create_table(
        "ai_usage",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("day", sa.String(length=10), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "day"),
    )
    op.create_table(
        "api_tokens",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("prefix", sa.Text(), nullable=False),
        sa.Column("last_used_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=True),
        sa.Column("created_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.create_index("api_tokens_user_idx", ["user_id"], unique=False)

    op.create_table(
        "quizzes",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("owner_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("visibility", sa.String(length=16), nullable=False),
        sa.Column(
            "tags",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("cover_image", sa.Text(), nullable=True),
        sa.Column(
            "questions",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("play_count", sa.Integer(), nullable=False),
        sa.Column("forked_from", sa.Text(), nullable=True),
        sa.Column("created_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.create_index("quizzes_owner_idx", ["owner_id"], unique=False)
        batch_op.create_index("quizzes_visibility_idx", ["visibility"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("expires_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index("sessions_user_idx", ["user_id"], unique=False)

    op.create_table(
        "assignments",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("quiz_id", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column(
            "questions",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "settings",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("deadline", pinpop.db.models.UtcDateTime(timezone=True), nullable=True),
        sa.Column("closed", sa.Boolean(), nullable=False),
        sa.Column("created_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    with op.batch_alter_table("assignments", schema=None) as batch_op:
        batch_op.create_index("assignments_owner_idx", ["owner_id"], unique=False)

    op.create_table(
        "games",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("quiz_id", sa.Text(), nullable=True),
        sa.Column("host_id", sa.Text(), nullable=False),
        sa.Column("quiz_title", sa.Text(), nullable=False),
        sa.Column("pin", sa.String(length=6), nullable=False),
        sa.Column(
            "settings",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "questions",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "players",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("player_count", sa.Integer(), nullable=False),
        sa.Column("started_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.Column("ended_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.create_index("games_host_idx", ["host_id"], unique=False)

    op.create_table(
        "assignment_attempts",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("assignment_id", sa.Text(), nullable=False),
        sa.Column("nickname", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column(
            "order",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column(
            "answers",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.Column("current_index", sa.Integer(), nullable=False),
        sa.Column(
            "current_started_at",
            pinpop.db.models.UtcDateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("started_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=False),
        sa.Column("finished_at", pinpop.db.models.UtcDateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("assignment_attempts", schema=None) as batch_op:
        batch_op.create_index("attempts_assignment_idx", ["assignment_id"], unique=False)


def downgrade() -> None:

    with op.batch_alter_table("assignment_attempts", schema=None) as batch_op:
        batch_op.drop_index("attempts_assignment_idx")

    op.drop_table("assignment_attempts")
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.drop_index("games_host_idx")

    op.drop_table("games")
    with op.batch_alter_table("assignments", schema=None) as batch_op:
        batch_op.drop_index("assignments_owner_idx")

    op.drop_table("assignments")
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index("sessions_user_idx")

    op.drop_table("sessions")
    with op.batch_alter_table("quizzes", schema=None) as batch_op:
        batch_op.drop_index("quizzes_visibility_idx")
        batch_op.drop_index("quizzes_owner_idx")

    op.drop_table("quizzes")
    with op.batch_alter_table("api_tokens", schema=None) as batch_op:
        batch_op.drop_index("api_tokens_user_idx")

    op.drop_table("api_tokens")
    op.drop_table("ai_usage")
    op.drop_table("users")
