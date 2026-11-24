from __future__ import annotations

from collections.abc import Callable
from typing import Any, ClassVar

import pytest

from pinpop.ai import service as ai_service
from pinpop.ai.providers import ProviderConfig, StructuredRequest
from pinpop.ai.schema import AiQuestion, AiQuiz, lenient_quiz, to_question
from pinpop.ai.sources import html_to_text

from .conftest import register, running

NULLS = {
    "explanation": None,
    "choices": None,
    "correct": None,
    "acceptedAnswers": None,
    "min": None,
    "max": None,
    "step": None,
    "answer": None,
    "tolerance": None,
    "unit": None,
    "items": None,
}

MODEL_OUTPUT = {
    "title": "Our solar system",
    "description": "Planets and more.",
    "tags": ["Space", "Science"],
    "questions": [
        {
            **NULLS,
            "type": "quiz",
            "text": "Largest planet?",
            "choices": [
                {"text": "Jupiter", "correct": True},
                {"text": "Mars", "correct": True},
                {"text": "Venus", "correct": False},
            ],
        },
        {**NULLS, "type": "truefalse", "text": "The Sun is a star.", "correct": True},
        {**NULLS, "type": "slider", "text": "Planets?", "min": 0, "max": 20, "answer": 8, "tolerance": 0},
        {**NULLS, "type": "order", "text": "Closest first", "items": ["Mercury", "Venus", "Earth"]},
        {**NULLS, "type": "poll", "text": "Not requested", "choices": [{"text": "A", "correct": False}]},
    ],
}


class FakeProvider:
    provider = "openai-compatible"
    model = "fake-model"
    requests: ClassVar[list[StructuredRequest[Any]]] = []

    def __init__(self, cfg: ProviderConfig) -> None:
        self.cfg = cfg

    async def generate(self, req: StructuredRequest[Any]) -> Any:
        FakeProvider.requests.append(req)
        if req.schema is AiQuiz:
            return AiQuiz.model_validate(MODEL_OUTPUT)
        return AiQuestion.model_validate(MODEL_OUTPUT["questions"][0])


async def test_generates_normalizes_and_saves_honouring_the_daily_limit(
    settings_factory: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from pinpop.app import Pinpop

    monkeypatch.setattr(ai_service, "create_provider", FakeProvider)
    settings = settings_factory(AI_PROVIDER="openai-compatible", AI_BASE_URL="http://llm.test/v1", AI_DAILY_LIMIT=2)
    async with running(Pinpop(settings)) as client:
        await register(client)
        res = await client.post(
            "/api/ai/generate",
            json={
                "topic": "Solar system",
                "count": 10,
                "types": ["quiz", "truefalse", "slider", "order"],
                "save": True,
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert "Solar system" in FakeProvider.requests[-1].prompt
        assert len(body["quiz"]["questions"]) == 4
        assert body["quiz"]["tags"] == ["space", "science"]
        # Single-answer questions keep only the first correct choice.
        assert sum(c["correct"] for c in body["quiz"]["questions"][0]["choices"]) == 1
        assert body["quizId"]
        assert (await client.get(f"/api/quizzes/{body['quizId']}")).json()["title"] == "Our solar system"

        status = (await client.get("/api/ai/status")).json()
        assert status["enabled"] is True
        assert status["source"] == "instance"
        assert status["usedToday"] == 1
        assert status["dailyLimit"] == 2

        await client.post("/api/ai/generate", json={"topic": "x"})
        limited = await client.post("/api/ai/generate", json={"topic": "x"})
        assert limited.status_code == 429
        assert limited.json()["code"] == "ai_daily_limit"


async def test_improves_a_single_question(
    settings_factory: Callable[..., Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from pinpop.app import Pinpop

    monkeypatch.setattr(ai_service, "create_provider", FakeProvider)
    async with running(Pinpop(settings_factory(AI_PROVIDER="ollama"))) as client:
        await register(client)
        question = {
            "id": "keep-me",
            "type": "quiz",
            "text": "Biggest planet?",
            "points": "double",
            "choices": [{"id": "a", "text": "Jupiter", "correct": True}, {"id": "b", "text": "Mars"}],
        }
        res = await client.post("/api/ai/improve", json={"action": "distractors", "question": question})
        assert res.status_code == 200, res.text
        improved = res.json()["question"]
        assert improved["id"] == "keep-me"
        assert improved["points"] == "double"
        assert improved["text"] == "Largest planet?"


async def test_blocks_private_network_urls(client: Any) -> None:
    await register(client)
    res = await client.post("/api/ai/generate", json={"sourceUrl": "http://127.0.0.1:1/secret"})
    assert res.status_code == 400
    assert res.json()["code"] == "url_not_allowed"


def test_extracts_readable_text_from_html() -> None:
    text = html_to_text(
        "<html><head><script>evil()</script><style>p{}</style></head><body><nav>menu</nav><article><h1>Title</h1>"
        "<p>Hello &amp; welcome to the long enough paragraph about photosynthesis.</p></article></body></html>"
    )
    assert "Hello & welcome" in text
    assert "evil" not in text
    assert "menu" not in text


def test_rejects_unusable_ai_questions() -> None:
    assert to_question(AiQuestion.model_validate({**NULLS, "type": "quiz", "text": "No choices"}), 20) is None
    typed = AiQuestion.model_validate({**NULLS, "type": "type", "text": "Capital?", "acceptedAnswers": ["Ankara"]})
    assert to_question(typed, 20) is not None


def test_lenient_parsing_fills_missing_fields() -> None:
    quiz = lenient_quiz(
        {"title": "T", "questions": [{"type": "truefalse", "text": "Yes?", "correct": True}, {"bad": 1}]}
    )
    assert quiz is not None
    assert len(quiz.questions) == 1
    assert quiz.questions[0].choices is None
