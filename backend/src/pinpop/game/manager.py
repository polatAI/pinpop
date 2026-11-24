from __future__ import annotations

import asyncio
import contextlib
import secrets
from collections.abc import Callable

from ..domain.game import GameSettings
from ..domain.quiz import Question
from .engine import Clock, FinishedGame, Game, GameIO, SystemClock

LOBBY_IDLE_MS = 2 * 60 * 60 * 1000
GAME_IDLE_MS = 60 * 60 * 1000
FINISHED_TTL_MS = 30 * 60 * 1000
SWEEP_INTERVAL_S = 60


class TooManyGamesError(Exception):
    pass


class GameManager:
    """Holds all live games in memory and garbage collects abandoned ones."""

    def __init__(
        self,
        *,
        max_players: int,
        max_games: int,
        create_io: Callable[[str], GameIO],
        on_finish: Callable[[FinishedGame], None],
        clock: Clock | None = None,
    ) -> None:
        self._max_players = max_players
        self._max_games = max_games
        self._create_io = create_io
        self._on_finish = on_finish
        self._clock = clock or SystemClock()
        self._games: dict[str, Game] = {}
        self._sweeper: asyncio.Task[None] | None = None

    def start_sweeper(self) -> None:
        if self._sweeper is None:
            self._sweeper = asyncio.create_task(self._sweep_forever())

    async def _sweep_forever(self) -> None:
        while True:
            await asyncio.sleep(SWEEP_INTERVAL_S)
            self.sweep()

    async def stop(self) -> None:
        if self._sweeper:
            self._sweeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweeper
            self._sweeper = None
        for game in self._games.values():
            game.dispose()
        self._games.clear()

    def create(
        self, *, quiz_id: str, quiz_title: str, owner_id: str, questions: list[Question], settings: GameSettings
    ) -> Game:
        if len(self._games) >= self._max_games:
            raise TooManyGamesError
        pin = self._generate_pin()
        game = Game(
            pin=pin,
            quiz_id=quiz_id,
            quiz_title=quiz_title,
            owner_id=owner_id,
            questions=questions,
            settings=settings,
            max_players=self._max_players,
            io=self._create_io(pin),
            on_finish=self._on_finish,
            clock=self._clock,
        )
        self._games[pin] = game
        return game

    def get(self, pin: str) -> Game | None:
        return self._games.get("".join(pin.split()))

    def remove(self, pin: str) -> None:
        game = self._games.pop(pin, None)
        if game:
            game.dispose()

    def __len__(self) -> int:
        return len(self._games)

    def sweep(self, now: float | None = None) -> None:
        now = self._clock.now() if now is None else now
        for pin, game in list(self._games.items()):
            limit = {"lobby": LOBBY_IDLE_MS, "podium": FINISHED_TTL_MS}.get(game.phase, GAME_IDLE_MS)
            if now - game.last_activity > limit:
                game.expire()
                self.remove(pin)

    def _generate_pin(self) -> str:
        for _ in range(100):
            pin = str(100_000 + secrets.randbelow(900_000))
            if pin not in self._games:
                return pin
        raise TooManyGamesError
