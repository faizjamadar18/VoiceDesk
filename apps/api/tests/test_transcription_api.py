import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.transcribers import GroqTranscriber

AUDIO = b"fake-audio-bytes"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


def test_health_with_fake_provider(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "provider": "fake",
        "configured": True,
    }


def test_health_with_groq_without_key_is_not_configured(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "provider": "groq",
        "configured": False,
    }


def test_provider_defaults_to_groq(client, monkeypatch):
    monkeypatch.delenv("KESTREL_ASR_PROVIDER", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["provider"] == "groq"


@pytest.mark.parametrize(
    "content_type",
    ["audio/webm; codecs=opus", "application/octet-stream"],
)
def test_transcribe_with_fake_provider(client, monkeypatch, content_type):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")
    monkeypatch.setenv("KESTREL_FAKE_TRANSCRIPT", "Hello from the fake transcriber.")

    response = client.post(
        "/transcribe",
        content=AUDIO,
        headers={"Content-Type": content_type},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Hello from the fake transcriber."
    assert body["provider"] == "fake"
    assert isinstance(body["latencyMs"], int)
    assert body["latencyMs"] >= 0


def test_fake_provider_uses_default_transcript(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")
    monkeypatch.delenv("KESTREL_FAKE_TRANSCRIPT", raising=False)

    response = client.post(
        "/transcribe",
        content=AUDIO,
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 200
    assert response.json()["text"] == "Fake transcription from Kestrel."


def test_empty_body_returns_400(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")

    response = client.post(
        "/transcribe",
        content=b"",
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]


def test_non_audio_content_type_returns_415(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")

    response = client.post(
        "/transcribe",
        content=AUDIO,
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 415
    assert "audio" in response.json()["detail"].lower()


def test_oversized_body_returns_413(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")

    response = client.post(
        "/transcribe",
        content=b"x" * (MAX_AUDIO_BYTES + 1),
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 413
    assert response.json()["detail"]


def test_provider_failure_returns_502(monkeypatch):
    class FailingTranscriber:
        async def transcribe(self, audio, content_type):
            raise RuntimeError(f"provider exploded handling {audio!r}")

    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "fake")
    app = create_app(transcriber_factory=lambda provider: FailingTranscriber())

    with TestClient(app) as test_client:
        response = test_client.post(
            "/transcribe",
            content=AUDIO,
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert detail
    assert AUDIO.decode() not in detail


def test_groq_without_key_returns_503(client, monkeypatch):
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    response = client.post(
        "/transcribe",
        content=AUDIO,
        headers={"Content-Type": "audio/wav"},
    )

    assert response.status_code == 503
    assert "GROQ_API_KEY" in response.json()["detail"]


def test_groq_adapter_sends_expected_request(monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["content_type"] = request.headers.get("content-type", "")
        captured["body"] = request.content
        return httpx.Response(200, json={"text": "Groq transcript."})

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(
        transcriber_factory=lambda provider: GroqTranscriber(
            api_key="test-key",
            client=async_client,
        )
    )
    monkeypatch.setenv("KESTREL_ASR_PROVIDER", "groq")

    with TestClient(app) as test_client:
        response = test_client.post(
            "/transcribe",
            content=AUDIO,
            headers={"Content-Type": "audio/webm"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Groq transcript."
    assert body["provider"] == "groq"
    assert isinstance(body["latencyMs"], int)

    assert captured["url"] == GROQ_URL
    assert captured["authorization"] == "Bearer test-key"
    assert captured["content_type"].startswith("multipart/form-data; boundary=")

    multipart_body = captured["body"]
    assert b'name="file"' in multipart_body
    assert b'filename="audio.webm"' in multipart_body
    assert b"audio/webm" in multipart_body
    assert AUDIO in multipart_body
    assert b'name="model"' in multipart_body
    assert b"whisper-large-v3-turbo" in multipart_body
