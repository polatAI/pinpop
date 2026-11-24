from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints, TypeAdapter

from .base import ApiModel
from .quiz import (
    SCORED_TYPES,
    Id,
    MultiQuestion,
    OrderQuestion,
    PollQuestion,
    Question,
    QuizQuestion,
    SliderQuestion,
    TrueFalseQuestion,
    TypeQuestion,
    WordCloudQuestion,
)


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be finite")
    return value


class QuizAnswer(ApiModel):
    type: Literal["quiz"]
    choice_id: Id


class MultiAnswer(ApiModel):
    type: Literal["multi"]
    choice_ids: Annotated[list[Id], Field(min_length=1, max_length=6)]


class TrueFalseAnswer(ApiModel):
    type: Literal["truefalse"]
    value: bool


class TypeAnswer(ApiModel):
    type: Literal["type"]
    text: Annotated[str, StringConstraints(max_length=80)]


class SliderAnswer(ApiModel):
    type: Literal["slider"]
    value: Annotated[int | float, AfterValidator(_finite)]


class OrderAnswer(ApiModel):
    type: Literal["order"]
    item_ids: Annotated[list[Id], Field(min_length=2, max_length=6)]


class PollAnswer(ApiModel):
    type: Literal["poll"]
    choice_id: Id


class WordCloudAnswer(ApiModel):
    type: Literal["wordcloud"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


Answer = Annotated[
    QuizAnswer | MultiAnswer | TrueFalseAnswer | TypeAnswer | SliderAnswer | OrderAnswer | PollAnswer | WordCloudAnswer,
    Field(discriminator="type"),
]
answer_adapter: TypeAdapter[Answer] = TypeAdapter(Answer)


@dataclass(frozen=True)
class Evaluation:
    #: None for opinion questions (poll, word cloud).
    correct: bool | None
    #: 0..1 share of the question's points earned before time and streak adjustments.
    ratio: float


_NON_WORD = re.compile(r"[^\w\s]|_")
_SPACES = re.compile(r"\s+")


def normalize_text(value: str) -> str:
    """Lower-cases, trims, collapses whitespace and strips diacritics so "İstanbul " matches "istanbul"."""
    value = value.replace("İ", "i").replace("I", "i").replace("ı", "i").lower()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))
    value = _NON_WORD.sub("", value)
    return _SPACES.sub(" ", value).strip()


def evaluate_answer(question: Question, answer: Answer) -> Evaluation:
    if question.type != answer.type:
        return Evaluation(False, 0)
    match question, answer:
        case QuizQuestion(), QuizAnswer():
            ok = any(c.id == answer.choice_id and c.correct for c in question.choices)
            return Evaluation(ok, 1 if ok else 0)
        case MultiQuestion(), MultiAnswer():
            correct_ids = {c.id for c in question.choices if c.correct}
            selected = set(answer.choice_ids)
            hits = len(selected & correct_ids)
            misses = len(selected - correct_ids)
            exact = misses == 0 and hits == len(correct_ids)
            return Evaluation(exact, 1 if exact else max(0, (hits - misses) / len(correct_ids)))
        case TrueFalseQuestion(), TrueFalseAnswer():
            ok = answer.value == question.correct
            return Evaluation(ok, 1 if ok else 0)
        case TypeQuestion(), TypeAnswer():
            given = normalize_text(answer.text)
            ok = bool(given) and any(normalize_text(x) == given for x in question.accepted_answers)
            return Evaluation(ok, 1 if ok else 0)
        case SliderQuestion(), SliderAnswer():
            return _evaluate_slider(question, answer.value)
        case OrderQuestion(), OrderAnswer():
            expected = [i.id for i in question.items]
            if len(answer.item_ids) != len(expected):
                return Evaluation(False, 0)
            in_place = sum(1 for a, b in zip(answer.item_ids, expected, strict=True) if a == b)
            exact = in_place == len(expected)
            # Partial credit is deliberately modest so guessing an order is not rewarded much.
            return Evaluation(exact, 1 if exact else in_place / len(expected) * 0.5)
        case _:
            return Evaluation(None, 0)


def _evaluate_slider(q: SliderQuestion, value: float) -> Evaluation:
    diff = abs(value - q.correct)
    if diff <= q.tolerance:
        return Evaluation(True, 1)
    # Near misses within a quarter of the range earn up to half points.
    fade_range = (q.max - q.min) / 4
    ratio = max(0, 1 - (diff - q.tolerance) / fade_range) * 0.5 if fade_range > 0 else 0
    return Evaluation(False, ratio)


BASE_POINTS = 1000
STREAK_BONUS = 100
MAX_STREAK_BONUS_STEPS = 5


def compute_points(
    question: Question, evaluation: Evaluation, *, elapsed_ms: float, time_limit_ms: float, streak: int
) -> int:
    """Faster answers earn more: answering instantly gives 100% of the points, at the buzzer 50%.

    `streak` includes this answer (1 = first correct answer in a row) and adds a capped bonus.
    """
    if question.type not in SCORED_TYPES or question.points == "none" or evaluation.ratio <= 0:
        return 0
    multiplier = 2 if question.points == "double" else 1
    progress = min(1.0, max(0.0, elapsed_ms / max(1.0, time_limit_ms)))
    speed_factor = 1 - progress / 2
    base = BASE_POINTS * multiplier * evaluation.ratio * speed_factor
    bonus = min(max(0, streak - 1), MAX_STREAK_BONUS_STEPS) * STREAK_BONUS * multiplier if evaluation.correct else 0
    return _js_round(base + bonus)


def _js_round(value: float) -> int:
    """Math.round semantics (half rounds up) instead of Python's banker's rounding."""
    return math.floor(value + 0.5)


def is_answer_well_formed(question: Question, answer: Answer) -> bool:
    """Checks that an answer references only ids present in the question."""
    if question.type != answer.type:
        return False
    match question, answer:
        case QuizQuestion() | PollQuestion(), QuizAnswer() | PollAnswer():
            return any(c.id == answer.choice_id for c in question.choices)
        case MultiQuestion(), MultiAnswer():
            ids = {c.id for c in question.choices}
            return all(x in ids for x in answer.choice_ids) and len(set(answer.choice_ids)) == len(answer.choice_ids)
        case OrderQuestion(), OrderAnswer():
            ids = {i.id for i in question.items}
            return len(answer.item_ids) == len(ids) == len(set(answer.item_ids)) and all(
                x in ids for x in answer.item_ids
            )
        case SliderQuestion(), SliderAnswer():
            return question.min <= answer.value <= question.max
        case WordCloudQuestion(), WordCloudAnswer():
            return len(answer.text) <= question.max_length
        case _:
            return True
