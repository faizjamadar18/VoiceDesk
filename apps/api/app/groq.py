"""Groq-backed planner client for Kestrel using OpenAI-compatible tool calling."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import Sequence

import httpx

from app.tools import LlmReply, ToolCall, ToolSpec

logger = logging.getLogger("kestrel.groq")

DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"
GROQ_FALLBACK_MODELS = ("openai/gpt-oss-120b", "qwen/qwen3.8-27b")
GROQ_TIMEOUT_SECONDS = 5.0


class GroqError(RuntimeError):
    """Raised when the Groq planner cannot produce a decision."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class GroqQuotaError(GroqError):
    """The API key's quota is exhausted for this model (HTTP 429)."""


class GroqClient:
    """``LlmClient`` over Groq's OpenAI-compatible function calling API."""

    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
        base_url: str = DEFAULT_GROQ_BASE_URL,
        model: str = DEFAULT_GROQ_MODEL,
    ) -> None:
        self._api_key = api_key
        self._client = client
        self.base_url = base_url.rstrip("/")
        self.model = model

    @classmethod
    def from_env(cls) -> "GroqClient":
        return cls(
            api_key=_api_key_from_env(),
            base_url=_base_url_from_env(),
            model=os.getenv("KESTREL_GROQ_MODEL") or DEFAULT_GROQ_MODEL,
        )

    async def choose(self, transcript: str, specs: list[ToolSpec]) -> LlmReply:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        remaining = list(specs)
        response: httpx.Response | None = None
        for attempt in range(2):
            body = self._build_body(transcript, remaining)
            response = await self._post(url, headers, body)
            if response.status_code == 400 and attempt == 0:
                dropped = _offending_tool(response, remaining)
                if dropped is not None:
                    logger.warning(
                        "Groq rejected the schema for tool %r; retrying "
                        "without it.",
                        dropped,
                    )
                    remaining = [
                        spec for spec in remaining if spec.name != dropped
                    ]
                    continue
            break

        assert response is not None
        if response.status_code == 429:
            raise GroqQuotaError(
                f"Groq quota exhausted for {self.model} (HTTP 429).", status=429
            )

        if response.status_code >= 400:
            message = (
                f"Groq planner failed with HTTP {response.status_code}: "
                f"{_error_snippet(response)}"
            )
            raise GroqError(message, status=response.status_code)

        try:
            data = response.json()
        except ValueError as exc:
            raise GroqError("Groq response was not valid JSON.") from exc

        return _reply_from_response(data)

    def _build_body(
        self, transcript: str, specs: list[ToolSpec]
    ) -> dict:
        tools = [
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                },
            }
            for spec in specs
        ]
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Kestrel, an executive assistant on Windows. "
                        "When the user asks to open an application, search files, check weather, "
                        "type text, or perform any action, call the corresponding tool. "
                        "Always call a tool if one fits the user's intent."
                    ),
                },
                {"role": "user", "content": transcript},
            ],
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.1,
        }

    async def _post(
        self, url: str, headers: dict[str, str], body: dict
    ) -> httpx.Response:
        try:
            if self._client is None:
                async with httpx.AsyncClient(
                    timeout=GROQ_TIMEOUT_SECONDS
                ) as client:
                    return await client.post(url, json=body, headers=headers)
            return await self._client.post(
                url, json=body, headers=headers, timeout=GROQ_TIMEOUT_SECONDS
            )
        except httpx.RequestError as exc:
            raise GroqError(
                f"Groq planner request failed ({type(exc).__name__})."
            ) from exc


def _reply_from_response(data: dict) -> LlmReply:
    """Build an :class:`LlmReply` from one chat-completions response."""
    return LlmReply(
        calls=_tool_calls_from_response(data),
        content=_content_from_response(data),
    )


def _content_from_response(data: dict) -> str | None:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    message = choices[0].get("message")
    if not isinstance(message, dict):
        return None

    content = message.get("content")
    if not isinstance(content, str):
        return None
    stripped = content.strip()
    return stripped or None


def _tool_calls_from_response(data: dict) -> list[ToolCall]:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return []

    message = choices[0].get("message")
    if not isinstance(message, dict):
        return []

    raw_tool_calls = message.get("tool_calls")
    if not isinstance(raw_tool_calls, list) or not raw_tool_calls:
        return []

    calls: list[ToolCall] = []
    for item in raw_tool_calls:
        if not isinstance(item, dict):
            continue
        fn = item.get("function")
        if not isinstance(fn, dict):
            continue
        name = fn.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        args_raw = fn.get("arguments", "{}")
        if isinstance(args_raw, str):
            try:
                args = json.loads(args_raw)
            except ValueError:
                args = {}
        elif isinstance(args_raw, dict):
            args = args_raw
        else:
            args = {}
        calls.append(ToolCall(name=name, arguments=args))

    return calls


def _error_snippet(response: httpx.Response) -> str:
    try:
        data = response.json()
        error = data.get("error")
        if isinstance(error, dict) and "message" in error:
            return str(error["message"])
        return str(data)
    except Exception:
        return response.text[:200]


_TOOL_NAME_PATTERN = re.compile(r"tool[^A-Za-z0-9_\-]+([A-Za-z0-9_\-]+)")


def _offending_tool(
    response: httpx.Response, specs: list[ToolSpec]
) -> str | None:
    """Name the tool whose schema Groq rejected, if the error names one.

    Only consults responses whose message looks like a schema or parameter
    complaint, so an unrelated ``400`` is never mistaken for a bad tool.
    """
    message = _error_snippet(response)
    lowered = message.lower()
    if "schema" not in lowered and "parameters" not in lowered:
        return None
    names = {spec.name for spec in specs}
    match = _TOOL_NAME_PATTERN.search(message)
    if match is not None and match.group(1) in names:
        return match.group(1)
    for name in names:
        if name in message:
            return name
    return None


def _api_key_from_env() -> str:
    key = os.getenv("KESTREL_GROQ_API_KEY", "").strip() or os.getenv(
        "GROQ_API_KEY", ""
    ).strip()
    if not key:
        raise RuntimeError("No Groq API key found in environment.")
    return key


def _base_url_from_env() -> str:
    url = os.getenv("KESTREL_GROQ_BASE_URL", "").strip()
    return url or DEFAULT_GROQ_BASE_URL


def _model_chain_from_env() -> tuple[str, ...]:
    preferred = os.getenv("KESTREL_GROQ_MODEL") or DEFAULT_GROQ_MODEL
    chain = [preferred]
    for model in GROQ_FALLBACK_MODELS:
        if model not in chain:
            chain.append(model)
    return tuple(chain)


class ResilientLlmClient:
    """``LlmClient`` that wraps a chain of models and handles fallbacks."""

    def __init__(
        self,
        clients: Sequence[GroqClient],
        *,
        attempts: int = 2,
        backoff: float = 0.3,
        cooldown: float = 120.0,
        clock=time.monotonic,
        sleep=asyncio.sleep,
    ) -> None:
        self._clients = list(clients)
        self._attempts = max(1, attempts)
        self._backoff = backoff
        self._cooldown = cooldown
        self._clock = clock
        self._sleep = sleep
        self._skip_until: dict[str, float] = {}

    @property
    def models(self) -> list[str]:
        return [client.model for client in self._clients]

    def _ordered(self) -> list[GroqClient]:
        now = self._clock()
        ready = [
            client
            for client in self._clients
            if self._skip_until.get(client.model, 0.0) <= now
        ]
        cooling = [
            client
            for client in self._clients
            if self._skip_until.get(client.model, 0.0) > now
        ]
        return ready + cooling

    async def choose(self, transcript: str, specs: list[ToolSpec]) -> LlmReply:
        failures: list[str] = []
        now = self._clock()
        for client in self._ordered():
            cooling = self._skip_until.get(client.model, 0.0) > now
            attempts = 1 if cooling else self._attempts
            for attempt in range(attempts):
                try:
                    return await client.choose(transcript, specs)
                except GroqQuotaError as exc:
                    self._skip_until[client.model] = self._clock() + self._cooldown
                    failures.append(f"{client.model}: {exc}")
                    logger.warning(
                        "Groq model %s is out of quota; skipping it for %ds.",
                        client.model,
                        int(self._cooldown),
                    )
                    break
                except GroqError as exc:
                    failures.append(f"{client.model}: {exc}")
                    logger.warning(
                        "Groq model %s failed (attempt %d/%d): %s",
                        client.model,
                        attempt + 1,
                        attempts,
                        exc,
                    )
                    if attempt + 1 < attempts:
                        await self._sleep(self._backoff * (attempt + 1))
        raise GroqError("All Groq models failed: " + "; ".join(failures))


def resilient_from_env() -> ResilientLlmClient:
    api_key = _api_key_from_env()
    base_url = _base_url_from_env()
    return ResilientLlmClient(
        [
            GroqClient(api_key=api_key, base_url=base_url, model=model)
            for model in _model_chain_from_env()
        ]
    )

