from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import ColumnElement, String, cast, exists, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB

from ..db.database import Database
from ..db.models import Quiz, User, utcnow
from ..domain.helpers import with_generated_ids
from ..domain.quiz import Question, QuizInput, questions_adapter
from ..errors import bad_request, forbidden, not_found
from ..security import new_id
from ..util import iso


class ListQuery(BaseModel):
    q: str | None = Field(default=None, max_length=100)
    tag: str | None = Field(default=None, max_length=30)
    language: str | None = Field(default=None, max_length=10)
    sort: Literal["recent", "popular"] = "recent"
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=24, ge=1, le=50)


def validation_message(err: ValidationError) -> str:
    first = err.errors()[0]
    path = ".".join(str(p) for p in first["loc"])
    message = first["msg"].removeprefix("Value error, ")
    return f"{path}: {message}" if path else message


def parse_quiz_input(raw: Any) -> QuizInput:
    try:
        return QuizInput.model_validate(with_generated_ids(raw))
    except ValidationError as err:
        raise bad_request("invalid_quiz", validation_message(err)) from err


def to_summary(row: Quiz, owner_name: str | None) -> dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "language": row.language,
        "visibility": row.visibility,
        "tags": row.tags,
        "coverImage": row.cover_image,
        "questionCount": len(row.questions),
        "playCount": row.play_count,
        "ownerId": row.owner_id,
        "ownerName": owner_name,
        "forkedFrom": row.forked_from,
        "createdAt": iso(row.created_at),
        "updatedAt": iso(row.updated_at),
    }


def to_quiz(row: Quiz, owner_name: str | None) -> dict[str, Any]:
    return {**to_summary(row, owner_name), "questions": row.questions}


def parse_questions(raw: list[dict[str, Any]]) -> list[Question]:
    return questions_adapter.validate_python(raw)


class QuizService:
    def __init__(self, db: Database) -> None:
        self._db = db

    def _has_tag(self, tag: str) -> ColumnElement[bool]:
        if self._db.kind == "postgres":
            return cast(Quiz.tags, JSONB).contains([tag])
        each = func.json_each(Quiz.tags).table_valued("value")
        return exists(select(literal(1)).select_from(each).where(each.c.value == tag))

    async def _list(self, scope: ColumnElement[bool], query: ListQuery) -> dict[str, Any]:
        filters = [scope]
        if query.q:
            escaped = query.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            filters.append(
                or_(Quiz.title.ilike(pattern, escape="\\"), cast(Quiz.description, String).ilike(pattern, escape="\\"))
            )
        if query.tag:
            filters.append(self._has_tag(query.tag.lower()))
        if query.language:
            filters.append(Quiz.language == query.language)
        order = Quiz.play_count.desc() if query.sort == "popular" else Quiz.updated_at.desc()
        async with self._db.session() as s:
            rows = (
                await s.execute(
                    select(Quiz, User.name)
                    .join(User, User.id == Quiz.owner_id)
                    .where(*filters)
                    .order_by(order)
                    .limit(query.pageSize)
                    .offset((query.page - 1) * query.pageSize)
                )
            ).all()
            total = (await s.execute(select(func.count()).select_from(Quiz).where(*filters))).scalar_one()
        return {
            "items": [to_summary(q, name) for q, name in rows],
            "total": total,
            "page": query.page,
            "pageSize": query.pageSize,
        }

    async def list_own(self, user: User, query: ListQuery) -> dict[str, Any]:
        return await self._list(Quiz.owner_id == user.id, query)

    async def list_public(self, query: ListQuery) -> dict[str, Any]:
        return await self._list(Quiz.visibility == "public", query)

    async def get_row(self, quiz_id: str) -> tuple[Quiz, str] | None:
        async with self._db.session() as s:
            row = (
                await s.execute(select(Quiz, User.name).join(User, User.id == Quiz.owner_id).where(Quiz.id == quiz_id))
            ).first()
        return (row[0], row[1]) if row else None

    async def get_viewable(self, quiz_id: str, user: User | None) -> dict[str, Any]:
        """Returns a quiz the user may view: their own, or public/unlisted ones."""
        row = await self.get_row(quiz_id)
        if not row:
            raise not_found("quiz_not_found")
        quiz, owner_name = row
        is_owner = user is not None and user.id == quiz.owner_id
        if not is_owner and quiz.visibility == "private" and (user is None or user.role != "admin"):
            raise not_found("quiz_not_found")
        return to_quiz(quiz, owner_name)

    async def get_owned(self, quiz_id: str, user: User) -> Quiz:
        row = await self.get_row(quiz_id)
        if not row:
            raise not_found("quiz_not_found")
        if row[0].owner_id != user.id and user.role != "admin":
            raise forbidden()
        return row[0]

    @staticmethod
    def _values(data: QuizInput) -> dict[str, Any]:
        dumped = data.dump()
        return {
            "title": dumped["title"],
            "description": dumped["description"],
            "language": dumped["language"],
            "visibility": dumped["visibility"],
            "tags": dumped["tags"],
            "cover_image": dumped["coverImage"],
            "questions": dumped["questions"],
        }

    async def create(self, user: User, data: QuizInput, forked_from: str | None = None) -> dict[str, Any]:
        row = Quiz(id=new_id(12), owner_id=user.id, forked_from=forked_from, **self._values(data))
        async with self._db.session() as s, s.begin():
            s.add(row)
        return to_quiz(row, user.name)

    async def update(self, quiz_id: str, user: User, data: QuizInput) -> dict[str, Any]:
        await self.get_owned(quiz_id, user)
        async with self._db.session() as s, s.begin():
            await s.execute(update(Quiz).where(Quiz.id == quiz_id).values(**self._values(data), updated_at=utcnow()))
        row = await self.get_row(quiz_id)
        if not row:
            raise not_found("quiz_not_found")
        return to_quiz(*row)

    async def remove(self, quiz_id: str, user: User) -> None:
        quiz = await self.get_owned(quiz_id, user)
        async with self._db.session() as s, s.begin():
            await s.delete(await s.merge(quiz))

    async def fork(self, quiz_id: str, user: User) -> dict[str, Any]:
        source = await self.get_viewable(quiz_id, user)
        data = parse_quiz_input(
            {
                "title": f"{source['title']} (copy)" if source["ownerId"] == user.id else source["title"],
                "description": source["description"],
                "language": source["language"],
                "visibility": "private",
                "tags": source["tags"],
                "coverImage": source["coverImage"],
                "questions": source["questions"],
            }
        )
        return await self.create(user, data, forked_from=source["id"])

    async def increment_play_count(self, quiz_id: str) -> None:
        async with self._db.session() as s, s.begin():
            await s.execute(update(Quiz).where(Quiz.id == quiz_id).values(play_count=Quiz.play_count + 1))
