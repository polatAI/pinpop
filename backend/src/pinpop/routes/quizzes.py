from __future__ import annotations

import json
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError

from ..deps import Ctx, CurrentUser, OptionalUser
from ..domain.quiz import QuizFile
from ..errors import bad_request
from ..services.csv_io import questions_from_csv, questions_to_csv
from ..services.quizzes import ListQuery, parse_questions, parse_quiz_input

router = APIRouter(tags=["quizzes"])
QuizId = Annotated[str, Field(min_length=1, max_length=64)]


@router.get("/api/quizzes")
async def list_quizzes(query: Annotated[ListQuery, Query()], user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.quizzes.list_own(user, query)


@router.get("/api/discover")
async def discover(query: Annotated[ListQuery, Query()], ctx: Ctx) -> dict[str, Any]:
    return await ctx.quizzes.list_public(query)


@router.post("/api/quizzes", status_code=201)
async def create_quiz(user: CurrentUser, ctx: Ctx, body: Annotated[Any, Body()] = None) -> dict[str, Any]:
    return await ctx.quizzes.create(user, parse_quiz_input(body))


@router.get("/api/quizzes/{quiz_id}")
async def get_quiz(quiz_id: QuizId, user: OptionalUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.quizzes.get_viewable(quiz_id, user)


@router.put("/api/quizzes/{quiz_id}")
async def replace_quiz(
    quiz_id: QuizId, user: CurrentUser, ctx: Ctx, body: Annotated[Any, Body()] = None
) -> dict[str, Any]:
    return await ctx.quizzes.update(quiz_id, user, parse_quiz_input(body))


@router.patch("/api/quizzes/{quiz_id}")
async def patch_quiz(
    quiz_id: QuizId, user: CurrentUser, ctx: Ctx, body: Annotated[Any, Body()] = None
) -> dict[str, Any]:
    """Partial update: only the given top-level fields are replaced."""
    current = await ctx.quizzes.get_viewable(quiz_id, user)
    patch = body if isinstance(body, dict) else {}
    return await ctx.quizzes.update(quiz_id, user, parse_quiz_input({**current, **patch}))


class AddQuestionsBody(BaseModel):
    questions: Annotated[list[Any], Field(min_length=1, max_length=100)]


@router.post("/api/quizzes/{quiz_id}/questions")
async def add_questions(quiz_id: QuizId, body: AddQuestionsBody, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    current = await ctx.quizzes.get_viewable(quiz_id, user)
    merged = {**current, "questions": [*current["questions"], *body.questions]}
    return await ctx.quizzes.update(quiz_id, user, parse_quiz_input(merged))


@router.delete("/api/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: QuizId, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    await ctx.quizzes.remove(quiz_id, user)
    return {"ok": True}


@router.post("/api/quizzes/{quiz_id}/fork")
async def fork_quiz(quiz_id: QuizId, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.quizzes.fork(quiz_id, user)


def _slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "quiz"


@router.get("/api/quizzes/{quiz_id}/export")
async def export_quiz(
    quiz_id: QuizId, user: OptionalUser, ctx: Ctx, format: Literal["json", "csv"] = "json"
) -> Response:
    quiz = await ctx.quizzes.get_viewable(quiz_id, user)
    slug = _slug(quiz["title"])
    if format == "csv":
        csv_text = "﻿" + questions_to_csv(parse_questions(quiz["questions"]))
        return Response(
            csv_text,
            media_type="text/csv; charset=utf-8",
            headers={"content-disposition": f'attachment; filename="{slug}.csv"'},
        )
    cover = quiz["coverImage"]
    payload = {
        "pinpop": 1,
        "quiz": {
            "title": quiz["title"],
            "description": quiz["description"],
            "language": quiz["language"],
            "visibility": "private",
            "tags": quiz["tags"],
            "coverImage": None if cover and cover.startswith("/uploads/") else cover,
            "questions": quiz["questions"],
        },
    }
    return JSONResponse(payload, headers={"content-disposition": f'attachment; filename="{slug}.pinpop.json"'})


class ImportBody(BaseModel):
    format: Literal["json", "csv"]
    content: Annotated[str, Field(max_length=2_000_000)]
    title: Annotated[str, Field(max_length=120)] | None = None


@router.post("/api/quizzes/import", status_code=201)
async def import_quiz(body: ImportBody, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    """Imports a Pinpop JSON file or a CSV spreadsheet as a new quiz."""
    data: Any
    if body.format == "json":
        try:
            raw = json.loads(body.content)
        except json.JSONDecodeError as err:
            raise bad_request("invalid_json") from err
        try:
            data = QuizFile.model_validate(raw).quiz.dump()
        except ValidationError:
            data = raw
    else:
        data = {"title": body.title or "Imported quiz", "questions": questions_from_csv(body.content)}
    if not isinstance(data, dict):
        raise bad_request("invalid_quiz")
    return await ctx.quizzes.create(user, parse_quiz_input({**data, "visibility": "private"}))
