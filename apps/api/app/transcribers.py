"""Transcription providers for the Kestrel API.

Audio is held in memory only. Nothing here writes audio to disk, a database,
or logs.
"""

from __future__ import annotations

import asyncio
import os
from typing import Protocol

import httpx

DEFAULT_FAKE_TRANSCRIPT = "Fake transcription from Kestrel."
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"
GROQ_TIMEOUT_SECONDS = 30.0

_CONTENT_TYPE_EXTENSIONS = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav",
}


class MissingProviderKeyError(RuntimeError):
    """Raised when the selected provider has no server-side API key."""


class TranscriptionProviderError(RuntimeError):
    """Raised when a provider cannot produce a transcript."""


class Transcriber(Protocol):
    name: str

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        """Return the transcript for audio bytes. Never persist the audio."""
        ...


class FakeTranscriber:
    """Deterministic local provider for development and tests."""

    name = "fake"

    def __init__(
        self,
        transcript: str = DEFAULT_FAKE_TRANSCRIPT,
        delay_ms: int = 0,
    ) -> None:
        self._transcript = transcript
        self._delay_ms = max(0, delay_ms)

    @classmethod
    def from_env(cls) -> "FakeTranscriber":
        transcript = os.getenv("KESTREL_FAKE_TRANSCRIPT") or DEFAULT_FAKE_TRANSCRIPT
        return cls(transcript=transcript, delay_ms=_delay_ms_from_env())

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        if self._delay_ms:
            await asyncio.sleep(self._delay_ms / 1000)
        return self._transcript


class GroqTranscriber:
    """Groq Whisper adapter. Audio only travels over the request in memory."""

    name = "groq"

    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = client

    @classmethod
    def from_env(cls) -> "GroqTranscriber":
        api_key = os.getenv("GROQ_API_KEY", "").strip()
        if not api_key:
            raise MissingProviderKeyError(
                "GROQ_API_KEY is not configured. Set it or use "
                "KESTREL_ASR_PROVIDER=fake."
            )
        return cls(api_key=api_key)

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        headers = {"Authorization": f"Bearer {self._api_key}"}
        files = {
            "file": (_filename_for(content_type), audio, content_type),
        }
        data = {"model": GROQ_MODEL}

        try:
            if self._client is None:
                async with httpx.AsyncClient(timeout=GROQ_TIMEOUT_SECONDS) as client:
                    response = await client.post(
                        GROQ_ENDPOINT,
                        headers=headers,
                        data=data,
                        files=files,
                    )
            else:
                response = await self._client.post(
                    GROQ_ENDPOINT,
                    headers=headers,
                    data=data,
                    files=files,
                    timeout=GROQ_TIMEOUT_SECONDS,
                )
        except httpx.RequestError as exc:
            raise TranscriptionProviderError(
                f"Groq transcription request failed ({type(exc).__name__})."
            ) from exc

        if response.status_code >= 400:
            raise TranscriptionProviderError(
                f"Groq transcription failed with HTTP {response.status_code}."
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise TranscriptionProviderError(
                "Groq returned an invalid JSON response."
            ) from exc

        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str):
            raise TranscriptionProviderError("Groq returned no transcript text.")
        return text


def _delay_ms_from_env() -> int:
    raw_delay = os.getenv("KESTREL_FAKE_DELAY_MS")
    if not raw_delay:
        return 0
    try:
        return max(0, int(raw_delay))
    except ValueError:
        return 0


def _filename_for(content_type: str) -> str:
    media_type = content_type.split(";", 1)[0].strip().lower()
    extension = _CONTENT_TYPE_EXTENSIONS.get(media_type, "bin")
    return f"audio.{extension}"
