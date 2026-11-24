from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import anthropic
import openai
from pydantic import BaseModel

from ..errors import HttpError

DEFAULT_MODELS = {
    "anthropic": "claude-opus-5-5",
    "openai": "gpt-5-mini",
    "openrouter": "anthropic/claude-opus-5-5",
    "ollama": "llama3.2",
    "openai-compatible": "default",
}

DEFAULT_BASE_URLS = {
    "openrouter": "https://openrouter.ai/api/v1",
    "ollama": "http://localhost:11434/v1",
}


def ai_unavailable(message: str) -> HttpError:
    return HttpError(503, "ai_unavailable", message)


def ai_failed(message: str) -> HttpError:
    return HttpError(502, "ai_failed", message)


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None


@dataclass(frozen=True)
class StructuredRequest[T: BaseModel]:
    system: str
    prompt: str
    schema: type[T]
    #: Forgiving parser used for providers that only support free-form JSON mode.
    lenient: Callable[[Any], T | None]
    #: Short description of the expected JSON, used by providers without native schema support.
    shape_hint: str


class AiProviderClient(Protocol):
    provider: str
    model: str

    async def generate[T: BaseModel](self, req: StructuredRequest[T]) -> T: ...


def create_provider(cfg: ProviderConfig) -> AiProviderClient:
    model = cfg.model or DEFAULT_MODELS[cfg.provider]
    if cfg.provider == "anthropic":
        return AnthropicProvider(cfg, model)
    return OpenAICompatibleProvider(cfg, model)


class AnthropicProvider:
    provider = "anthropic"

    def __init__(self, cfg: ProviderConfig, model: str) -> None:
        if not cfg.api_key:
            raise ai_unavailable("Anthropic API key is missing")
        self.model = model
        self._client = anthropic.AsyncAnthropic(api_key=cfg.api_key, base_url=cfg.base_url, max_retries=2)

    async def generate[T: BaseModel](self, req: StructuredRequest[T]) -> T:
        try:
            response = await self._client.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=req.system,
                messages=[{"role": "user", "content": req.prompt}],
                output_format=req.schema,
            )
        except Exception as err:
            raise _translate_error(err) from err
        if response.stop_reason == "refusal":
            raise ai_failed("The model declined this request")
        if response.stop_reason == "max_tokens":
            raise ai_failed("The response was too long; try fewer questions")
        if response.parsed_output is None:
            raise ai_failed("The model returned an unexpected format")
        return response.parsed_output


class OpenAICompatibleProvider:
    def __init__(self, cfg: ProviderConfig, model: str) -> None:
        self.provider = cfg.provider
        self.model = model
        base_url = cfg.base_url or DEFAULT_BASE_URLS.get(cfg.provider)
        if cfg.provider == "openai-compatible" and not base_url:
            raise ai_unavailable("AI base URL is missing")
        if not cfg.api_key and cfg.provider not in ("ollama", "openai-compatible"):
            raise ai_unavailable(f"{cfg.provider} API key is missing")
        self._client = openai.AsyncOpenAI(
            api_key=cfg.api_key or "not-needed",
            base_url=base_url,
            max_retries=2,
            timeout=180,
            default_headers={"X-Title": "Pinpop"} if cfg.provider == "openrouter" else None,
        )

    async def generate[T: BaseModel](self, req: StructuredRequest[T]) -> T:
        try:
            completion = await self._client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": f"{req.system}\n\nRespond with a single JSON object only. {req.shape_hint}",
                    },
                    {"role": "user", "content": req.prompt},
                ],
            )
        except Exception as err:
            raise _translate_error(err) from err
        content = completion.choices[0].message.content if completion.choices else None
        if not content:
            raise ai_failed("The model returned an empty response")
        try:
            data = json.loads(_strip_code_fence(content))
        except json.JSONDecodeError as err:
            raise ai_failed("The model did not return valid JSON") from err
        parsed = req.lenient(data)
        if parsed is None:
            raise ai_failed("The model returned an unexpected format")
        return parsed


_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```")


def _strip_code_fence(text: str) -> str:
    match = _FENCE.search(text)
    return (match.group(1) if match else text).strip()


def _translate_error(err: Exception) -> Exception:
    if isinstance(err, HttpError):
        return err
    if isinstance(err, anthropic.AuthenticationError | openai.AuthenticationError):
        return ai_unavailable("The AI provider rejected the API key")
    if isinstance(err, anthropic.RateLimitError | openai.RateLimitError):
        return HttpError(429, "ai_rate_limited", "The AI provider is rate limiting requests")
    if isinstance(err, anthropic.NotFoundError | openai.NotFoundError):
        return ai_unavailable("The configured AI model was not found")
    if isinstance(err, anthropic.APIConnectionError | openai.APIConnectionError):
        return ai_unavailable("Could not reach the AI provider")
    if isinstance(err, anthropic.APIError | openai.APIError):
        return ai_failed(err.message)
    return err
