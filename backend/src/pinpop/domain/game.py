from __future__ import annotations

from typing import Literal

from pydantic import Field

from .base import ApiModel


class GameSettings(ApiModel):
    shuffle_questions: bool = False
    shuffle_answers: bool = False
    #: Show question text and answer labels on player devices (not only on the big screen).
    show_question_on_devices: bool = True
    #: Automatically move on after the reveal / leaderboard without host input.
    auto_advance: bool = False
    #: Allow players to join after the game started.
    allow_late_join: bool = True
    #: Seconds the question is shown before answers open.
    read_seconds: int = Field(default=4, ge=0, le=10)
    #: Generate fun random nicknames instead of letting players choose.
    random_nicknames: bool = False


GamePhase = Literal["lobby", "intro", "question", "reveal", "leaderboard", "podium"]


class GameErrors:
    """Game-level error codes returned through socket acks; clients translate them."""

    NOT_FOUND = "game_not_found"
    LOCKED = "game_locked"
    FULL = "game_full"
    STARTED = "game_started"
    NICKNAME_TAKEN = "nickname_taken"
    NICKNAME_INVALID = "nickname_invalid"
    NICKNAME_INAPPROPRIATE = "nickname_inappropriate"
    NOT_ALLOWED = "not_allowed"
    INVALID_ANSWER = "invalid_answer"
    TOO_LATE = "too_late"
    ALREADY_ANSWERED = "already_answered"
    RATE_LIMITED = "rate_limited"
    BAD_REQUEST = "bad_request"


PIN_LENGTH = 6

AVATARS = (
    "🦊", "🐼", "🐸", "🦄", "🐙", "🦁", "🐯", "🐨", "🐵", "🐧",
    "🦉", "🐢", "🦖", "🐳", "🦋", "🐝", "🦩", "🦔", "🐲", "👾",
    "🤖", "👻", "🍕", "🌮", "🍩", "🌵", "🚀", "⚡", "🌈", "🎸",
)  # fmt: skip
