from __future__ import annotations

import asyncio
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from ..domain.game import AVATARS, GameErrors, GamePhase, GameSettings
from ..domain.helpers import random_nickname, sanitize_nickname, shuffle, shuffle_order_items, to_public_question
from ..domain.quiz import SCORED_TYPES, MultiQuestion, PollQuestion, Question, QuizQuestion
from ..domain.scoring import (
    Answer,
    compute_points,
    evaluate_answer,
    is_answer_well_formed,
    normalize_text,
)
from ..profanity import is_inappropriate
from ..security import random_token


class GameError(Exception):
    """An expected game error; the code is sent back to the client."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class GameIO(Protocol):
    def host(self, view: dict[str, Any]) -> None: ...
    def player(self, sid: str, view: dict[str, Any]) -> None: ...
    def kicked(self, sid: str) -> None: ...
    def ended(self, reason: str) -> None: ...


class Clock(Protocol):
    def now(self) -> float:
        """Epoch milliseconds."""
        ...

    def set_timeout(self, fn: Callable[[], None], ms: float) -> object: ...
    def clear_timeout(self, handle: object) -> None: ...


class SystemClock:
    def now(self) -> float:
        return time.time() * 1000

    def set_timeout(self, fn: Callable[[], None], ms: float) -> object:
        return asyncio.get_running_loop().call_later(ms / 1000, fn)

    def clear_timeout(self, handle: object) -> None:
        handle.cancel()  # type: ignore[attr-defined]


@dataclass
class PlayerAnswer:
    answer: Answer
    elapsed_ms: float
    correct: bool | None
    points: int


@dataclass
class PlayerState:
    id: str
    token: str
    nickname: str
    avatar: str
    sid: str | None
    joined_at: float
    score: int = 0
    streak: int = 0
    rank: int | None = None
    previous_rank: int | None = None
    last_points: int = 0
    answers: dict[int, PlayerAnswer] = field(default_factory=dict)


@dataclass
class FinishedGame:
    pin: str
    quiz_id: str
    quiz_title: str
    owner_id: str
    settings: GameSettings
    questions: list[Question]
    players: list[dict[str, Any]]
    started_at: datetime
    ended_at: datetime


REVEAL_AUTO_ADVANCE_MS = 6000
LEADERBOARD_AUTO_ADVANCE_MS = 5000
#: Network latency allowance after the visible deadline.
ANSWER_GRACE_MS = 600
HOST_VIEW_THROTTLE_MS = 200


def _shuffle_choices(q: Question) -> Question:
    if isinstance(q, QuizQuestion | MultiQuestion | PollQuestion):
        return q.model_copy(update={"choices": shuffle(q.choices)})
    return q


class Game:
    """One live game held in memory. All methods are synchronous; I/O goes through `GameIO`."""

    def __init__(
        self,
        *,
        pin: str,
        quiz_id: str,
        quiz_title: str,
        owner_id: str,
        questions: list[Question],
        settings: GameSettings,
        max_players: int,
        io: GameIO,
        on_finish: Callable[[FinishedGame], None],
        clock: Clock,
    ) -> None:
        self.pin = pin
        self.host_token = random_token(32)
        self.quiz_id = quiz_id
        self.quiz_title = quiz_title
        self.owner_id = owner_id
        self.settings = settings
        self._max_players = max_players
        self._io = io
        self._on_finish = on_finish
        self._clock = clock
        self.created_at = clock.now()
        self.last_activity = self.created_at

        if settings.shuffle_questions:
            questions = shuffle(questions)
        if settings.shuffle_answers:
            questions = [_shuffle_choices(q) for q in questions]
        self._questions = questions
        self._public: list[dict[str, Any]] = []
        for q in questions:
            pub = to_public_question(q)
            if pub["type"] == "order":
                pub["items"] = shuffle_order_items(pub["items"])
            self._public.append(pub)

        self._players: dict[str, PlayerState] = {}
        self._banned_tokens: set[str] = set()
        self._phase: GamePhase = "lobby"
        self._locked = False
        self._paused = False
        self._paused_remaining_ms: float | None = None
        self._index = -1
        self._deadline: float | None = None
        self._question_opened_at = 0.0
        self._timer: object | None = None
        self._host_throttle: object | None = None
        self._stats: dict[str, Any] | None = None
        self._started_at: float | None = None
        self._finished_notified = False

    # ---------------------------------------------------------------- players

    def join(
        self, sid: str, nickname: str, avatar: str | None = None, player_token: str | None = None
    ) -> dict[str, str]:
        self._touch()
        if player_token:
            if player_token in self._banned_tokens:
                raise GameError(GameErrors.NOT_ALLOWED)
            existing = next((p for p in self._players.values() if p.token == player_token), None)
            if existing:
                existing.sid = sid
                self.broadcast()
                return {"playerId": existing.id, "playerToken": existing.token}
        if self._locked:
            raise GameError(GameErrors.LOCKED)
        if self._phase == "podium" or (self._phase != "lobby" and not self.settings.allow_late_join):
            raise GameError(GameErrors.STARTED)
        if len(self._players) >= self._max_players:
            raise GameError(GameErrors.FULL)

        name = self._unique_random_nickname() if self.settings.random_nicknames else sanitize_nickname(nickname)
        if not name:
            raise GameError(GameErrors.NICKNAME_INVALID)
        if not self.settings.random_nicknames:
            if is_inappropriate(name):
                raise GameError(GameErrors.NICKNAME_INAPPROPRIATE)
            if self._nickname_taken(name):
                raise GameError(GameErrors.NICKNAME_TAKEN)
        elif self._nickname_taken(name):
            name = f"{name}{len(self._players) + 1}"

        player = PlayerState(
            id=random_token(12),
            token=random_token(32),
            nickname=name,
            avatar=avatar if avatar in AVATARS else random.choice(AVATARS),  # noqa: S311 - not security sensitive
            sid=sid,
            joined_at=self._clock.now(),
        )
        self._players[player.id] = player
        self.broadcast()
        return {"playerId": player.id, "playerToken": player.token}

    def disconnect(self, sid: str) -> None:
        for p in list(self._players.values()):
            if p.sid == sid:
                p.sid = None
                # Players who leave the lobby before the game starts are removed entirely.
                if self._phase == "lobby":
                    del self._players[p.id]
                self._schedule_host_update()

    def leave(self, sid: str) -> None:
        for p in list(self._players.values()):
            if p.sid == sid:
                if self._phase == "lobby":
                    del self._players[p.id]
                else:
                    p.sid = None
        self.broadcast()

    def kick(self, player_id: str) -> None:
        p = self._players.pop(player_id, None)
        if not p:
            return
        self._banned_tokens.add(p.token)
        if p.sid:
            self._io.kicked(p.sid)
        self.broadcast()
        self._maybe_close_early()

    def player_by_sid(self, sid: str) -> PlayerState | None:
        return next((p for p in self._players.values() if p.sid == sid), None)

    @property
    def player_count(self) -> int:
        return len(self._players)

    @property
    def phase(self) -> GamePhase:
        return self._phase

    # ---------------------------------------------------------------- host controls

    def set_locked(self, locked: bool) -> None:
        self._locked = locked
        self.broadcast()

    def set_paused(self, paused: bool) -> None:
        if paused == self._paused:
            return
        now = self._clock.now()
        if paused:
            if self._deadline is not None and self._phase in ("question", "intro"):
                self._paused_remaining_ms = max(0.0, self._deadline - now)
            self._clear_timer()
            self._paused = True
        else:
            self._paused = False
            if self._paused_remaining_ms is not None:
                remaining = self._paused_remaining_ms
                self._paused_remaining_ms = None
                elapsed_before_pause = (self._deadline or 0) - self._question_opened_at - remaining
                self._deadline = now + remaining
                if self._phase == "question":
                    # Shift the opening time so answer speed is measured without the pause.
                    self._question_opened_at = now - elapsed_before_pause
                    self._set_timer(self._reveal, remaining + ANSWER_GRACE_MS)
                else:
                    self._set_timer(self._open_question, remaining)
            else:
                self._schedule_auto_advance()
        self.broadcast()

    def start(self) -> None:
        if self._phase != "lobby":
            raise GameError(GameErrors.STARTED)
        if not self._players or not self._questions:
            raise GameError(GameErrors.BAD_REQUEST)
        self._started_at = self._clock.now()
        self._show_intro(0)

    def next(self) -> None:
        """Advances to whatever comes next from the current phase."""
        self._touch()
        self._paused = False
        match self._phase:
            case "lobby":
                self.start()
            case "intro":
                self._open_question()
            case "question":
                self._reveal()
            case "reveal":
                if self._index >= len(self._questions) - 1:
                    self._show_podium()
                else:
                    self._show_leaderboard()
            case "leaderboard":
                self._show_intro(self._index + 1)
            case "podium":
                pass

    def end(self) -> None:
        self._clear_timer()
        if self._started_at is not None and self._index >= 0:
            self._notify_finished()
        self._io.ended("host-ended")

    def expire(self) -> None:
        """Called by the manager when a game is garbage collected."""
        self._clear_timer()
        if self._started_at is not None and self._phase != "lobby":
            self._notify_finished()
        self._io.ended("expired")

    def dispose(self) -> None:
        self._clear_timer()
        if self._host_throttle is not None:
            self._clock.clear_timeout(self._host_throttle)
            self._host_throttle = None

    # ---------------------------------------------------------------- answers

    def answer(self, sid: str, question_index: int, answer: Answer) -> None:
        player = self.player_by_sid(sid)
        if not player:
            raise GameError(GameErrors.NOT_ALLOWED)
        if self._phase != "question" or question_index != self._index or self._paused:
            raise GameError(GameErrors.TOO_LATE)
        now = self._clock.now()
        if self._deadline is not None and now > self._deadline + ANSWER_GRACE_MS:
            raise GameError(GameErrors.TOO_LATE)
        if self._index in player.answers:
            raise GameError(GameErrors.ALREADY_ANSWERED)

        question = self._questions[self._index]
        if not is_answer_well_formed(question, answer):
            raise GameError(GameErrors.INVALID_ANSWER)

        elapsed_ms = max(0.0, now - self._question_opened_at)
        evaluation = evaluate_answer(question, answer)
        scored = question.type in SCORED_TYPES
        next_streak = (player.streak + 1 if evaluation.correct else 0) if scored else player.streak
        points = compute_points(
            question, evaluation, elapsed_ms=elapsed_ms, time_limit_ms=question.time_limit * 1000, streak=next_streak
        )
        player.answers[self._index] = PlayerAnswer(answer, elapsed_ms, evaluation.correct, points)
        self._touch()

        self._send_player(player)
        self._schedule_host_update()
        self._maybe_close_early()

    # ---------------------------------------------------------------- phase transitions

    def _show_intro(self, index: int) -> None:
        self._clear_timer()
        self._index = index
        self._stats = None
        read = self.settings.read_seconds
        if read <= 0:
            self._open_question()
            return
        self._phase = "intro"
        self._deadline = self._clock.now() + read * 1000
        self._set_timer(self._open_question, read * 1000)
        self.broadcast()

    def _open_question(self) -> None:
        self._clear_timer()
        question = self._questions[self._index]
        self._phase = "question"
        self._question_opened_at = self._clock.now()
        self._deadline = self._question_opened_at + question.time_limit * 1000
        self._set_timer(self._reveal, question.time_limit * 1000 + ANSWER_GRACE_MS)
        self.broadcast()

    def _reveal(self) -> None:
        if self._phase != "question":
            return
        self._clear_timer()
        question = self._questions[self._index]
        scored = question.type in SCORED_TYPES
        for p in self._players.values():
            a = p.answers.get(self._index)
            if a:
                p.score += a.points
                p.last_points = a.points
                if scored:
                    p.streak = p.streak + 1 if a.correct else 0
            else:
                p.last_points = 0
                if scored:
                    p.streak = 0
        self._recompute_ranks()
        self._stats = self._compute_stats(question)
        self._phase = "reveal"
        self._deadline = None
        self.broadcast()
        self._schedule_auto_advance()

    def _show_leaderboard(self) -> None:
        self._clear_timer()
        self._phase = "leaderboard"
        self.broadcast()
        self._schedule_auto_advance()

    def _show_podium(self) -> None:
        self._clear_timer()
        self._phase = "podium"
        self._deadline = None
        self.broadcast()
        self._notify_finished()

    def _schedule_auto_advance(self) -> None:
        if not self.settings.auto_advance or self._paused:
            return
        if self._phase == "reveal":
            self._set_timer(self.next, REVEAL_AUTO_ADVANCE_MS)
        elif self._phase == "leaderboard":
            self._set_timer(self.next, LEADERBOARD_AUTO_ADVANCE_MS)

    def _maybe_close_early(self) -> None:
        """Ends the question early once every connected player has answered."""
        if self._phase != "question":
            return
        active = [p for p in self._players.values() if p.sid is not None]
        if active and all(self._index in p.answers for p in active):
            self._reveal()

    def _recompute_ranks(self) -> None:
        ordered = sorted(self._players.values(), key=lambda p: (-p.score, p.joined_at))
        last_score: int | None = None
        last_rank = 0
        for i, p in enumerate(ordered):
            p.previous_rank = p.rank
            if p.score != last_score:
                last_rank = i + 1
                last_score = p.score
            p.rank = last_rank

    def _compute_stats(self, question: Question) -> dict[str, Any]:
        answers = [a for p in self._players.values() if (a := p.answers.get(self._index))]
        stats: dict[str, Any] = {
            "answeredCount": len(answers),
            "correctCount": sum(1 for a in answers if a.correct is True),
        }
        match question.type:
            case "quiz" | "poll" | "multi":
                counts = {c.id: 0 for c in question.choices}
                for a in answers:
                    ids = getattr(a.answer, "choice_ids", None) or [getattr(a.answer, "choice_id", None)]
                    for choice_id in ids:
                        if choice_id is not None:
                            counts[choice_id] = counts.get(choice_id, 0) + 1
                stats["counts"] = counts
            case "truefalse":
                tf = {"true": 0, "false": 0}
                for a in answers:
                    tf["true" if getattr(a.answer, "value", False) else "false"] += 1
                stats["counts"] = tf
            case "type" | "wordcloud":
                words: dict[str, dict[str, Any]] = {}
                for a in answers:
                    text = getattr(a.answer, "text", "")
                    key = normalize_text(text)
                    if not key:
                        continue
                    entry = words.setdefault(key, {"text": text.strip()[:40], "count": 0})
                    entry["count"] += 1
                stats["words"] = sorted(words.values(), key=lambda w: -w["count"])[:60]
            case "slider":
                stats["values"] = [a.answer.value for a in answers]  # type: ignore[union-attr]
        return stats

    def _notify_finished(self) -> None:
        if self._finished_notified:
            return
        self._finished_notified = True
        answered = len(self._questions) if self._phase == "podium" else self._index + 1
        big = 2**53
        players = []
        for p in sorted(self._players.values(), key=lambda p: p.rank if p.rank is not None else big):
            rows = []
            for i in range(answered):
                a = p.answers.get(i)
                rows.append(
                    {
                        "questionIndex": i,
                        "correct": a.correct if a else None,
                        "points": a.points if a else 0,
                        "timeMs": round(a.elapsed_ms) if a else None,
                        "answer": a.answer.dump() if a else None,
                    }
                )
            players.append(
                {
                    "nickname": p.nickname,
                    "avatar": p.avatar,
                    "score": p.score,
                    "rank": p.rank if p.rank is not None else len(self._players),
                    "correctCount": sum(1 for a in p.answers.values() if a.correct is True),
                    "answers": rows,
                }
            )
        self._on_finish(
            FinishedGame(
                pin=self.pin,
                quiz_id=self.quiz_id,
                quiz_title=self.quiz_title,
                owner_id=self.owner_id,
                settings=self.settings,
                questions=self._questions[:answered],
                players=players,
                started_at=datetime.fromtimestamp((self._started_at or self.created_at) / 1000, UTC),
                ended_at=datetime.fromtimestamp(self._clock.now() / 1000, UTC),
            )
        )

    # ---------------------------------------------------------------- views

    def _revealed(self) -> bool:
        return self._phase in ("reveal", "leaderboard", "podium")

    def host_view(self) -> dict[str, Any]:
        revealed = self._revealed()
        has_question = self._index >= 0
        leaderboard_size = 50 if self._phase == "podium" else 10
        return {
            "role": "host",
            "pin": self.pin,
            "phase": self._phase,
            "quizTitle": self.quiz_title,
            "settings": self.settings.dump(),
            "locked": self._locked,
            "players": [
                {"id": p.id, "nickname": p.nickname, "avatar": p.avatar, "connected": p.sid is not None}
                for p in self._players.values()
            ],
            "questionIndex": self._index,
            "totalQuestions": len(self._questions),
            "question": self._public[self._index] if has_question else None,
            "solution": self._questions[self._index].dump() if revealed and has_question else None,
            "deadline": self._deadline,
            "answeredCount": self._count_answers(self._index) if has_question else 0,
            "stats": self._stats if revealed else None,
            "leaderboard": [] if self._phase == "lobby" else self._leaderboard(leaderboard_size),
            "serverNow": self._clock.now(),
            "paused": self._paused,
        }

    def player_view(self, player: PlayerState) -> dict[str, Any]:
        revealed = self._revealed()
        has_question = self._index >= 0
        mine = player.answers.get(self._index)
        result = None
        if revealed and has_question:
            scored = self._questions[self._index].type in SCORED_TYPES
            result = {
                "correct": mine.correct if mine else (False if scored else None),
                "points": mine.points if mine else 0,
                "streak": player.streak,
                "rank": player.rank if player.rank is not None else len(self._players),
            }
        show_question = has_question and self._phase not in ("lobby", "podium")
        return {
            "role": "player",
            "pin": self.pin,
            "phase": self._phase,
            "quizTitle": self.quiz_title,
            "me": {
                "id": player.id,
                "nickname": player.nickname,
                "avatar": player.avatar,
                "score": player.score,
                "rank": player.rank,
                "streak": player.streak,
            },
            "playerCount": len(self._players),
            "questionIndex": self._index,
            "totalQuestions": len(self._questions),
            "question": self._public[self._index] if show_question else None,
            "showQuestionOnDevices": self.settings.show_question_on_devices,
            "deadline": self._deadline,
            "answered": mine is not None,
            "myAnswer": mine.answer.dump() if mine else None,
            "result": result,
            "solution": self._questions[self._index].dump() if revealed and has_question else None,
            "leaderboard": self._leaderboard(5) if self._phase in ("leaderboard", "podium") else [],
            "serverNow": self._clock.now(),
            "paused": self._paused,
        }

    def _leaderboard(self, limit: int) -> list[dict[str, Any]]:
        ranked = sorted((p for p in self._players.values() if p.rank is not None), key=lambda p: (p.rank, p.joined_at))
        return [
            {
                "playerId": p.id,
                "nickname": p.nickname,
                "avatar": p.avatar,
                "score": p.score,
                "rank": p.rank or 0,
                "previousRank": p.previous_rank,
                "lastPoints": p.last_points,
                "streak": p.streak,
            }
            for p in ranked[:limit]
        ]

    def _count_answers(self, index: int) -> int:
        return sum(1 for p in self._players.values() if index in p.answers)

    def broadcast(self) -> None:
        """Sends fresh views to the host and every connected player."""
        if self._host_throttle is not None:
            self._clock.clear_timeout(self._host_throttle)
            self._host_throttle = None
        self._io.host(self.host_view())
        for p in self._players.values():
            self._send_player(p)

    def _send_player(self, p: PlayerState) -> None:
        if p.sid:
            self._io.player(p.sid, self.player_view(p))

    def _schedule_host_update(self) -> None:
        """Coalesces frequent host updates (answer counters) into one emit per interval."""
        if self._host_throttle is not None:
            return

        def flush() -> None:
            self._host_throttle = None
            self._io.host(self.host_view())

        self._host_throttle = self._clock.set_timeout(flush, HOST_VIEW_THROTTLE_MS)

    def _nickname_taken(self, nickname: str) -> bool:
        key = normalize_text(nickname)
        return any(normalize_text(p.nickname) == key for p in self._players.values())

    def _unique_random_nickname(self) -> str:
        for _ in range(20):
            name = random_nickname()
            if not self._nickname_taken(name):
                return name
        return random_nickname()

    def _set_timer(self, fn: Callable[[], None], ms: float) -> None:
        self._clear_timer()

        def fire() -> None:
            self._timer = None
            fn()

        self._timer = self._clock.set_timeout(fire, ms)

    def _clear_timer(self) -> None:
        if self._timer is not None:
            self._clock.clear_timeout(self._timer)
            self._timer = None

    def _touch(self) -> None:
        self.last_activity = self._clock.now()
