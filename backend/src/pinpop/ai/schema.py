"""Flat, provider-friendly output schema.

Every field is required but nullable so it works with strict structured-output modes; model answers are
converted into real Pinpop questions afterwards.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field, ValidationError

from ..domain.base import ApiModel
from ..domain.helpers import short_id
from ..domain.quiz import (
    MultiQuestion,
    OrderQuestion,
    PollQuestion,
    Question,
    QuestionType,
    QuizQuestion,
    SliderQuestion,
    TrueFalseQuestion,
    TypeQuestion,
    question_adapter,
)


class AiChoice(ApiModel):
    text: str
    correct: bool


class AiQuestion(ApiModel):
    type: QuestionType
    text: str = Field(description="The question, max 200 characters")
    explanation: str | None = Field(description="One or two sentences explaining the correct answer")
    choices: list[AiChoice] | None = Field(description="For quiz, multi and poll: 2-6 options, max 75 characters each")
    correct: bool | None = Field(description="For truefalse: whether the statement is true")
    accepted_answers: list[str] | None = Field(description="For type: 1-5 short accepted answers (spelling variants)")
    min: float | None = Field(description="For slider: lower bound")
    max: float | None = Field(description="For slider: upper bound")
    step: float | None = Field(description="For slider: step")
    answer: float | None = Field(description="For slider: the correct value")
    tolerance: float | None = Field(description="For slider: allowed distance from the correct value")
    unit: str | None = Field(description="For slider: unit label such as km or °C")
    items: list[str] | None = Field(description="For order: 3-6 items listed in the CORRECT order")


class AiQuiz(ApiModel):
    title: str = Field(description="Short catchy quiz title")
    description: str = Field(description="One sentence description")
    tags: list[str] = Field(description="2-5 lowercase topic tags")
    questions: list[AiQuestion]


_NULLABLE_KEYS = [AiQuestion.model_fields[name].alias or name for name in AiQuestion.model_fields]


def lenient_question(value: Any) -> AiQuestion | None:
    """Parses a question from a provider without schema enforcement, filling left-out keys with null."""
    if not isinstance(value, dict):
        return None
    filled = {key: None for key in _NULLABLE_KEYS} | value
    try:
        return AiQuestion.model_validate(filled)
    except ValidationError:
        return None


def lenient_quiz(value: Any) -> AiQuiz | None:
    if not isinstance(value, dict) or not isinstance(value.get("questions"), list):
        return None
    questions = [q for item in value["questions"] if (q := lenient_question(item))]
    tags = value.get("tags")
    return AiQuiz(
        title=str(value.get("title") or "Untitled quiz"),
        description=str(value.get("description") or ""),
        tags=[str(t) for t in tags] if isinstance(tags, list) else [],
        questions=questions,
    )


def _clip(value: str, n: int) -> str:
    return value if len(value) <= n else value[: n - 1] + "…"


def _number(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


def to_question(ai: AiQuestion, time_limit: int) -> Question | None:
    """Converts a model answer into a validated Pinpop question, or None if it is unusable."""
    base: dict[str, Any] = {
        "id": short_id(),
        "text": _clip(ai.text.strip(), 500),
        "explanation": _clip(ai.explanation.strip(), 1000) if ai.explanation else None,
        "timeLimit": time_limit,
        "points": "standard",
    }
    choices = [
        {"id": short_id(6), "text": _clip(c.text.strip(), 120), "correct": c.correct}
        for c in (ai.choices or [])
        if c.text.strip()
    ][:6]

    match ai.type:
        case "quiz":
            # Single-answer questions keep only the first correct option.
            seen = False
            for c in choices:
                if c["correct"]:
                    c["correct"] = not seen
                    seen = True
            candidate = {**base, "type": "quiz", "choices": choices}
        case "multi":
            candidate = {**base, "type": "multi", "choices": choices}
        case "poll":
            poll_choices = [{"id": c["id"], "text": c["text"]} for c in choices]
            candidate = {**base, "type": "poll", "points": "none", "choices": poll_choices}
        case "truefalse":
            candidate = {**base, "type": "truefalse", "correct": True if ai.correct is None else ai.correct}
        case "type":
            accepted = [a for a in (_clip(x.strip(), 80) for x in ai.accepted_answers or []) if a][:10]
            candidate = {**base, "type": "type", "acceptedAnswers": accepted}
        case "slider":
            low = ai.min if ai.min is not None else 0
            high = ai.max if ai.max is not None else 100
            candidate = {
                **base,
                "type": "slider",
                "min": _number(low),
                "max": _number(high),
                "step": _number(ai.step) if ai.step and ai.step > 0 else 1,
                "correct": _number(ai.answer if ai.answer is not None else low),
                "tolerance": _number(max(0, ai.tolerance or 0)),
                "unit": _clip(ai.unit, 16) if ai.unit else None,
            }
        case "order":
            items = [{"id": short_id(6), "text": _clip(t.strip(), 120)} for t in (ai.items or [])[:6]]
            candidate = {**base, "type": "order", "items": items}
        case "wordcloud":
            candidate = {**base, "type": "wordcloud", "points": "none", "maxLength": 20}
    try:
        return question_adapter.validate_python(candidate)
    except ValidationError:
        return None


def from_question(q: Question) -> dict[str, Any]:
    """Turns an existing question into the flat schema so a model can rewrite it."""
    out: dict[str, Any] = {key: None for key in _NULLABLE_KEYS}
    out.update(type=q.type, text=q.text, explanation=q.explanation)
    match q:
        case QuizQuestion() | MultiQuestion():
            out["choices"] = [{"text": c.text, "correct": c.correct} for c in q.choices]
        case PollQuestion():
            out["choices"] = [{"text": c.text, "correct": False} for c in q.choices]
        case TrueFalseQuestion():
            out["correct"] = q.correct
        case TypeQuestion():
            out["acceptedAnswers"] = q.accepted_answers
        case SliderQuestion():
            out.update(min=q.min, max=q.max, step=q.step, answer=q.correct, tolerance=q.tolerance, unit=q.unit)
        case OrderQuestion():
            out["items"] = [i.text for i in q.items]
    return out
