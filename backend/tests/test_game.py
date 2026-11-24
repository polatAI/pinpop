from __future__ import annotations

import itertools
from collections.abc import Callable
from typing import Any

import pytest

from pinpop.domain.game import GameErrors, GameSettings
from pinpop.domain.quiz import question_adapter
from pinpop.domain.scoring import answer_adapter
from pinpop.game.engine import FinishedGame, Game, GameError


class FakeClock:
    def __init__(self) -> None:
        self.t = 1_000_000.0
        self._timers: list[tuple[float, int, Callable[[], None]]] = []
        self._seq = itertools.count()

    def now(self) -> float:
        return self.t

    def set_timeout(self, fn: Callable[[], None], ms: float) -> object:
        handle = next(self._seq)
        self._timers.append((self.t + ms, handle, fn))
        return handle

    def clear_timeout(self, handle: object) -> None:
        self._timers = [t for t in self._timers if t[1] != handle]

    def advance(self, ms: float) -> None:
        target = self.t + ms
        while True:
            self._timers.sort(key=lambda t: (t[0], t[1]))
            if not self._timers or self._timers[0][0] > target:
                break
            at, _, fn = self._timers.pop(0)
            self.t = at
            fn()
        self.t = target


class RecordingIO:
    def __init__(self) -> None:
        self.host_views: list[dict[str, Any]] = []
        self.player_views: dict[str, dict[str, Any]] = {}
        self.kicked_sids: list[str] = []
        self.ended_reasons: list[str] = []

    def host(self, view: dict[str, Any]) -> None:
        self.host_views.append(view)

    def player(self, sid: str, view: dict[str, Any]) -> None:
        self.player_views[sid] = view

    def kicked(self, sid: str) -> None:
        self.kicked_sids.append(sid)

    def ended(self, reason: str) -> None:
        self.ended_reasons.append(reason)

    @property
    def last_host(self) -> dict[str, Any]:
        return self.host_views[-1]


QUESTIONS = [
    question_adapter.validate_python(
        {
            "id": "q1",
            "type": "quiz",
            "text": "2 + 2?",
            "timeLimit": 10,
            "choices": [{"id": "a", "text": "3"}, {"id": "b", "text": "4", "correct": True}],
        }
    ),
    question_adapter.validate_python(
        {"id": "q2", "type": "truefalse", "text": "Sky is blue", "timeLimit": 10, "correct": True}
    ),
]


def answer(**data: Any) -> Any:
    return answer_adapter.validate_python(data)


@pytest.fixture
def env() -> tuple[Game, FakeClock, RecordingIO, list[FinishedGame]]:
    clock, io, finished = FakeClock(), RecordingIO(), []
    game = Game(
        pin="123456",
        quiz_id="quiz",
        quiz_title="Test",
        owner_id="owner",
        questions=QUESTIONS,
        settings=GameSettings(read_seconds=2),
        max_players=3,
        io=io,
        on_finish=finished.append,
        clock=clock,
    )
    return game, clock, io, finished


def test_runs_a_full_game_with_scoring_and_a_podium(env: Any) -> None:
    game, clock, io, finished = env
    game.join("s1", "Ada")
    game.join("s2", "Grace")
    game.start()
    assert io.last_host["phase"] == "intro"
    clock.advance(2000)
    assert io.last_host["phase"] == "question"
    assert "correct" not in str(io.player_views["s1"]["question"])

    clock.advance(1000)
    game.answer("s1", 0, answer(type="quiz", choiceId="b"))
    clock.advance(4000)
    game.answer("s2", 0, answer(type="quiz", choiceId="a"))
    # Everyone answered, so the question closes early.
    assert io.last_host["phase"] == "reveal"
    assert io.last_host["stats"]["counts"] == {"a": 1, "b": 1}
    ada = io.player_views["s1"]
    assert ada["result"]["correct"] is True
    assert ada["result"]["points"] == 950
    assert io.player_views["s2"]["result"]["points"] == 0

    game.next()
    assert io.last_host["phase"] == "leaderboard"
    assert io.last_host["leaderboard"][0]["nickname"] == "Ada"
    game.next()
    clock.advance(2000)
    game.answer("s1", 1, answer(type="truefalse", value=True))
    game.answer("s2", 1, answer(type="truefalse", value=True))
    assert io.player_views["s1"]["result"]["streak"] == 2
    game.next()
    assert io.last_host["phase"] == "podium"
    assert len(finished) == 1
    report = finished[0]
    assert [p["nickname"] for p in report.players] == ["Ada", "Grace"]
    assert report.players[0]["correctCount"] == 2
    assert report.players[0]["answers"][0]["timeMs"] == 1000


def test_validates_nicknames_and_capacity(env: Any) -> None:
    game, *_ = env
    game.join("s1", "Ada")
    with pytest.raises(GameError, match=GameErrors.NICKNAME_TAKEN):
        game.join("s2", " ada ")
    with pytest.raises(GameError, match=GameErrors.NICKNAME_INVALID):
        game.join("s2", "   ")
    with pytest.raises(GameError, match=GameErrors.NICKNAME_INAPPROPRIATE):
        game.join("s2", "f.u.c.k")
    game.join("s2", "Grace")
    game.join("s3", "Linus")
    with pytest.raises(GameError, match=GameErrors.FULL):
        game.join("s4", "Alan")


def test_lets_players_reconnect_and_keeps_kicked_players_out(env: Any) -> None:
    game, _clock, io, _ = env
    joined = game.join("s1", "Ada")
    game.join("s2", "Grace")
    game.start()
    game.disconnect("s1")
    again = game.join("s9", "", player_token=joined["playerToken"])
    assert again["playerId"] == joined["playerId"]
    grace = game.player_by_sid("s2")
    assert grace is not None
    game.kick(grace.id)
    assert io.kicked_sids == ["s2"]
    with pytest.raises(GameError, match=GameErrors.NOT_ALLOWED):
        game.join("s3", "Grace", player_token=grace.token)


def test_rejects_late_duplicate_and_malformed_answers(env: Any) -> None:
    game, clock, *_ = env
    game.join("s1", "Ada")
    game.join("s2", "Grace")
    game.start()
    with pytest.raises(GameError, match=GameErrors.TOO_LATE):
        game.answer("s1", 0, answer(type="quiz", choiceId="b"))
    clock.advance(2000)
    with pytest.raises(GameError, match=GameErrors.INVALID_ANSWER):
        game.answer("s1", 0, answer(type="quiz", choiceId="zzz"))
    game.answer("s1", 0, answer(type="quiz", choiceId="b"))
    with pytest.raises(GameError, match=GameErrors.ALREADY_ANSWERED):
        game.answer("s1", 0, answer(type="quiz", choiceId="a"))
    clock.advance(11_000)
    with pytest.raises(GameError, match=GameErrors.TOO_LATE):
        game.answer("s2", 0, answer(type="quiz", choiceId="b"))


def test_pauses_and_resumes_the_question_timer(env: Any) -> None:
    game, clock, io, _ = env
    game.join("s1", "Ada")
    game.start()
    clock.advance(2000)
    clock.advance(4000)
    game.set_paused(True)
    clock.advance(60_000)
    assert io.last_host["phase"] == "question"
    game.set_paused(False)
    clock.advance(5000)
    game.answer("s1", 0, answer(type="quiz", choiceId="b"))
    # 9 s of the 10 s limit used, measured without the pause.
    assert io.player_views["s1"]["result"]["points"] == 550


def test_hides_solutions_from_players_until_reveal(env: Any) -> None:
    game, clock, io, _ = env
    game.join("s1", "Ada")
    game.join("s2", "Grace")
    game.start()
    clock.advance(2000)
    view = io.player_views["s1"]
    assert view["solution"] is None
    assert all("correct" not in c for c in view["question"]["choices"])
    assert io.last_host["solution"] is None
    clock.advance(11_000)
    assert io.last_host["phase"] == "reveal"
    assert io.player_views["s1"]["solution"]["choices"][1]["correct"] is True
