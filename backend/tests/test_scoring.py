from __future__ import annotations

from typing import Any

from pinpop.domain.quiz import question_adapter
from pinpop.domain.scoring import (
    Evaluation,
    answer_adapter,
    compute_points,
    evaluate_answer,
    is_answer_well_formed,
    normalize_text,
)


def q(**data: Any) -> Any:
    return question_adapter.validate_python({"id": "q", "text": "?", **data})


def a(**data: Any) -> Any:
    return answer_adapter.validate_python(data)


quiz = q(type="quiz", choices=[{"id": "a", "text": "A"}, {"id": "b", "text": "B", "correct": True}])
multi = q(
    type="multi",
    choices=[
        {"id": "a", "text": "A", "correct": True},
        {"id": "b", "text": "B", "correct": True},
        {"id": "c", "text": "C"},
    ],
)
slider = q(type="slider", min=0, max=100, correct=50, tolerance=5)
order = q(type="order", items=[{"id": "1", "text": "One"}, {"id": "2", "text": "Two"}, {"id": "3", "text": "Three"}])


def test_normalizes_turkish_characters_and_diacritics() -> None:
    assert normalize_text("  İSTANBUL ") == "istanbul"
    assert normalize_text("Çağlayan  Şelalesi!") == "caglayan selalesi"
    assert normalize_text("Café") == "cafe"


def test_scores_single_choice() -> None:
    assert evaluate_answer(quiz, a(type="quiz", choiceId="b")) == Evaluation(True, 1)
    assert evaluate_answer(quiz, a(type="quiz", choiceId="a")) == Evaluation(False, 0)


def test_gives_partial_credit_for_multi_select() -> None:
    assert evaluate_answer(multi, a(type="multi", choiceIds=["a", "b"])) == Evaluation(True, 1)
    assert evaluate_answer(multi, a(type="multi", choiceIds=["a"])) == Evaluation(False, 0.5)
    assert evaluate_answer(multi, a(type="multi", choiceIds=["a", "c"])).ratio == 0


def test_fades_slider_points() -> None:
    assert evaluate_answer(slider, a(type="slider", value=53)).correct is True
    near = evaluate_answer(slider, a(type="slider", value=60))
    assert near.correct is False
    assert 0 < near.ratio < 0.5
    assert evaluate_answer(slider, a(type="slider", value=100)).ratio == 0


def test_checks_order() -> None:
    assert evaluate_answer(order, a(type="order", itemIds=["1", "2", "3"])).correct is True
    partial = evaluate_answer(order, a(type="order", itemIds=["1", "3", "2"]))
    assert partial.correct is False
    assert partial.ratio > 0


def test_rejects_mismatched_types() -> None:
    assert evaluate_answer(quiz, a(type="truefalse", value=True)) == Evaluation(False, 0)


def test_typed_answers_ignore_case_and_accents() -> None:
    typed = q(type="type", acceptedAnswers=["Ankara"])
    assert evaluate_answer(typed, a(type="type", text=" ANKARA ")).correct is True


def test_rewards_speed() -> None:
    ok = Evaluation(True, 1)
    fast = compute_points(quiz, ok, elapsed_ms=0, time_limit_ms=20_000, streak=1)
    slow = compute_points(quiz, ok, elapsed_ms=20_000, time_limit_ms=20_000, streak=1)
    assert fast == 1000
    assert slow == 500


def test_adds_capped_streak_bonus() -> None:
    ok = Evaluation(True, 1)
    assert compute_points(quiz, ok, elapsed_ms=0, time_limit_ms=20_000, streak=3) == 1200
    assert compute_points(quiz, ok, elapsed_ms=0, time_limit_ms=20_000, streak=50) == 1500


def test_gives_zero_for_no_points_questions() -> None:
    none = q(type="quiz", points="none", choices=[{"id": "a", "text": "A", "correct": True}, {"id": "b", "text": "B"}])
    assert compute_points(none, Evaluation(True, 1), elapsed_ms=0, time_limit_ms=1000, streak=1) == 0
    poll = q(type="poll", choices=[{"id": "a", "text": "A"}, {"id": "b", "text": "B"}])
    assert compute_points(poll, Evaluation(None, 0), elapsed_ms=0, time_limit_ms=1000, streak=1) == 0


def test_validates_answer_ids() -> None:
    assert is_answer_well_formed(quiz, a(type="quiz", choiceId="a"))
    assert not is_answer_well_formed(quiz, a(type="quiz", choiceId="zzz"))
    assert not is_answer_well_formed(multi, a(type="multi", choiceIds=["a", "a"]))
    assert not is_answer_well_formed(order, a(type="order", itemIds=["1", "2"]))
    assert not is_answer_well_formed(slider, a(type="slider", value=101))
