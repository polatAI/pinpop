from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..ai.service import GenerateInput, ImproveInput
from ..ai.sources import extract_file_text
from ..deps import Ctx, CurrentUser, rate_limit
from ..domain.quiz import QUESTION_TYPES
from ..services.quizzes import parse_quiz_input

router = APIRouter(tags=["ai"])
ai_limit = Depends(rate_limit(10))


@router.get("/api/ai/status")
async def ai_status(user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.ai.status(user)


async def _respond(ctx: Ctx, user: Any, generated: dict[str, Any], save: bool) -> dict[str, Any]:
    if not save:
        return {"quiz": generated, "quizId": None}
    saved = await ctx.quizzes.create(user, parse_quiz_input(generated))
    return {"quiz": generated, "quizId": saved["id"]}


@router.post("/api/ai/generate", dependencies=[ai_limit])
async def generate(body: GenerateInput, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    generated = await ctx.ai.generate(user, body)
    return await _respond(ctx, user, generated, body.save)


@router.post("/api/ai/generate-from-file", dependencies=[ai_limit])
async def generate_from_file(
    user: CurrentUser,
    ctx: Ctx,
    file: Annotated[UploadFile, File()],
    topic: Annotated[str | None, Form()] = None,
    count: Annotated[int, Form(ge=1, le=30)] = 10,
    difficulty: Annotated[str, Form(pattern="^(easy|medium|hard|mixed)$")] = "medium",
    language: Annotated[str, Form()] = "en",
    types: Annotated[str, Form()] = "quiz,truefalse",
    timeLimit: Annotated[int, Form(ge=5, le=240)] = 20,
    save: Annotated[str, Form(pattern="^(true|false)$")] = "false",
) -> dict[str, Any]:
    """Same as /generate but with an uploaded PDF or text file as the source material."""
    source_text = await extract_file_text(await file.read(), file.filename or "", file.content_type or "")
    wanted = [t for t in types.split(",") if t in QUESTION_TYPES] or ["quiz"]
    data = GenerateInput.model_validate(
        {
            "topic": topic,
            "count": count,
            "difficulty": difficulty,
            "language": language,
            "types": wanted,
            "timeLimit": timeLimit,
            "save": save == "true",
        }
    )
    generated = await ctx.ai.generate(user, data, extra_source=source_text)
    return await _respond(ctx, user, generated, data.save)


@router.post("/api/ai/improve", dependencies=[ai_limit])
async def improve(body: ImproveInput, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return {"question": await ctx.ai.improve(user, body.action, body.question, body.language)}
