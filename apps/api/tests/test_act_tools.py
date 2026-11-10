from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

from app.actions import ActionExecutionError
from app.files import FileOps
from app.main import create_app
from app.planner import NoDirective, ToolDirective
from app.tools import ToolCall
from app.windows_search import WindowsSearchUnavailable

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


class StaticPlanner:
    """Planner stub that always returns the same directive."""

    def __init__(self, directive) -> None:
        self.directive = directive

    async def plan(self, transcript: str):
        return self.directive


class TrashingFileOps(FileOps):
    """FileOps whose Recycle Bin is recorded instead of touched."""

    def __init__(self, home: Path) -> None:
        desktop = home / "Desktop"
        desktop.mkdir(exist_ok=True)
        self.removed: list[Path] = []
        super().__init__(
            home=home,
            known_folders={"desktop": desktop},
            trash=self._record,
        )

    def _record(self, path: Path) -> None:
        self.removed.append(Path(path))
        if Path(path).is_dir():
            import shutil

            shutil.rmtree(path)
        else:
            Path(path).unlink()


class FakeWindowsSearch:
    """Injected Windows Search provider; records calls and returns fake rows."""

    def __init__(self, results=None, error=None) -> None:
        self.results = list(results or [])
        self.error = error
        self.queries: list[str] = []

    def search(self, query, limit=20):
        self.queries.append(query)
        if self.error is not None:
            raise self.error
        return list(self.results)


def test_act_runs_tool_chosen_by_planner():
    executor = RecordingExecutor()
    planner = StaticPlanner(ToolDirective(ToolCall("open_app", {"app": "calculator"})))
    app = create_app(planner=planner, action_executor=executor)

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "open the calculator"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "open_app"
    assert body["message"] == "Opening Calculator."
    assert executor.opened_apps == ["calculator"]


def test_act_search_files_returns_results_without_pending(tmp_path):
    (tmp_path / "note.txt").write_text("hello")
    (tmp_path / "other.md").write_text("x")
    executor = RecordingExecutor()
    planner = StaticPlanner(ToolDirective(ToolCall("search_files", {"query": "note"})))
    app = create_app(
        planner=planner,
        action_executor=executor,
        file_roots=[tmp_path],
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "find note"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "search_files"
    assert [item["name"] for item in body["results"]] == ["note.txt"]
    assert body["planId"] is None


def test_act_search_files_uses_injected_windows_search_provider():
    found = [
        {
            "name": "scan-001.pdf",
            "path": r"C:\Users\me\Documents\2025 Tax Returns\scan-001.pdf",
            "sizeBytes": 1234,
            "modified": "2026-11-07T09:41:12+00:00",
        }
    ]
    provider = FakeWindowsSearch(found)
    planner = StaticPlanner(
        ToolDirective(ToolCall("search_files", {"query": "tax returns"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        windows_search=provider,
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "find tax returns"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["action"] == "search_files"
    assert body["results"] == found
    assert provider.queries == ["tax returns"]


def test_act_search_files_reports_windows_search_unavailable_honestly():
    provider = FakeWindowsSearch(
        error=WindowsSearchUnavailable("Windows Search is unavailable.")
    )
    planner = StaticPlanner(
        ToolDirective(ToolCall("search_files", {"query": "budget"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        windows_search=provider,
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "find my budget"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert body["action"] == "search_files"
    assert body["results"] is None
    assert "windows search" in body["message"].lower()


def test_act_search_files_uses_direct_scan_when_file_roots_are_explicit(tmp_path):
    (tmp_path / "note.txt").write_text("hello")
    provider = FakeWindowsSearch(
        error=AssertionError("Windows Search must not run with explicit roots")
    )
    planner = StaticPlanner(ToolDirective(ToolCall("search_files", {"query": "note"})))
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        windows_search=provider,
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "find note"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert [item["name"] for item in body["results"]] == ["note.txt"]
    assert provider.queries == []


def test_unhandled_directive_returns_unhandled():
    planner = StaticPlanner(NoDirective("Nope."))
    app = create_app(planner=planner, action_executor=RecordingExecutor())

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "do a backflip"})

    body = response.json()
    assert body["status"] == "unhandled"
    assert body["action"] == "none"
    assert body["message"] == "Nope."


def test_create_folder_runs_directly_and_offers_undo(tmp_path):
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(
        ToolDirective(ToolCall("create_folder", {"name": "Kestrel Notes"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_ops=file_ops,
    )
    target = tmp_path / "Desktop" / "Kestrel Notes"

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "make a folder"})

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["action"] == "create_folder"
        assert body["canUndo"] is True
        assert body["target"] == str(target.resolve())
        assert body["planId"]
        assert target.is_dir()

        undo = client.post("/act/undo", json={"planId": body["planId"]})
        assert undo.status_code == 200
        assert undo.json()["action"] == "undo"
        assert not target.exists()
        assert file_ops.removed == [target.resolve()]


def test_create_file_runs_directly_and_offers_undo(tmp_path):
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(
        ToolDirective(ToolCall("create_file", {"name": "notes"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_ops=file_ops,
    )
    target = tmp_path / "Desktop" / "notes.txt"

    with TestClient(app) as client:
        body = client.post("/act", json={"transcript": "create a file"}).json()

        assert body["status"] == "ok"
        assert body["canUndo"] is True
        assert target.is_file()

        client.post("/act/undo", json={"planId": body["planId"]})

    assert not target.exists()


def test_delete_file_pends_then_confirms_to_the_recycle_bin(tmp_path):
    victim = tmp_path / "report.pdf"
    victim.write_text("x")
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(
        ToolDirective(ToolCall("delete_file", {"query": "report"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=file_ops,
    )

    with TestClient(app) as client:
        pending = client.post("/act", json={"transcript": "delete report"})

        assert pending.status_code == 200
        body = pending.json()
        assert body["status"] == "pending"
        assert body["action"] == "delete_file"
        assert body["requiresConfirmation"] is True
        assert body["risk"] == "write"
        assert body["target"] == str(victim.resolve())
        assert "approval needed" in body["message"].lower()
        plan_id = body["planId"]
        assert victim.exists()

        confirmed = client.post(
            "/act/confirm", json={"planId": plan_id, "approved": True}
        )
        assert confirmed.status_code == 200
        confirmed_body = confirmed.json()
        assert confirmed_body["status"] == "ok"
        assert "recycle bin" in confirmed_body["message"].lower()
        assert not confirmed_body.get("canUndo")

    assert not victim.exists()
    assert file_ops.removed == [victim.resolve()]


def test_cancelling_a_delete_keeps_the_file(tmp_path):
    victim = tmp_path / "report.pdf"
    victim.write_text("x")
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(
        ToolDirective(ToolCall("delete_file", {"query": "report"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=file_ops,
    )

    with TestClient(app) as client:
        plan_id = client.post(
            "/act", json={"transcript": "delete report"}
        ).json()["planId"]
        response = client.post(
            "/act/confirm", json={"planId": plan_id, "approved": False}
        )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert victim.exists()
    assert file_ops.removed == []


def test_delete_is_refused_when_the_name_is_ambiguous(tmp_path):
    (tmp_path / "report.pdf").write_text("x")
    (tmp_path / "report.docx").write_text("y")
    planner = StaticPlanner(
        ToolDirective(ToolCall("delete_file", {"query": "report"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=TrashingFileOps(tmp_path),
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "delete report"})

    body = response.json()
    assert body["status"] == "unhandled"
    assert body["planId"] is None
    assert len(body["results"]) == 2
    assert "which one" in body["message"].lower()
    assert (tmp_path / "report.pdf").exists()


def test_delete_reports_when_nothing_matches(tmp_path):
    planner = StaticPlanner(
        ToolDirective(ToolCall("delete_file", {"query": "unicorn"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=TrashingFileOps(tmp_path),
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "delete unicorn"})

    body = response.json()
    assert body["status"] == "unhandled"
    assert "couldn't find" in body["message"].lower()


def test_act_open_app_accepts_any_app_name():
    executor = RecordingExecutor()
    planner = StaticPlanner(
        ToolDirective(ToolCall("open_app", {"app": "Notion"}))
    )
    app = create_app(planner=planner, action_executor=executor)

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "open notion"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["message"] == "Opening Notion."
    assert executor.opened_apps == ["Notion"]


def test_act_open_app_reports_not_installed_without_a_502():
    executor = MissingAppExecutor()
    planner = StaticPlanner(
        ToolDirective(ToolCall("open_app", {"app": "Notion"}))
    )
    app = create_app(planner=planner, action_executor=executor)

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "open notion"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert body["message"] == "Notion is not installed on this PC."
    assert body["spokenResponse"] == body["message"]


def test_act_unhandled_when_tool_argument_has_the_wrong_type():
    executor = RecordingExecutor()
    planner = StaticPlanner(
        ToolDirective(ToolCall("open_app", {"app": 42}))
    )
    app = create_app(planner=planner, action_executor=executor)

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "open something"})

    assert response.status_code == 200
    assert response.json()["status"] == "unhandled"
    assert executor.opened_apps == []


def test_act_unhandled_when_required_argument_missing(tmp_path):
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(ToolDirective(ToolCall("create_folder", {})))
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=file_ops,
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "make a folder"})

    body = response.json()
    assert body["status"] == "unhandled"
    assert body["planId"] is None
    assert file_ops.removed == []


def test_confirm_unknown_plan_id_returns_404():
    app = create_app(
        planner=StaticPlanner(NoDirective("x")),
        action_executor=RecordingExecutor(),
    )

    with TestClient(app) as client:
        response = client.post(
            "/act/confirm", json={"planId": "deadbeef", "approved": True}
        )

    assert response.status_code == 404


def test_undo_unknown_plan_id_returns_404():
    app = create_app(
        planner=StaticPlanner(NoDirective("x")),
        action_executor=RecordingExecutor(),
    )

    with TestClient(app) as client:
        response = client.post("/act/undo", json={"planId": "deadbeef"})

    assert response.status_code == 404


def test_dry_run_write_tool_pends_nothing_and_touches_nothing(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("KESTREL_ACTION_DRY_RUN", "1")
    file_ops = TrashingFileOps(tmp_path)
    planner = StaticPlanner(
        ToolDirective(ToolCall("create_folder", {"name": "DryRun"}))
    )
    app = create_app(
        planner=planner,
        action_executor=RecordingExecutor(),
        file_roots=[tmp_path],
        file_ops=file_ops,
    )

    with TestClient(app) as client:
        response = client.post("/act", json={"transcript": "make a folder"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["planId"] is None
    assert body["dryRun"] is True
    assert not (tmp_path / "Desktop" / "DryRun").exists()
    assert file_ops.removed == []


def test_planner_endpoint_reports_rules_without_groq_key(monkeypatch):
    monkeypatch.delenv("KESTREL_GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    app = create_app(action_executor=RecordingExecutor())

    with TestClient(app) as client:
        response = client.get("/planner")

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "rule"
    assert body["configured"] is True
    assert body["model"]


def test_planner_endpoint_reports_groq_when_key_present(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("KESTREL_GROQ_MODEL", "openai/gpt-oss-20b")
    app = create_app(action_executor=RecordingExecutor())

    with TestClient(app) as client:
        response = client.get("/planner")

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "groq"
    assert body["configured"] is True
    assert body["model"] == "openai/gpt-oss-20b"
