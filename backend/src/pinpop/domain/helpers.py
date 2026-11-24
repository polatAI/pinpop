from __future__ import annotations

import random as _random
import re
import secrets
import unicodedata
from collections.abc import Callable, Sequence
from typing import Any

from .quiz import (
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

Random = Callable[[], float]


def shuffle[T](items: Sequence[T], random: Random = _random.random) -> list[T]:
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = int(random() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out


def shuffle_order_items[T: dict[str, Any]](items: Sequence[T], random: Random = _random.random) -> list[T]:
    """Shuffles order items until the order differs from the solution (when possible)."""
    if len(items) < 2:
        return list(items)
    for _ in range(10):
        out = shuffle(items, random)
        if any(a["id"] != b["id"] for a, b in zip(out, items, strict=True)):
            return out
    return list(reversed(items))


def to_public_question(q: Question) -> dict[str, Any]:
    """The question as players see it: no solution data."""
    meta: dict[str, Any] = {
        "id": q.id,
        "text": q.text,
        "image": q.image,
        "timeLimit": q.time_limit,
        "points": q.points,
    }
    match q:
        case QuizQuestion() | MultiQuestion() | PollQuestion():
            pub: dict[str, Any] = {"type": q.type, "choices": [{"id": c.id, "text": c.text} for c in q.choices]}
        case TrueFalseQuestion():
            pub = {"type": "truefalse"}
        case TypeQuestion():
            pub = {"type": "type", "maxLength": 80}
        case SliderQuestion():
            pub = {"type": "slider", "min": q.min, "max": q.max, "step": q.step, "unit": q.unit}
        case OrderQuestion():
            pub = {"type": "order", "items": [{"id": i.id, "text": i.text} for i in q.items]}
        case WordCloudQuestion():
            pub = {"type": "wordcloud", "maxLength": q.max_length}
    return {**meta, **pub}


_ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"


def short_id(length: int = 10) -> str:
    """Short random id suitable for questions and choices."""
    return "".join(_ID_ALPHABET[b % len(_ID_ALPHABET)] for b in secrets.token_bytes(length))


_ADJECTIVES = [
    "Brave", "Cosmic", "Dizzy", "Electric", "Fuzzy", "Giant", "Happy", "Jolly", "Lucky", "Mighty",
    "Neon", "Quick", "Rapid", "Sneaky", "Sunny", "Turbo", "Witty", "Zesty", "Bouncy", "Clever",
]  # fmt: skip
_NOUNS = [
    "Otter", "Panda", "Comet", "Pickle", "Waffle", "Rocket", "Llama", "Noodle", "Pixel", "Mango",
    "Falcon", "Taco", "Badger", "Muffin", "Penguin", "Wizard", "Koala", "Cactus", "Dragon", "Bubble",
]  # fmt: skip


def random_nickname(random: Random = _random.random) -> str:
    return _ADJECTIVES[int(random() * len(_ADJECTIVES))] + _NOUNS[int(random() * len(_NOUNS))]


_WHITESPACE = re.compile(r"\s+")


def sanitize_nickname(value: str) -> str:
    """Strips control characters and squashes whitespace in a nickname. Returns "" when unusable."""
    value = "".join(c for c in value if not unicodedata.category(c).startswith("C"))
    return _WHITESPACE.sub(" ", value).strip()[:20]


def question_with_ids(question: Any) -> Any:
    """Assigns ids to a question and its choices/items when missing."""
    if not isinstance(question, dict):
        return question
    q = dict(question)
    if not isinstance(q.get("id"), str) or not q["id"]:
        q["id"] = short_id()
    for key in ("choices", "items"):
        if isinstance(q.get(key), list):
            q[key] = [{**c, "id": short_id(6)} if isinstance(c, dict) and not c.get("id") else c for c in q[key]]
    return q


def with_generated_ids(quiz_like: Any) -> Any:
    """Lets API clients (and AI agents) send questions without inventing ids themselves."""
    if not isinstance(quiz_like, dict) or not isinstance(quiz_like.get("questions"), list):
        return quiz_like
    return {**quiz_like, "questions": [question_with_ids(q) for q in quiz_like["questions"]]}
