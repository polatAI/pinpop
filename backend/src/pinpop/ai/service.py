from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..config import AiProvider, Settings
from ..db.database import Database
from ..db.models import AiUsage, User
from ..domain.quiz import QuestionType, question_adapter
from ..errors import bad_request, too_many_requests
from ..security import decrypt_secret, encrypt_secret
from .prompts import IMPROVE_INSTRUCTIONS, SYSTEM_PROMPT, Difficulty, ImproveAction, build_generate_prompt
from .providers import AiProviderClient, ProviderConfig, StructuredRequest, ai_failed, ai_unavailable, create_provider
from .schema import AiQuestion, AiQuiz, from_question, lenient_question, lenient_quiz, to_question
from .sources import fetch_url_text

QUIZ_SHAPE_HINT = (
    'Shape: {"title": string, "description": string, "tags": string[], "questions": [{"type": '
    '"quiz"|"multi"|"truefalse"|"type"|"slider"|"order"|"poll"|"wordcloud", "text": string, "explanation": '
    'string|null, "choices": [{"text": string, "correct": boolean}]|null, "correct": boolean|null, '
    '"acceptedAnswers": string[]|null, "min": number|null, "max": number|null, "step": number|null, "answer": '
    'number|null, "tolerance": number|null, "unit": string|null, "items": string[]|null}]}'
)
QUESTION_SHAPE_HINT = (
    'Shape: {"type": string, "text": string, "explanation": string|null, "choices": [{"text": string, "correct": '
    'boolean}]|null, "correct": boolean|null, "acceptedAnswers": string[]|null, "min": number|null, "max": '
    'number|null, "step": number|null, "answer": number|null, "tolerance": number|null, "unit": string|null, '
    '"items": string[]|null}'
)


class AiSettingsInput(BaseModel):
    provider: AiProvider
    model: str | None = Field(default=None, max_length=120)
    apiKey: str | None = Field(default=None, max_length=500)
    baseUrl: str | None = Field(default=None, max_length=500, pattern=r"^https?://")


def _default_types() -> list[QuestionType]:
    return ["quiz", "truefalse"]


class GenerateInput(BaseModel):
    #: Topic or instruction, e.g. "Photosynthesis for 7th graders".
    topic: str | None = Field(default=None, max_length=500)
    #: Source material: lesson notes, article text etc.
    sourceText: str | None = Field(default=None, max_length=60_000)
    #: Public web page to build questions from.
    sourceUrl: str | None = Field(default=None, max_length=2000, pattern=r"^https?://")
    count: int = Field(default=10, ge=1, le=30)
    difficulty: Difficulty = "medium"
    language: str = Field(default="en", min_length=2, max_length=40)
    types: list[QuestionType] = Field(default_factory=_default_types, min_length=1)
    timeLimit: int = Field(default=20, ge=5, le=240)
    audience: str | None = Field(default=None, max_length=120)
    #: Save as a new quiz and return its id.
    save: bool = False


class ImproveInput(BaseModel):
    action: ImproveAction
    question: Any = None
    language: str | None = Field(default=None, min_length=2, max_length=40)


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


class AiService:
    def __init__(self, settings: Settings, db: Database) -> None:
        self._settings = settings
        self._db = db

    def _instance_config(self) -> ProviderConfig | None:
        s = self._settings
        if not s.AI_PROVIDER:
            return None
        return ProviderConfig(s.AI_PROVIDER, s.AI_API_KEY, s.AI_MODEL, s.AI_BASE_URL)

    def _user_config(self, user: User) -> ProviderConfig | None:
        stored = user.ai_settings
        if not self._settings.AI_ALLOW_USER_KEYS or not stored:
            return None
        encrypted = stored.get("apiKeyEnc")
        api_key = decrypt_secret(encrypted, self._settings.app_secret) if encrypted else None
        return ProviderConfig(stored["provider"], api_key, stored.get("model"), stored.get("baseUrl"))

    def _resolve(self, user: User) -> tuple[ProviderConfig, Literal["user", "instance"]] | None:
        if own := self._user_config(user):
            return own, "user"
        if instance := self._instance_config():
            return instance, "instance"
        return None

    @property
    def instance_enabled(self) -> bool:
        return self._instance_config() is not None

    async def status(self, user: User) -> dict[str, Any]:
        resolved = self._resolve(user)
        return {
            "enabled": resolved is not None,
            "source": resolved[1] if resolved else None,
            "provider": resolved[0].provider if resolved else None,
            "model": resolved[0].model if resolved else None,
            "userKeysAllowed": self._settings.AI_ALLOW_USER_KEYS,
            "dailyLimit": self._settings.AI_DAILY_LIMIT or None,
            "usedToday": await self._used_today(user.id),
        }

    async def save_user_settings(self, user: User, data: AiSettingsInput | None) -> None:
        if data and not self._settings.AI_ALLOW_USER_KEYS:
            raise bad_request("user_keys_disabled")
        stored: dict[str, Any] | None = None
        if data:
            previous = user.ai_settings or {}
            # Keep the existing key when the client sends settings without a new one.
            previous_key = previous.get("apiKeyEnc") if previous.get("provider") == data.provider else None
            api_key = (data.apiKey or "").strip()
            stored = {"provider": data.provider}
            if data.model and data.model.strip():
                stored["model"] = data.model.strip()
            if data.baseUrl:
                stored["baseUrl"] = data.baseUrl
            key = encrypt_secret(api_key, self._settings.app_secret) if api_key else previous_key
            if key:
                stored["apiKeyEnc"] = key
        async with self._db.session() as s, s.begin():
            await s.execute(update(User).where(User.id == user.id).values(ai_settings=stored))

    async def _with_provider[T](self, user: User, fn: Callable[[AiProviderClient], Awaitable[T]]) -> T:
        """Runs a request with the user's provider; server-key usage is limited and counted only on success."""
        resolved = self._resolve(user)
        if not resolved:
            raise ai_unavailable("AI is not configured on this server. Add your own key in settings.")
        cfg, source = resolved
        metered = source == "instance"
        limit = self._settings.AI_DAILY_LIMIT
        if metered and limit > 0 and await self._used_today(user.id) >= limit:
            raise too_many_requests("ai_daily_limit")
        result = await fn(create_provider(cfg))
        if metered:
            await self._record_usage(user.id)
        return result

    async def _used_today(self, user_id: str) -> int:
        async with self._db.session() as s:
            count = (
                await s.execute(select(AiUsage.count).where(AiUsage.user_id == user_id, AiUsage.day == _today()))
            ).scalar_one_or_none()
        return count or 0

    async def _record_usage(self, user_id: str) -> None:
        insert = pg_insert if self._db.kind == "postgres" else sqlite_insert
        stmt = insert(AiUsage).values(user_id=user_id, day=_today(), count=1)
        stmt = stmt.on_conflict_do_update(index_elements=["user_id", "day"], set_={"count": AiUsage.count + 1})
        async with self._db.session() as s, s.begin():
            await s.execute(stmt)

    async def generate(self, user: User, raw: Any, extra_source: str | None = None) -> dict[str, Any]:
        try:
            data = raw if isinstance(raw, GenerateInput) else GenerateInput.model_validate(raw)
        except ValidationError as err:
            raise bad_request("validation_error") from err
        source_text = "\n\n".join(x for x in (data.sourceText, extra_source) if x) or None
        if data.sourceUrl:
            from_url = await fetch_url_text(data.sourceUrl)
            source_text = f"{source_text}\n\n{from_url}" if source_text else from_url
        if not data.topic and not source_text:
            raise bad_request("topic_or_source_required")

        async def run(provider: AiProviderClient) -> tuple[AiQuiz, list[dict[str, Any]]]:
            result = await provider.generate(
                StructuredRequest(
                    system=SYSTEM_PROMPT,
                    prompt=build_generate_prompt(
                        topic=data.topic,
                        source_text=source_text,
                        count=data.count,
                        difficulty=data.difficulty,
                        language=data.language,
                        types=list(data.types),
                        audience=data.audience,
                    ),
                    schema=AiQuiz,
                    lenient=lenient_quiz,
                    shape_hint=QUIZ_SHAPE_HINT,
                )
            )
            questions = [
                q.dump()
                for ai in result.questions
                if ai.type in data.types and (q := to_question(ai, data.timeLimit)) is not None
            ][: data.count]
            if not questions:
                raise ai_failed("The AI did not return any usable questions")
            return result, questions

        result, questions = await self._with_provider(user, run)
        tags = [t for t in (tag.lower().strip()[:30] for tag in result.tags) if t][:5]
        return {
            "title": result.title.strip()[:120] or (data.topic or "")[:120] or "AI quiz",
            "description": result.description.strip()[:1000],
            "tags": tags,
            "language": data.language[:10],
            "questions": questions,
        }

    async def improve(self, user: User, action: str, raw: Any, language: str | None) -> dict[str, Any]:
        try:
            question = question_adapter.validate_python(raw)
        except ValidationError as err:
            raise bad_request("invalid_question") from err
        prompt = "\n".join(
            [
                IMPROVE_INSTRUCTIONS[action],
                f"Language: {language}" if language else "Keep the original language.",
                f'Keep the question type "{question.type}".',
                "",
                "Question:",
                json.dumps(from_question(question), ensure_ascii=False),
            ]
        )

        async def run(provider: AiProviderClient) -> dict[str, Any]:
            result = await provider.generate(
                StructuredRequest(
                    system=SYSTEM_PROMPT,
                    prompt=prompt,
                    schema=AiQuestion,
                    lenient=lenient_question,
                    shape_hint=QUESTION_SHAPE_HINT,
                )
            )
            improved = to_question(result.model_copy(update={"type": question.type}), question.time_limit)
            if improved is None:
                raise ai_failed("The AI returned an invalid question")
            return improved.dump()

        improved = await self._with_provider(user, run)
        return {**improved, "id": question.id, "points": question.points, "image": question.image}
