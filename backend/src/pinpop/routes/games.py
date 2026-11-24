from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

from ..deps import Ctx, CurrentUser, rate_limit
from ..domain.game import GameSettings
from ..errors import HttpError, bad_request, forbidden, not_found
from ..game.manager import TooManyGamesError
from ..services.quizzes import parse_questions

log = logging.getLogger("pinpop.games")
router = APIRouter()
Pin = Annotated[str, Path(pattern=r"^\d{6}$")]
ReportId = Annotated[str, Path(min_length=1, max_length=64)]


class CreateGameBody(BaseModel):
    quizId: str = Field(min_length=1)
    settings: dict[str, Any] | None = None


@router.post("/api/games", status_code=201, tags=["games"], dependencies=[Depends(rate_limit(30))])
async def create_game(body: CreateGameBody, user: CurrentUser, ctx: Ctx) -> dict[str, str]:
    quiz = await ctx.quizzes.get_viewable(body.quizId, user)
    if not quiz["questions"]:
        raise bad_request("quiz_empty")
    try:
        settings = GameSettings.model_validate(body.settings or {})
    except ValidationError as err:
        raise bad_request("validation_error") from err
    try:
        game = ctx.games.create(
            quiz_id=quiz["id"],
            quiz_title=quiz["title"],
            owner_id=user.id,
            questions=parse_questions(quiz["questions"]),
            settings=settings,
        )
    except TooManyGamesError as err:
        raise HttpError(503, "server_busy") from err

    task = asyncio.create_task(ctx.quizzes.increment_play_count(quiz["id"]))
    task.add_done_callback(_log_failure)
    url = ctx.settings.public_url
    return {
        "pin": game.pin,
        "hostToken": game.host_token,
        "hostUrl": f"{url}/host/{game.pin}#{game.host_token}",
        "joinUrl": f"{url}/join?pin={game.pin}",
    }


def _log_failure(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and (err := task.exception()):
        log.error("play count failed", exc_info=err)


@router.get("/api/games/{pin}/exists", tags=["games"])
async def game_exists(pin: Pin, ctx: Ctx) -> dict[str, bool]:
    """Public check used by the join screen."""
    game = ctx.games.get(pin)
    accepting = bool(game and game.phase != "podium" and (game.phase == "lobby" or game.settings.allow_late_join))
    return {
        "exists": game is not None,
        "acceptingPlayers": accepting,
        "randomNicknames": bool(game and game.settings.random_nicknames),
    }


def _owned_game(ctx: Ctx, pin: str, user_id: str, role: str) -> Any:
    game = ctx.games.get(pin)
    if not game:
        raise not_found("game_not_found")
    if game.owner_id != user_id and role != "admin":
        raise forbidden()
    return game


@router.get("/api/games/{pin}", tags=["games"])
async def game_status(pin: Pin, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    """Live status for the game owner (used by the MCP server and integrations)."""
    view = _owned_game(ctx, pin, user.id, user.role).host_view()
    question = view["question"]
    return {
        "pin": view["pin"],
        "phase": view["phase"],
        "quizTitle": view["quizTitle"],
        "playerCount": len(view["players"]),
        "players": [{"nickname": p["nickname"], "connected": p["connected"]} for p in view["players"]],
        "questionIndex": view["questionIndex"],
        "totalQuestions": view["totalQuestions"],
        "currentQuestion": question["text"] if question else None,
        "answeredCount": view["answeredCount"],
        "leaderboard": [
            {"rank": e["rank"], "nickname": e["nickname"], "score": e["score"]} for e in view["leaderboard"]
        ],
    }


@router.post("/api/games/{pin}/end", tags=["games"])
async def end_game(pin: Pin, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    game = _owned_game(ctx, pin, user.id, user.role)
    game.end()
    ctx.games.remove(game.pin)
    return {"ok": True}


# ---------------------------------------------------------------- reports


@router.get("/api/reports", tags=["reports"])
async def list_reports(
    user: CurrentUser,
    ctx: Ctx,
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    return await ctx.reports.list(user, page, pageSize)


@router.get("/api/reports/{report_id}", tags=["reports"])
async def get_report(report_id: ReportId, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.reports.get(report_id, user)


@router.get("/api/reports/{report_id}/csv", tags=["reports"])
async def report_csv(report_id: ReportId, user: CurrentUser, ctx: Ctx) -> Response:
    report = await ctx.reports.get(report_id, user)
    return Response(
        ctx.reports.to_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={"content-disposition": f'attachment; filename="pinpop-report-{report["id"]}.csv"'},
    )


@router.delete("/api/reports/{report_id}", tags=["reports"])
async def delete_report(report_id: ReportId, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    await ctx.reports.remove(report_id, user)
    return {"ok": True}
