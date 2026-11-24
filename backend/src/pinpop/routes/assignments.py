from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Path
from pydantic import BaseModel, Field

from ..deps import Ctx, CurrentUser, rate_limit
from ..util import iso

router = APIRouter(tags=["assignments"])
AssignmentId = Annotated[str, Path(min_length=1, max_length=64)]
Code = Annotated[str, Path(pattern=r"^[A-Za-z0-9]{8}$")]
play_limit = Depends(rate_limit(120))

# ---------------------------------------------------------------- teacher


@router.post("/api/assignments", status_code=201)
async def create_assignment(user: CurrentUser, ctx: Ctx, body: Annotated[Any, Body()] = None) -> dict[str, Any]:
    return await ctx.assignments.create(user, body)


@router.get("/api/assignments")
async def list_assignments(user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return {"items": await ctx.assignments.list_owned(user)}


@router.get("/api/assignments/{assignment_id}")
async def assignment_report(assignment_id: AssignmentId, user: CurrentUser, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.report(assignment_id, user)


class PatchAssignmentBody(BaseModel):
    closed: bool | None = None
    deadline: datetime | None = None


@router.patch("/api/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: AssignmentId, body: PatchAssignmentBody, user: CurrentUser, ctx: Ctx
) -> dict[str, bool]:
    patch: dict[str, Any] = {"closed": body.closed}
    if "deadline" in body.model_fields_set:
        patch["deadline"] = iso(body.deadline)
    await ctx.assignments.update(assignment_id, user, patch)
    return {"ok": True}


@router.delete("/api/assignments/{assignment_id}")
async def delete_assignment(assignment_id: AssignmentId, user: CurrentUser, ctx: Ctx) -> dict[str, bool]:
    await ctx.assignments.remove(assignment_id, user)
    return {"ok": True}


# ---------------------------------------------------------------- student (no account needed)


class StartBody(BaseModel):
    nickname: Annotated[str, Field(max_length=60)]


class TokenBody(BaseModel):
    token: Annotated[str, Field(min_length=10, max_length=64)]


class AnswerBody(TokenBody):
    questionIndex: Annotated[int, Field(ge=0)]
    answer: Any = None


@router.get("/api/play/{code}")
async def assignment_info(code: Code, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.info(code)


@router.post("/api/play/{code}/start", dependencies=[Depends(rate_limit(20))])
async def start_attempt(code: Code, body: StartBody, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.start(code, body.nickname)


@router.post("/api/play/{code}/state", dependencies=[play_limit])
async def attempt_state(code: Code, body: TokenBody, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.state(code, body.token)


@router.post("/api/play/{code}/next", dependencies=[play_limit])
async def next_question(code: Code, body: TokenBody, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.next(code, body.token)


@router.post("/api/play/{code}/answer", dependencies=[play_limit])
async def submit_answer(code: Code, body: AnswerBody, ctx: Ctx) -> dict[str, Any]:
    return await ctx.assignments.answer(code, body.token, body.questionIndex, body.answer)
