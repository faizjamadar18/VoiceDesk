from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.actions import ActionExecutionError, ActionPlan, plan_action
from app.main import create_app

FIXED_NOW = datetime(2026, 11, 7, 9, 41, 12)


class RecordingExecutor:
    def __init__(self, fail: bool = False) -> None:
        self.opened_apps: list[str] = []
        self.opened_urls: list[str] = []
        self.fail = fail

    def open_app(self, app: str) -> None:
        if self.fail:
            raise RuntimeError("app launch failed")
        self.opened_apps.append(app)

    def open_url(self, url: str) -> None:
        if self.fail:
            raise RuntimeError("browser launch failed")
        self.opened_urls.append(url)


class MissingAppExecutor(RecordingExecutor):
    def open_app(self, app: str) -> None:
        raise ActionExecutionError(f"{app.title()} is not installed on this PC.")


@pytest.fixture
def executor() -> RecordingExecutor:
    return RecordingExecutor()


@pytest.fixture
def client(executor, monkeypatch) -> TestClient:
    monkeypatch.delenv("KESTREL_GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with TestClient(
        create_app(action_executor=executor, action_clock=lambda: FIXED_NOW)
    ) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("transcript", "app"),
    [
        ("open notepad", "notepad"),
        ("Open Note Pad.", "notepad"),
        ("launch the calculator", "calculator"),
        ("start chrome", "chrome"),
        ("open google chrome", "chrome"),
        ("open file explorer", "explorer"),
        ("open Microsoft Word", "word"),
        ("open settings", "settings"),
        ("open notion", "notion"),
        ("launch spotify", "spotify"),
        ("open terminal", "terminal"),
    ],
)
def test_plan_action_opens_any_app(transcript, app):
    plan = plan_action(transcript, now=FIXED_NOW)

    assert plan.status == "ok"
    assert plan.action == "open_app"
    assert plan.target == app


@pytest.mark.parametrize(
    ("transcript", "query"),
    [
        ("search the web for zero cost speech recognition", "zero cost speech recognition"),
        ("search for kestrel voice agent", "kestrel voice agent"),
        ("google best local whisper model", "best local whisper model"),
        ("look up rust ownership", "rust ownership"),
    ],
)
def test_plan_action_searches_the_web(transcript, query):
    plan = plan_action(transcript, now=FIXED_NOW)

    assert plan.status == "ok"
    assert plan.action == "browser"
    assert plan.url == f"https://www.google.com/search?q={query.replace(' ', '+')}"


def test_plan_action_types_text_and_preserves_case():
    plan = plan_action("type Hello from Kestrel", now=FIXED_NOW)

    assert plan.status == "ok"
    assert plan.action == "type"
    assert plan.text == "Hello from Kestrel"


def test_plan_action_answers_time_and_date():
    time_plan = plan_action("what time is it?", now=FIXED_NOW)
    date_plan = plan_action("what's the date today", now=FIXED_NOW)

    assert time_plan.status == "ok"
    assert time_plan.action == "answer"
    assert "9:41" in time_plan.message
    assert date_plan.status == "ok"
    assert date_plan.action == "answer"
    assert "2026-11-07" in date_plan.message


def test_plan_action_returns_unhandled_for_unknown_speech():
    plan = plan_action("make me a sandwich", now=FIXED_NOW)

    assert plan.status == "unhandled"
    assert plan.action == "none"
    assert plan.message


def test_plan_action_strips_the_app_filler_words():
    plan = plan_action("open the app called Notion", now=FIXED_NOW)

    assert plan.status == "ok"
    assert plan.action == "open_app"
    assert plan.target == "notion"


def test_act_executes_open_app(client, executor):
    response = client.post("/act", json={"transcript": "open notepad"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "open_app"
    assert body["message"] == "Opening Notepad."
    assert body["dryRun"] is False
    assert executor.opened_apps == ["notepad"]


def test_act_executes_an_app_outside_the_builtin_list(client, executor):
    response = client.post("/act", json={"transcript": "open notion"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "open_app"
    assert body["message"] == "Opening Notion."
    assert executor.opened_apps == ["notion"]


def test_act_explains_when_an_app_is_not_installed():
    with TestClient(
        create_app(
            action_executor=MissingAppExecutor(),
            action_clock=lambda: FIXED_NOW,
        )
    ) as test_client:
        response = test_client.post("/act", json={"transcript": "open notion"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert body["action"] == "open_app"
    assert body["message"] == "Notion is not installed on this PC."
    assert body["spokenResponse"] == body["message"]


def test_act_executes_browser_search(client, executor):
    response = client.post("/act", json={"transcript": "search the web for kestrel"})

    assert response.status_code == 200
    assert response.json()["action"] == "browser"
    assert executor.opened_urls == ["https://www.google.com/search?q=kestrel"]


def test_act_returns_text_for_typing_without_executing(client, executor):
    response = client.post("/act", json={"transcript": "type hello world"})

    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "type"
    assert body["text"] == "hello world"
    assert executor.opened_apps == []
    assert executor.opened_urls == []


def test_act_dry_run_does_not_execute(monkeypatch):
    executor = RecordingExecutor()
    monkeypatch.setenv("KESTREL_ACTION_DRY_RUN", "1")
    with TestClient(
        create_app(action_executor=executor, action_clock=lambda: FIXED_NOW)
    ) as test_client:
        response = test_client.post("/act", json={"transcript": "open notepad"})

    assert response.status_code == 200
    assert response.json()["dryRun"] is True
    assert executor.opened_apps == []


def test_act_reports_unhandled_without_executing(client, executor):
    response = client.post("/act", json={"transcript": "sing a song"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unhandled"
    assert body["action"] == "none"
    assert executor.opened_apps == []
    assert executor.opened_urls == []


def test_act_returns_502_when_execution_fails(executor):
    executor.fail = True
    with TestClient(create_app(action_executor=executor)) as test_client:
        response = test_client.post("/act", json={"transcript": "open notepad"})

    assert response.status_code == 502
    assert "open" in response.json()["detail"].lower()


def test_act_rejects_empty_transcript(client):
    response = client.post("/act", json={"transcript": "   "})

    assert response.status_code == 422


def test_action_plan_is_immutable():
    plan = ActionPlan(status="ok", action="none", message="hello")

    with pytest.raises(Exception):
        plan.status = "unhandled"  # type: ignore[misc]


def test_plan_action_strips_non_speech_tags():
    plan = plan_action("(clicking) open notepad")
    assert plan.status == "ok"
    assert plan.target == "notepad"

    empty_plan = plan_action("(clap)")
    assert empty_plan.status == "unhandled"
    assert empty_plan.message == "I didn't hear a command."
