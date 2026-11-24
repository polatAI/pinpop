from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from ..db.database import Database
from ..db.models import Assignment, AssignmentAttempt, User, utcnow
from ..domain.helpers import sanitize_nickname, shuffle, shuffle_order_items, to_public_question
from ..domain.quiz import SCORED_TYPES, questions_adapter
from ..domain.scoring import Evaluation, answer_adapter, compute_points, evaluate_answer, is_answer_well_formed
from ..errors import HttpError, bad_request, forbidden, not_found
from ..profanity import is_inappropriate
from ..security import new_id, random_token, sha256
from ..util import iso, parse_iso
from .quizzes import QuizService

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
#: Extra time allowed per question for network latency before an answer counts as late.
LATE_GRACE_MS = 3000
MAX_ATTEMPTS_PER_ASSIGNMENT = 5000


class CreateAssignment(BaseModel):
    quizId: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=120)
    #: ISO date after which no new attempts are accepted.
    deadline: datetime | None = None
    shuffleQuestions: bool = False
    shuffleAnswers: bool = True
    #: Show the correct answer after each question.
    showAnswers: bool = True


def _random_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _imul(a: int, b: int) -> int:
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF


def seeded(seed: str) -> Any:
    """Small deterministic PRNG so an attempt always sees the same shuffled choices."""
    h = (1779033703 ^ len(seed)) & 0xFFFFFFFF
    for ch in seed:
        h = _imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF

    def next_value() -> float:
        nonlocal h
        h = _imul(h ^ (h >> 16), 2246822507)
        h = _imul(h ^ (h >> 13), 3266489909)
        h ^= h >> 16
        return (h & 0xFFFFFFFF) / 4294967296

    return next_value


def _closed() -> HttpError:
    return HttpError(410, "assignment_closed")


class AssignmentService:
    def __init__(self, db: Database, quizzes: QuizService, public_url: str) -> None:
        self._db = db
        self._quizzes = quizzes
        self._public_url = public_url

    @staticmethod
    def _is_open(a: Assignment) -> bool:
        return not a.closed and (a.deadline is None or a.deadline > utcnow())

    def _summarize(self, a: Assignment, attempts: list[AssignmentAttempt]) -> dict[str, Any]:
        finished = [t for t in attempts if t.finished_at]
        return {
            "id": a.id,
            "code": a.code,
            "quizId": a.quiz_id,
            "title": a.title,
            "questionCount": len(a.questions),
            "attemptCount": len(attempts),
            "completedCount": len(finished),
            "averageScore": round(sum(t.score for t in finished) / len(finished)) if finished else 0,
            "deadline": iso(a.deadline),
            "closed": not self._is_open(a),
            "createdAt": iso(a.created_at),
            "url": f"{self._public_url}/a/{a.code}",
        }

    async def create(self, user: User, raw: Any) -> dict[str, Any]:
        try:
            data = CreateAssignment.model_validate(raw)
        except ValidationError as err:
            raise bad_request("validation_error") from err
        quiz = await self._quizzes.get_viewable(data.quizId, user)
        if not quiz["questions"]:
            raise bad_request("quiz_empty")
        for attempt in range(5):
            row = Assignment(
                id=new_id(12),
                code=_random_code(),
                quiz_id=quiz["id"],
                owner_id=user.id,
                title=data.title or quiz["title"],
                questions=quiz["questions"],
                settings={
                    "shuffleQuestions": data.shuffleQuestions,
                    "shuffleAnswers": data.shuffleAnswers,
                    "showAnswers": data.showAnswers,
                },
                deadline=data.deadline,
            )
            try:
                async with self._db.session() as s, s.begin():
                    s.add(row)
                return self._summarize(row, [])
            except IntegrityError:
                # Retry on the (unlikely) code collision.
                if attempt == 4:
                    raise
        raise RuntimeError("Could not create assignment")

    async def _attempts(self, assignment_id: str, *, by_score: bool = False) -> list[AssignmentAttempt]:
        stmt = select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == assignment_id)
        if by_score:
            stmt = stmt.order_by(AssignmentAttempt.score.desc())
        async with self._db.session() as s:
            return list((await s.execute(stmt)).scalars())

    async def list_owned(self, user: User) -> list[dict[str, Any]]:
        async with self._db.session() as s:
            rows = (
                await s.execute(
                    select(Assignment)
                    .where(Assignment.owner_id == user.id)
                    .order_by(Assignment.created_at.desc())
                    .limit(200)
                )
            ).scalars()
            assignments = list(rows)
        return [self._summarize(a, await self._attempts(a.id)) for a in assignments]

    async def _owned(self, assignment_id: str, user: User) -> Assignment:
        async with self._db.session() as s:
            row = await s.get(Assignment, assignment_id)
        if not row:
            raise not_found("assignment_not_found")
        if row.owner_id != user.id and user.role != "admin":
            raise forbidden()
        return row

    async def report(self, assignment_id: str, user: User) -> dict[str, Any]:
        a = await self._owned(assignment_id, user)
        attempts = await self._attempts(a.id, by_score=True)
        empty = {"correct": None, "points": 0, "timeMs": None, "answer": None}
        return {
            **self._summarize(a, attempts),
            "questions": a.questions,
            "attempts": [
                {
                    "id": t.id,
                    "nickname": t.nickname,
                    "score": t.score,
                    "correctCount": sum(1 for x in t.answers if x.get("correct") is True),
                    "finished": t.finished_at is not None,
                    "startedAt": iso(t.started_at),
                    "finishedAt": iso(t.finished_at),
                    # Answers are stored in play order; report them in quiz order.
                    "answers": [
                        next((x for x in t.answers if x.get("questionIndex") == qi), {"questionIndex": qi, **empty})
                        for qi in range(len(a.questions))
                    ],
                }
                for t in attempts
            ],
        }

    async def update(self, assignment_id: str, user: User, patch: dict[str, Any]) -> None:
        await self._owned(assignment_id, user)
        values: dict[str, Any] = {}
        if patch.get("closed") is not None:
            values["closed"] = bool(patch["closed"])
        if "deadline" in patch:
            values["deadline"] = parse_iso(patch["deadline"]) if patch["deadline"] else None
        if values:
            async with self._db.session() as s, s.begin():
                await s.execute(update(Assignment).where(Assignment.id == assignment_id).values(**values))

    async def remove(self, assignment_id: str, user: User) -> None:
        await self._owned(assignment_id, user)
        async with self._db.session() as s, s.begin():
            await s.execute(delete(Assignment).where(Assignment.id == assignment_id))

    # ---------------------------------------------------------------- student side

    async def _by_code(self, code: str) -> Assignment:
        async with self._db.session() as s:
            row = (await s.execute(select(Assignment).where(Assignment.code == code.upper()))).scalar_one_or_none()
        if not row:
            raise not_found("assignment_not_found")
        return row

    async def info(self, code: str) -> dict[str, Any]:
        a = await self._by_code(code)
        async with self._db.session() as s:
            owner = await s.get(User, a.owner_id)
        return {
            "code": a.code,
            "title": a.title,
            "questionCount": len(a.questions),
            "deadline": iso(a.deadline),
            "open": self._is_open(a),
            "ownerName": owner.name if owner else "",
        }

    @staticmethod
    def _question_payload(a: Assignment, attempt_id: str, order: list[int], index: int) -> dict[str, Any] | None:
        if index >= len(order):
            return None
        qi = order[index]
        question = questions_adapter.validate_python([a.questions[qi]])[0]
        rand = seeded(f"{attempt_id}:{qi}")
        pub = to_public_question(question)
        if pub["type"] == "order":
            pub["items"] = shuffle_order_items(pub["items"], rand)
        elif a.settings.get("shuffleAnswers") and pub["type"] in ("quiz", "multi", "poll"):
            pub["choices"] = shuffle(pub["choices"], rand)
        return {"index": index, "total": len(order), "question": pub}

    async def start(self, code: str, raw_nickname: str) -> dict[str, Any]:
        a = await self._by_code(code)
        if not self._is_open(a):
            raise _closed()
        nickname = sanitize_nickname(raw_nickname)
        if not nickname:
            raise bad_request("nickname_invalid")
        if is_inappropriate(nickname):
            raise bad_request("nickname_inappropriate")
        async with self._db.session() as s:
            count = (
                await s.execute(
                    select(func.count()).select_from(AssignmentAttempt).where(AssignmentAttempt.assignment_id == a.id)
                )
            ).scalar_one()
        if count >= MAX_ATTEMPTS_PER_ASSIGNMENT:
            raise HttpError(409, "assignment_full")

        indexes = list(range(len(a.questions)))
        order = shuffle(indexes) if a.settings.get("shuffleQuestions") else indexes
        token = random_token(32)
        attempt_id = new_id(12)
        async with self._db.session() as s, s.begin():
            s.add(
                AssignmentAttempt(
                    id=attempt_id,
                    assignment_id=a.id,
                    nickname=nickname,
                    token_hash=sha256(token),
                    order=order,
                    answers=[],
                    current_started_at=utcnow(),
                )
            )
        question = self._question_payload(a, attempt_id, order, 0)
        if not question:
            raise bad_request("quiz_empty")
        return {"token": token, "question": question}

    async def _attempt(self, a: Assignment, token: str) -> AssignmentAttempt:
        async with self._db.session() as s:
            row = (
                await s.execute(
                    select(AssignmentAttempt).where(
                        AssignmentAttempt.assignment_id == a.id, AssignmentAttempt.token_hash == sha256(token)
                    )
                )
            ).scalar_one_or_none()
        if not row:
            raise not_found("attempt_not_found")
        return row

    async def state(self, code: str, token: str) -> dict[str, Any]:
        """Lets a student resume after a reload.

        A question that was already served keeps its server-side timer; otherwise the client calls `next`.
        """
        a = await self._by_code(code)
        t = await self._attempt(a, token)
        served = t.finished_at is None and t.current_started_at is not None
        elapsed = (utcnow() - t.current_started_at).total_seconds() * 1000 if served and t.current_started_at else 0
        return {
            "nickname": t.nickname,
            "score": t.score,
            "streak": t.streak,
            "finished": t.finished_at is not None,
            "correctCount": sum(1 for x in t.answers if x.get("correct") is True),
            "question": self._question_payload(a, t.id, t.order, t.current_index) if served else None,
            "elapsedMs": round(elapsed),
        }

    async def next(self, code: str, token: str) -> dict[str, Any]:
        """Serves the next question and starts its timer (idempotent while the question is open)."""
        a = await self._by_code(code)
        t = await self._attempt(a, token)
        if t.finished_at:
            raise bad_request("already_finished")
        started = t.current_started_at
        if started is None:
            started = utcnow()
            async with self._db.session() as s, s.begin():
                await s.execute(
                    update(AssignmentAttempt).where(AssignmentAttempt.id == t.id).values(current_started_at=started)
                )
        question = self._question_payload(a, t.id, t.order, t.current_index)
        if not question:
            raise bad_request("already_finished")
        return {"question": question, "elapsedMs": round((utcnow() - started).total_seconds() * 1000)}

    async def answer(self, code: str, token: str, question_index: int, raw_answer: Any) -> dict[str, Any]:
        a = await self._by_code(code)
        t = await self._attempt(a, token)
        if t.finished_at:
            raise bad_request("already_finished")
        if question_index != t.current_index or t.current_started_at is None:
            raise bad_request("already_answered")

        qi = t.order[t.current_index]
        question = questions_adapter.validate_python([a.questions[qi]])[0]
        elapsed_ms = (utcnow() - t.current_started_at).total_seconds() * 1000
        late = elapsed_ms > question.time_limit * 1000 + LATE_GRACE_MS

        answer = None
        if raw_answer is not None:
            try:
                answer = answer_adapter.validate_python(raw_answer)
            except ValidationError as err:
                raise bad_request("invalid_answer") from err
            if not is_answer_well_formed(question, answer):
                raise bad_request("invalid_answer")

        scored = question.type in SCORED_TYPES
        evaluation = (
            evaluate_answer(question, answer)
            if answer is not None and not late
            else Evaluation(False if scored else None, 0)
        )
        streak = (t.streak + 1 if evaluation.correct else 0) if scored else t.streak
        points = compute_points(
            question, evaluation, elapsed_ms=elapsed_ms, time_limit_ms=question.time_limit * 1000, streak=streak
        )
        record = {
            "questionIndex": qi,
            "correct": evaluation.correct,
            "points": points,
            "timeMs": round(elapsed_ms) if answer is not None else None,
            "answer": answer.dump() if answer is not None else None,
        }
        answers = [*t.answers, record]
        next_index = t.current_index + 1
        finished = next_index >= len(t.order)
        score = t.score + points

        # Guard against double submits racing each other: only update if the index is unchanged.
        async with self._db.session() as s, s.begin():
            result = await s.execute(
                update(AssignmentAttempt)
                .where(AssignmentAttempt.id == t.id, AssignmentAttempt.current_index == t.current_index)
                .values(
                    answers=answers,
                    score=score,
                    streak=streak,
                    current_index=next_index,
                    current_started_at=None,
                    finished_at=utcnow() if finished else None,
                )
            )
        if result.rowcount == 0:  # type: ignore[attr-defined]
            raise bad_request("already_answered")

        return {
            "correct": evaluation.correct,
            "points": points,
            "score": score,
            "streak": streak,
            "solution": a.questions[qi] if a.settings.get("showAnswers") else None,
            "finished": finished,
            "correctCount": sum(1 for x in answers if x.get("correct") is True),
        }
