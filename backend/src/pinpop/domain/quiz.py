from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, Field, StringConstraints, TypeAdapter, field_validator, model_validator

from .base import ApiModel

QuestionType = Literal["quiz", "multi", "truefalse", "type", "slider", "order", "poll", "wordcloud"]
QUESTION_TYPES: tuple[QuestionType, ...] = (
    "quiz",
    "multi",
    "truefalse",
    "type",
    "slider",
    "order",
    "poll",
    "wordcloud",
)

#: Question types that award points. Polls and word clouds are opinion-only.
SCORED_TYPES: frozenset[str] = frozenset({"quiz", "multi", "truefalse", "type", "slider", "order"})

PointsMode = Literal["none", "standard", "double"]
Visibility = Literal["private", "unlisted", "public"]
Number = int | float

Id = Annotated[str, StringConstraints(min_length=1, max_length=64)]


def _check_media_url(value: str) -> str:
    if not (value.startswith("/uploads/") or re.match(r"^https?://", value)):
        raise ValueError("Invalid media URL")
    return value


MediaUrl = Annotated[str, StringConstraints(max_length=2048), AfterValidator(_check_media_url)]


Text80 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Text120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class Choice(ApiModel):
    id: Id
    text: Text120
    correct: bool = False


class PollChoice(ApiModel):
    id: Id
    text: Text120


class OrderItem(ApiModel):
    id: Id
    text: Text120


class _BaseQuestion(ApiModel):
    id: Id
    text: Text500
    image: MediaUrl | None = None
    time_limit: int = Field(default=20, ge=5, le=240)
    points: PointsMode = "standard"
    explanation: Annotated[str, StringConstraints(max_length=1000)] | None = None


def _at_least_one_correct(choices: list[Choice]) -> list[Choice]:
    if not any(c.correct for c in choices):
        raise ValueError("At least one choice must be correct")
    return choices


class QuizQuestion(_BaseQuestion):
    type: Literal["quiz"]
    choices: Annotated[list[Choice], Field(min_length=2, max_length=6), AfterValidator(_at_least_one_correct)]


class MultiQuestion(_BaseQuestion):
    type: Literal["multi"]
    choices: Annotated[list[Choice], Field(min_length=2, max_length=6), AfterValidator(_at_least_one_correct)]


class TrueFalseQuestion(_BaseQuestion):
    type: Literal["truefalse"]
    correct: bool


class TypeQuestion(_BaseQuestion):
    type: Literal["type"]
    accepted_answers: Annotated[list[Text80], Field(min_length=1, max_length=10)]


class SliderQuestion(_BaseQuestion):
    type: Literal["slider"]
    min: Number
    max: Number
    step: Number = Field(default=1, gt=0)
    correct: Number
    #: Answers within ±tolerance earn full points; points fade out linearly beyond it.
    tolerance: Number = Field(default=0, ge=0)
    unit: Annotated[str, StringConstraints(max_length=16)] | None = None

    @model_validator(mode="after")
    def _check_range(self) -> SliderQuestion:
        if self.max <= self.min:
            raise ValueError("max must be greater than min")
        if not self.min <= self.correct <= self.max:
            raise ValueError("correct must be within range")
        return self


class OrderQuestion(_BaseQuestion):
    type: Literal["order"]
    #: Items in the correct order. They are shuffled before being shown to players.
    items: Annotated[list[OrderItem], Field(min_length=2, max_length=6)]


class PollQuestion(_BaseQuestion):
    type: Literal["poll"]
    choices: Annotated[list[PollChoice], Field(min_length=2, max_length=6)]


class WordCloudQuestion(_BaseQuestion):
    type: Literal["wordcloud"]
    max_length: int = Field(default=20, ge=1, le=40)


Question = Annotated[
    QuizQuestion
    | MultiQuestion
    | TrueFalseQuestion
    | TypeQuestion
    | SliderQuestion
    | OrderQuestion
    | PollQuestion
    | WordCloudQuestion,
    Field(discriminator="type"),
]
question_adapter: TypeAdapter[Question] = TypeAdapter(Question)
questions_adapter: TypeAdapter[list[Question]] = TypeAdapter(list[Question])


class QuizInput(ApiModel):
    title: Text120
    description: Annotated[str, StringConstraints(max_length=1000)] = ""
    language: Annotated[str, StringConstraints(min_length=2, max_length=10)] = "en"
    visibility: Visibility = "private"
    tags: Annotated[
        list[Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=30)]],
        Field(max_length=10),
    ] = Field(default_factory=list)
    cover_image: MediaUrl | None = None
    questions: Annotated[list[Question], Field(max_length=100)] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def _none_description(cls, value: object) -> object:
        return "" if value is None else value


class QuizFile(ApiModel):
    """Portable file format used for import/export and sharing quizzes between instances."""

    pinpop: Literal[1]
    quiz: QuizInput


def dump_questions(questions: list[Question]) -> list[dict[str, Any]]:
    return [q.dump() for q in questions]
