from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.vision import VisionProviderError, VisionQuotaError

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
MAX_IMAGE_BYTES = 12 * 1024 * 1024
QUESTION = "What does this error mean?"


def encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def request_body(
    *, image: str | None = None, question: str = QUESTION, marked: bool = True
) -> dict:
    return {
        "question": question,
        "image": encode(PNG_BYTES) if image is None else image,
        "marked": marked,
    }


class FakeVisionClient:
    model = "test/vision-model"

    def __init__(
        self,
        answer: str = "The file could not be found.",
        error: Exception | None = None,
    ) -> None:
        self.answer_text = answer
        self.error = error
        self.calls: list[dict] = []

    async def answer(
        self,
        *,
        question: str,
        image_base64: str,
        mime_type: str,
        marked: bool,
    ) -> str:
        self.calls.append(
            {
                "question": question,
                "image_base64": image_base64,
                "mime_type": mime_type,
                "marked": marked,
            }
        )
        if self.error is not None:
            raise self.error
        return self.answer_text


def test_screen_ask_returns_answer_model_and_latency():
    fake = FakeVisionClient()

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "The file could not be found."
    assert body["model"] == "test/vision-model"
    assert isinstance(body["latencyMs"], int)
    assert body["latencyMs"] >= 0
    assert fake.calls == [
        {
            "question": QUESTION,
            "image_base64": encode(PNG_BYTES),
            "mime_type": "image/png",
            "marked": True,
        }
    ]


@pytest.mark.parametrize(
    ("image_bytes", "expected_mime", "marked"),
    [
        (PNG_BYTES, "image/png", True),
        (JPEG_BYTES, "image/jpeg", False),
    ],
)
def test_screen_ask_detects_image_type_from_magic_bytes(
    image_bytes, expected_mime, marked
):
    fake = FakeVisionClient()

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post(
            "/screen/ask",
            json=request_body(image=encode(image_bytes), marked=marked),
        )

    assert response.status_code == 200
    assert fake.calls[0]["mime_type"] == expected_mime
    assert fake.calls[0]["marked"] is marked


def test_screen_ask_uses_configured_model_for_response(monkeypatch):
    class MinimalVisionClient:
        async def answer(self, **kwargs) -> str:
            return "An answer."

    monkeypatch.setenv("KESTREL_GROQ_VISION_MODEL", "vision/env-model")

    with TestClient(create_app(vision_client=MinimalVisionClient())) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 200
    assert response.json()["model"] == "vision/env-model"


@pytest.mark.parametrize(
    "body",
    [
        {**request_body(), "question": ""},
        {**request_body(), "question": "   "},
        {**request_body(), "question": "x" * 2001},
        {**request_body(), "image": ""},
        {key: value for key, value in request_body().items() if key != "image"},
        {**request_body(), "image": "not base64!"},
        {**request_body(), "image": f"data:image/png;base64,{encode(PNG_BYTES)}"},
        {**request_body(), "marked": "yes"},
    ],
)
def test_screen_ask_rejects_malformed_input_with_422(monkeypatch, body):
    fake = FakeVisionClient()

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=body)

    assert response.status_code == 422
    assert response.json()["detail"]
    assert fake.calls == []


def test_screen_ask_rejects_missing_marked_with_422():
    fake = FakeVisionClient()
    body = request_body()
    del body["marked"]

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=body)

    assert response.status_code == 422
    assert fake.calls == []


def test_screen_ask_rejects_oversized_image_with_413():
    fake = FakeVisionClient()
    oversized = PNG_BYTES + b"\x00" * (MAX_IMAGE_BYTES - len(PNG_BYTES) + 1)

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post(
            "/screen/ask", json=request_body(image=encode(oversized))
        )

    assert response.status_code == 413
    assert "12 MiB" in response.json()["detail"]
    assert fake.calls == []


@pytest.mark.parametrize(
    "image_bytes",
    [b"GIF89a" + b"\x00" * 32, b"%PDF-1.7" + b"\x00" * 32, b"\x00" * 16],
)
def test_screen_ask_rejects_unsupported_image_bytes_with_415(image_bytes):
    fake = FakeVisionClient()

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post(
            "/screen/ask", json=request_body(image=encode(image_bytes))
        )

    assert response.status_code == 415
    assert "PNG or JPEG" in response.json()["detail"]
    assert fake.calls == []


def test_screen_ask_without_key_returns_503(monkeypatch):
    monkeypatch.delenv("KESTREL_GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    with TestClient(create_app()) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "KESTREL_GROQ_API_KEY" in detail
    assert "GROQ_API_KEY" in detail


def test_screen_ask_maps_quota_failure_to_503():
    fake = FakeVisionClient(
        error=VisionQuotaError("Vision quota exhausted (HTTP 429).")
    )

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 503
    assert "quota" in response.json()["detail"].lower()


def test_screen_ask_maps_provider_failure_to_502():
    fake = FakeVisionClient(
        error=VisionProviderError("Vision provider failed with HTTP 500.")
    )

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 502
    assert response.json()["detail"] == "Vision provider failed with HTTP 500."


def test_screen_ask_maps_empty_answer_to_502():
    fake = FakeVisionClient(answer="   ")

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post("/screen/ask", json=request_body())

    assert response.status_code == 502
    assert "empty answer" in response.json()["detail"].lower()


def test_screen_ask_maps_unexpected_failure_to_502_without_leaking_input():
    question = "What is my password hunter2?"
    image = encode(PNG_BYTES)
    fake = FakeVisionClient(error=RuntimeError(f"{question} {image}"))

    with TestClient(create_app(vision_client=fake)) as client:
        response = client.post(
            "/screen/ask", json=request_body(image=image, question=question)
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "RuntimeError" in detail
    assert question not in detail
    assert image not in detail
