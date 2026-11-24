from __future__ import annotations

from typing import Literal

Difficulty = Literal["easy", "medium", "hard", "mixed"]
ImproveAction = Literal["harder", "easier", "distractors", "explain", "rephrase", "translate"]

TYPE_GUIDE = {
    "quiz": "quiz: single correct answer. 4 choices (exactly one correct: true), plausible distractors.",
    "multi": "multi: 4-6 choices with 2 or more correct ones.",
    "truefalse": "truefalse: a clear statement; set `correct` to whether it is true.",
    "type": "type: the player types a short answer (1-3 words). List spelling variants in acceptedAnswers.",
    "slider": "slider: numeric estimate. Set min, max, step, answer, a fair tolerance and unit.",
    "order": "order: 3-6 items to sort (chronology, size, steps). List items in the correct order.",
    "poll": "poll: an opinion question with 2-5 choices and no correct answer (all correct: false).",
    "wordcloud": "wordcloud: an open prompt asking players for one word.",
}

DIFFICULTY_GUIDE = {
    "easy": "Easy: common knowledge, friendly wording.",
    "medium": "Medium: requires some knowledge of the topic.",
    "hard": "Hard: for enthusiasts; precise details, tricky but fair distractors.",
    "mixed": "Mixed: start easy and gradually get harder.",
}

SYSTEM_PROMPT = """You are Pinpop's quiz writer. You create engaging, factually accurate questions for live classroom and party quiz games played on phones.

Rules:
- Questions must be unambiguous and have verifiable answers. Never invent facts. If source material is given, base every question on it.
- Keep questions short enough to read in a few seconds (under 200 characters) and choices under 75 characters.
- Distractors must be plausible and similar in length to the correct choice. Avoid "all of the above" and "none of the above".
- Vary which position holds the correct answer.
- Write an explanation (1-2 sentences) for every scored question.
- Write everything (title, questions, choices, explanations) in the requested language.
- Set fields that do not apply to a question's type to null.
- Content must be appropriate for all ages unless the audience says otherwise."""


def build_generate_prompt(
    *,
    topic: str | None,
    source_text: str | None,
    count: int,
    difficulty: Difficulty,
    language: str,
    types: list[str],
    audience: str | None,
) -> str:
    lines = [
        f"Create a quiz with exactly {count} questions.",
        f"Topic / instructions: {topic}" if topic else "Topic: derive it from the source material.",
        f"Language: {language}",
        f"Difficulty: {DIFFICULTY_GUIDE[difficulty]}",
    ]
    if audience:
        lines.append(f"Audience: {audience}")
    lines += ["", "Allowed question types (mix them, favouring the first ones listed):"]
    lines += [f"- {TYPE_GUIDE[t]}" for t in types]
    if source_text:
        lines += ["", "Source material (base the questions only on this):", "<source>", source_text, "</source>"]
    return "\n".join(lines)


IMPROVE_INSTRUCTIONS: dict[str, str] = {
    "harder": "Make this question harder while keeping it fair and keeping the same type.",
    "easier": "Make this question easier and more approachable while keeping the same type.",
    "distractors": "Keep the question and the correct answer but write better, more plausible wrong choices.",
    "explain": "Keep everything the same but write a clear, short explanation of the correct answer.",
    "rephrase": "Rephrase the question to be clearer and more engaging. Keep the meaning and answers.",
    "translate": "Translate the question and all its answers and explanation into the requested language.",
}
