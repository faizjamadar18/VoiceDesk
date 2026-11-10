from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.planner import RulePlanner, ScreenDirective

FIXED_NOW = datetime(2026, 11, 8, 12, 0, 0)


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.delenv("KESTREL_GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    app = create_app(
        action_clock=lambda: FIXED_NOW,
        planner=RulePlanner(clock=lambda: FIXED_NOW),
    )
    with TestClient(app) as test_client:
        yield test_client


def test_act_weather_returns_card_and_final_speech(client):
    response = client.post(
        "/act", json={"transcript": "What's the weather in India today?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "weather"
    assert body["card"]["kind"] == "weather"
    assert body["card"]["location"] == "India"
    assert "°C" in body["card"]["temperature"]
    assert body["card"]["condition"] != ""
    assert body["spokenResponse"]


def test_act_answer_includes_final_speech(client):
    response = client.post("/act", json={"transcript": "what time is it"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "answer"
    assert body["spokenResponse"] == body["message"]


def test_act_unhandled_includes_final_speech(client):
    response = client.post("/act", json={"transcript": "sing an opera song"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unhandled"
    assert body["spokenResponse"] == body["message"]


def test_act_look_at_screen_returns_empty_message_without_speech():
    class ScreenPlanner:
        async def plan(self, transcript: str):
            return ScreenDirective(transcript)

    with TestClient(create_app(planner=ScreenPlanner())) as client:
        response = client.post(
            "/act", json={"transcript": "what is this error?"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "look_at_screen"
    assert body["message"] == ""
    assert body["spokenResponse"] is None
