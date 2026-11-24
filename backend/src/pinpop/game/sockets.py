from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import Callable
from typing import Any

import socketio
from pydantic import BaseModel, Field, ValidationError

from ..domain.game import GameErrors
from ..domain.scoring import Answer
from ..security import safe_equal
from .engine import Game, GameError, GameIO
from .manager import GameManager

log = logging.getLogger("pinpop.sockets")

BUCKET_SIZE = 20
REFILL_PER_SEC = 5


def host_room(pin: str) -> str:
    return f"host:{pin}"


def game_room(pin: str) -> str:
    return f"game:{pin}"


class SocketIO(GameIO):
    """Delivers game events to Socket.IO rooms. Emits are scheduled on the running loop in order."""

    def __init__(self, sio: socketio.AsyncServer, pin: str) -> None:
        self._sio = sio
        self._pin = pin

    def _spawn(self, coro: Any) -> None:
        asyncio.get_running_loop().create_task(coro)

    def host(self, view: dict[str, Any]) -> None:
        self._spawn(self._sio.emit("host:view", view, room=host_room(self._pin)))

    def player(self, sid: str, view: dict[str, Any]) -> None:
        self._spawn(self._sio.emit("player:view", view, to=sid))

    def kicked(self, sid: str) -> None:
        self._spawn(self._sio.emit("player:kicked", to=sid))
        self._spawn(self._sio.leave_room(sid, game_room(self._pin)))

    def ended(self, reason: str) -> None:
        self._spawn(self._sio.emit("game:ended", {"reason": reason}, room=[game_room(self._pin), host_room(self._pin)]))


def create_io(sio: socketio.AsyncServer) -> Callable[[str], GameIO]:
    return lambda pin: SocketIO(sio, pin)


class JoinPayload(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$")
    nickname: str = Field(max_length=60)
    avatar: str | None = Field(default=None, max_length=16)
    playerToken: str | None = Field(default=None, max_length=64)


class AttachPayload(BaseModel):
    pin: str
    hostToken: str


class AnswerPayload(BaseModel):
    questionIndex: int = Field(ge=0)
    answer: Answer


class _SocketState:
    __slots__ = ("last_refill", "pin", "role", "tokens")

    def __init__(self) -> None:
        self.pin: str | None = None
        self.role: str | None = None
        self.tokens: float = BUCKET_SIZE
        self.last_refill = time.monotonic()

    def allow(self) -> bool:
        """Small token bucket per socket to stop clients from flooding the server."""
        now = time.monotonic()
        self.tokens = min(BUCKET_SIZE, self.tokens + (now - self.last_refill) * REFILL_PER_SEC)
        self.last_refill = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


_NOT_DIGIT = re.compile(r"\s")


def register_game_sockets(sio: socketio.AsyncServer, manager: GameManager) -> None:
    states: dict[str, _SocketState] = {}

    def state(sid: str) -> _SocketState:
        return states.setdefault(sid, _SocketState())

    def handler(event: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        """Registers a handler with rate limiting and error translation; its return value is the ack."""

        def decorate(fn: Callable[..., Any]) -> Callable[..., Any]:
            async def wrapped(sid: str, *args: Any) -> dict[str, Any]:
                if not state(sid).allow():
                    return {"ok": False, "error": GameErrors.RATE_LIMITED}
                try:
                    data = await fn(sid, *args)
                except GameError as err:
                    return {"ok": False, "error": err.code}
                except (ValidationError, TypeError, ValueError):
                    return {"ok": False, "error": GameErrors.BAD_REQUEST}
                except Exception:
                    log.exception("socket handler %s failed", event)
                    return {"ok": False, "error": "internal_error"}
                return {"ok": True, "data": data}

            sio.on(event, wrapped)
            return fn

        return decorate

    def host_game(sid: str) -> Game:
        s = state(sid)
        game = manager.get(s.pin) if s.pin else None
        if not game or s.role != "host":
            raise GameError(GameErrors.NOT_ALLOWED)
        return game

    @handler("host:attach")
    async def host_attach(sid: str, payload: Any = None) -> None:
        data = AttachPayload.model_validate(payload)
        game = manager.get(data.pin)
        if not game:
            raise GameError(GameErrors.NOT_FOUND)
        if not safe_equal(game.host_token, data.hostToken):
            raise GameError(GameErrors.NOT_ALLOWED)
        s = state(sid)
        s.pin, s.role = game.pin, "host"
        await sio.enter_room(sid, host_room(game.pin))
        await sio.emit("host:view", game.host_view(), to=sid)

    @handler("host:start")
    async def host_start(sid: str, *_: Any) -> None:
        host_game(sid).start()

    @handler("host:next")
    async def host_next(sid: str, *_: Any) -> None:
        host_game(sid).next()

    @handler("host:skip")
    async def host_skip(sid: str, *_: Any) -> None:
        host_game(sid).next()

    @handler("host:pause")
    async def host_pause(sid: str, paused: Any = False, *_: Any) -> None:
        host_game(sid).set_paused(bool(paused))

    @handler("host:lock")
    async def host_lock(sid: str, locked: Any = False, *_: Any) -> None:
        host_game(sid).set_locked(bool(locked))

    @handler("host:kick")
    async def host_kick(sid: str, player_id: Any = "", *_: Any) -> None:
        host_game(sid).kick(str(player_id))

    @handler("host:end")
    async def host_end(sid: str, *_: Any) -> None:
        game = host_game(sid)
        game.end()
        manager.remove(game.pin)

    @handler("player:join")
    async def player_join(sid: str, payload: Any = None) -> dict[str, str]:
        data = JoinPayload.model_validate(payload)
        game = manager.get(data.pin)
        if not game:
            raise GameError(GameErrors.NOT_FOUND)
        s = state(sid)
        # A socket can only be in one game at a time.
        if s.pin and s.pin != game.pin and (previous := manager.get(s.pin)):
            previous.leave(sid)
        s.pin, s.role = game.pin, "player"
        await sio.enter_room(sid, game_room(game.pin))
        return game.join(sid, data.nickname, data.avatar, data.playerToken)

    @handler("player:answer")
    async def player_answer(sid: str, payload: Any = None) -> None:
        data = AnswerPayload.model_validate(payload)
        s = state(sid)
        game = manager.get(s.pin) if s.pin else None
        if not game or s.role != "player":
            raise GameError(GameErrors.NOT_ALLOWED)
        game.answer(sid, data.questionIndex, data.answer)

    async def player_leave(sid: str, *_: Any) -> None:
        s = state(sid)
        if s.pin:
            if game := manager.get(s.pin):
                game.leave(sid)
            await sio.leave_room(sid, game_room(s.pin))
        s.pin = s.role = None

    async def disconnect(sid: str, *_: Any) -> None:
        s = states.pop(sid, None)
        if s and s.role == "player" and s.pin and (game := manager.get(s.pin)):
            game.disconnect(sid)

    sio.on("player:leave", player_leave)
    sio.on("disconnect", disconnect)
