"""Spreadsheet import/export, one question per row:

type, question, answer1..answer6, correct, time, explanation

- type: quiz | multi | truefalse | type | slider | order | poll | wordcloud (default quiz)
- correct: answer number(s) such as "2" or "1,3"; true/false for truefalse;
  accepted answers separated by "|" for type; the number for slider (answer1=min, answer2=max)
- order: answers are listed in the correct order
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterable, Sequence
from typing import Any

from ..domain.helpers import short_id
from ..domain.quiz import (
    MultiQuestion,
    OrderQuestion,
    PollQuestion,
    Question,
    QuizQuestion,
    SliderQuestion,
    TrueFalseQuestion,
    TypeQuestion,
)
from ..errors import bad_request

CSV_HEADERS = (
    "type", "question", "answer1", "answer2", "answer3", "answer4", "answer5", "answer6", "correct", "time",
    "explanation",
)  # fmt: skip
_TRUE = re.compile(r"^(true|1|yes|doğru|dogru|evet)$", re.IGNORECASE)


def write_csv(header: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue().removesuffix("\r\n")


def _int(value: str | None, default: int) -> int:
    match = re.match(r"\s*(-?\d+)", value or "")
    return int(match.group(1)) if match and int(match.group(1)) != 0 else default


def _float(value: str | None, default: float) -> float:
    try:
        return float(value) if value not in (None, "") else default
    except ValueError:
        return float("nan")


def questions_from_csv(text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text.removeprefix("﻿")))
    if reader.fieldnames:
        reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]
    rows = [r for r in reader if any((v or "").strip() for v in r.values() if isinstance(v, str))]
    if not rows:
        raise bad_request("empty_csv")
    if len(rows) > 100:
        raise bad_request("too_many_questions")

    out: list[dict[str, Any]] = []
    for row in rows:
        kind = (row.get("type") or "").strip().lower() or "quiz"
        answers = [a for i in range(1, 7) if (a := (row.get(f"answer{i}") or "").strip())]
        correct = (row.get("correct") or "").strip()
        correct_idx = {int(n) - 1 for n in re.split(r"[,;\s]+", correct) if n.lstrip("-").isdigit()}
        base = {
            "id": short_id(),
            "text": (row.get("question") or "").strip(),
            "timeLimit": _int(row.get("time"), 20),
            "explanation": (row.get("explanation") or "").strip() or None,
        }
        match kind:
            case "truefalse":
                out.append({**base, "type": kind, "correct": bool(_TRUE.match(correct))})
            case "type":
                accepted = [s.strip() for s in correct.split("|")] if correct else answers
                out.append({**base, "type": kind, "acceptedAnswers": accepted})
            case "slider":
                low = _float(answers[0] if answers else None, 0)
                high = _float(answers[1] if len(answers) > 1 else None, 100)
                out.append(
                    {
                        **base,
                        "type": kind,
                        "min": low,
                        "max": high,
                        "step": 1,
                        "correct": _float(correct, 0),
                        "tolerance": 0,
                    }
                )
            case "order":
                out.append({**base, "type": kind, "items": [{"text": t} for t in answers]})
            case "poll":
                out.append({**base, "type": kind, "points": "none", "choices": [{"text": t} for t in answers]})
            case "wordcloud":
                out.append({**base, "type": kind, "points": "none"})
            case _:
                choices = [{"text": t, "correct": i in correct_idx} for i, t in enumerate(answers)]
                out.append({**base, "type": kind, "choices": choices})
    return out


def _num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def questions_to_csv(questions: list[Question]) -> str:
    rows = []
    for q in questions:
        row: dict[str, str] = {
            "type": q.type,
            "question": q.text,
            "time": str(q.time_limit),
            "explanation": q.explanation or "",
        }

        def set_answers(values: list[str], row: dict[str, str] = row) -> None:
            for i, value in enumerate(values):
                row[f"answer{i + 1}"] = value

        match q:
            case QuizQuestion() | MultiQuestion():
                set_answers([c.text for c in q.choices])
                row["correct"] = ",".join(str(i + 1) for i, c in enumerate(q.choices) if c.correct)
            case PollQuestion():
                set_answers([c.text for c in q.choices])
            case TrueFalseQuestion():
                row["correct"] = "true" if q.correct else "false"
            case TypeQuestion():
                row["correct"] = "|".join(q.accepted_answers)
            case SliderQuestion():
                set_answers([_num(q.min), _num(q.max)])
                row["correct"] = _num(q.correct)
            case OrderQuestion():
                set_answers([i.text for i in q.items])
        rows.append([row.get(h, "") for h in CSV_HEADERS])
    return write_csv(CSV_HEADERS, rows)
