"""Tests for MCP wiring into the FastAPI app."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.mcp.types import McpServerStatus
from app.tools import ToolOutcome, ToolRegistry, ToolSpec


class FakeTool:
    """Minimal tool that records execution, shaped like ``Tool``."""

    def __init__(self, name: str) -> None:
        self.spec = ToolSpec(
            name=name,
            description=f"Fake tool {name}.",
            parameters={"type": "object", "properties": {}, "required": []},
            risk="read",
            requires_confirmation=False,
            action_label="Fake",
        )
        self.runs: list[dict] = []

    def run(self, arguments: dict, ctx) -> ToolOutcome:  # noqa: ANN001
        self.runs.append(dict(arguments))
        return ToolOutcome(status="ok", action="Fake", message="done")


class FakeManager:
    """Stand-in for :class:`McpManager` with observable lifecycle calls."""

    def __init__(
        self,
        tools: list[FakeTool] | None = None,
        statuses: list[McpServerStatus] | None = None,
    ) -> None:
        self._tools = list(tools or [])
        self._statuses = list(statuses or [])
        self.connect_calls = 0
        self.close_calls = 0

    @property
    def tools(self) -> list[FakeTool]:
        return list(self._tools)

    @property
    def statuses(self) -> list[McpServerStatus]:
        return list(self._statuses)

    def connect(self) -> list[McpServerStatus]:
        self.connect_calls += 1
        return list(self._statuses)

    def close(self) -> None:
        self.close_calls += 1


def test_status_reports_disabled_when_not_enabled(monkeypatch):
    monkeypatch.setenv("KESTREL_MCP_ENABLED", "0")
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/mcp/status")

    assert response.status_code == 200
    assert response.json() == {"enabled": False, "servers": []}


def test_injected_manager_registers_tools_and_reports_status(monkeypatch):
    monkeypatch.setenv("KESTREL_MCP_ENABLED", "0")
    tool = FakeTool("notion_api_post_search")
    manager = FakeManager(
        tools=[tool],
        statuses=[
            McpServerStatus(name="notion", ok=True, tool_count=1),
        ],
    )
    registry = ToolRegistry()
    app = create_app(registry=registry, mcp_manager=manager)

    assert manager.connect_calls == 1
    assert registry.get("notion_api_post_search") is tool

    with TestClient(app) as client:
        body = client.get("/mcp/status").json()

    assert body == {
        "enabled": True,
        "servers": [
            {
                "name": "notion",
                "ok": True,
                "toolCount": 1,
                "error": None,
            }
        ],
    }


def test_failed_server_status_is_surfaced(monkeypatch):
    monkeypatch.setenv("KESTREL_MCP_ENABLED", "0")
    manager = FakeManager(
        statuses=[
            McpServerStatus(
                name="notion",
                ok=False,
                tool_count=0,
                error="NOTION_TOKEN is not set",
            )
        ],
    )
    app = create_app(mcp_manager=manager)
    with TestClient(app) as client:
        body = client.get("/mcp/status").json()

    assert body["enabled"] is True
    assert body["servers"][0]["ok"] is False
    assert body["servers"][0]["error"] == "NOTION_TOKEN is not set"


def test_enabled_env_with_empty_config_starts_no_servers(
    monkeypatch, tmp_path: Path
):
    config = tmp_path / "mcp_servers.json"
    config.write_text('{"servers": {}}', encoding="utf-8")
    monkeypatch.setenv("KESTREL_MCP_ENABLED", "1")
    monkeypatch.setenv("KESTREL_MCP_CONFIG", str(config))

    app = create_app()
    with TestClient(app) as client:
        body = client.get("/mcp/status").json()

    assert body == {"enabled": True, "servers": []}


def test_shutdown_closes_the_manager(monkeypatch):
    monkeypatch.setenv("KESTREL_MCP_ENABLED", "0")
    manager = FakeManager()
    app = create_app(mcp_manager=manager)

    with TestClient(app):
        assert manager.close_calls == 0

    assert manager.close_calls == 1