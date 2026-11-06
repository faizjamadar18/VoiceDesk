"""Minimal Kestrel API: health plus in-memory speech-to-text."""

from __future__ import annotations

import os
import time
from collections.abc import Callable

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from app.transcribers import (
    FakeTranscriber,
    GroqTranscriber,
    MissingProviderKeyError,
    Transcriber,
    TranscriptionProviderError,
)

MAX_AUDIO_BYTES = 10 * 1024 * 1024
SUPPORTED_PROVIDERS = frozenset({"fake", "groq"})
DEFAULT_PROVIDER = "groq"

TranscriberFactory = Callable[[str], Transcriber]


class HealthResponse(BaseModel):
    status: str
    provider: str
    configured: bool


class TranscriptionResponse(BaseModel):
    text: str
    provider: str
    latencyMs: int


def create_app(transcriber_factory: TranscriberFactory | None = None) -> FastAPI:
    """Build the API. Tests may inject a provider via ``transcriber_factory``."""
    factory = transcriber_factory or _default_transcriber
    application = FastAPI(title="Kestrel API", version="0.1.0")

    @application.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        provider = _provider_name()
        return HealthResponse(
            status="ok",
            provider=provider,
            configured=_provider_configured(provider),
        )

    @application.post("/transcribe", response_model=TranscriptionResponse)
    async def transcribe(request: Request) -> TranscriptionResponse:
        content_type = request.headers.get("content-type", "")
        if not _is_supported_content_type(content_type):
            raise HTTPException(
                status_code=415,
                detail=(
                    "Unsupported Content-Type. Send raw audio with an audio/* "
                    "or application/octet-stream Content-Type."
                ),
            )

        audio = await _read_audio(request)
        provider = _provider_name()

        try:
            transcriber = factory(provider)
        except MissingProviderKeyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        started = time.perf_counter()
        try:
            text = await transcriber.transcribe(audio, content_type)
        except MissingProviderKeyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=_provider_failure_detail(exc),
            ) from exc

        latency_ms = max(0, int((time.perf_counter() - started) * 1000))
        return TranscriptionResponse(
            text=text,
            provider=provider,
            latencyMs=latency_ms,
        )

    return application


def _provider_name() -> str:
    provider = os.getenv("KESTREL_ASR_PROVIDER", DEFAULT_PROVIDER).strip().lower()
    return provider if provider in SUPPORTED_PROVIDERS else DEFAULT_PROVIDER


def _provider_configured(provider: str) -> bool:
    if provider == "fake":
        return True
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def _default_transcriber(provider: str) -> Transcriber:
    if provider == "fake":
        return FakeTranscriber.from_env()
    return GroqTranscriber.from_env()


def _is_supported_content_type(value: str) -> bool:
    media_type = value.split(";", 1)[0].strip().lower()
    return media_type.startswith("audio/") or media_type == "application/octet-stream"


async def _read_audio(request: Request) -> bytes:
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MAX_AUDIO_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Audio body must be at most 10 MiB.",
                )
        except ValueError:
            pass

    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio body must be at most 10 MiB.",
            )

    if not audio:
        raise HTTPException(status_code=400, detail="Audio body is empty.")
    return bytes(audio)


def _provider_failure_detail(exc: Exception) -> str:
    if isinstance(exc, TranscriptionProviderError):
        return str(exc)
    return f"Transcription provider failed ({type(exc).__name__})."


app = create_app()
