from __future__ import annotations

import json
from typing import Any

import pytest

from app.mcp.registry import (
    McpManager,
    McpToolAdapter,
    _sanitize,
    format_tool_result,
    humanize,
)
from app.mcp.types import (
    McpCallResult,
    McpServerConfig,
    McpServerStatus,
    McpTool,
)
from app.tools import ToolContext


class FakeClient:
    """A scripted ``McpClient`` that records calls and never touches a network."""

    def __init__(
        self,
        name: str,
        *,
        tools: list[McpTool] | None = None,
        result: McpCallResult | None = None,
        error: Exception | None = None,
        list_error: Exception | None = None,
    ) -> None:
        self.name = name
        self._tools = tools or []
        self._result = result if result is not None else McpCallResult("")
        self._error = error
        self._list_error = list_error
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.close_count = 0

    def list_tools(self) -> list[McpTool]:
        if self._list_error is not None:
            raise self._list_error
        return list(self._tools)

    def call_tool(self, name: str, arguments: dict[str, Any]) -> McpCallResult:
        self.calls.append((name, arguments))
        if self._error is not None:
            raise self._error
        return self._result

    def close(self) -> None:
        self.close_count += 1


def make_server(**overrides: Any) -> McpServerConfig:
    options: dict[str, Any] = {
        "name": "Google Drive",
        "transport": "stdio",
        "command": "run-server",
    }
    options.update(overrides)
    return McpServerConfig(**options)


def make_tool(**overrides: Any) -> McpTool:
    options: dict[str, Any] = {
        "name": "read_file",
        "description": "Read a file.",
        "input_schema": {"type": "object"},
    }
    options.update(overrides)
    return McpTool(**options)


def make_ctx(dry_run: bool) -> ToolContext:
    return ToolContext(
        executor=None,  # type: ignore[arg-type]
        clock=None,  # type: ignore[arg-type]
        file_roots=(),
        dry_run=dry_run,
        file_ops=None,  # type: ignore[arg-type]
        file_search=None,  # type: ignore[arg-type]
    )


def make_adapter(
    server: McpServerConfig, tool: McpTool, client: FakeClient
) -> McpToolAdapter:
    return McpToolAdapter(server, tool, client)


def test_humanize_known_names() -> None:
    assert humanize("google_drive") == "Google Drive"


def test_sanitize_collapses_and_strips() -> None:
    assert _sanitize("Google-Drive!") == "google_drive"
    assert _sanitize("  a  b  ") == "a_b"
    assert _sanitize("--Leading--") == "leading"


def test_tool_name_is_server_and_tool_sanitized() -> None:
    adapter = make_adapter(
        make_server(name="Google Drive"),
        make_tool(name="Read File!"),
        FakeClient("c"),
    )

    assert adapter.spec.name == "google_drive_read_file"


def test_spec_uses_tool_description_and_server_action_label() -> None:
    adapter = make_adapter(
        make_server(name="google_drive"),
        make_tool(description="List issues."),
        FakeClient("c"),
    )

    assert adapter.spec.description == "List issues."
    assert adapter.spec.action_label == "Google Drive"


def test_description_falls_back_to_tool_name() -> None:
    adapter = make_adapter(
        make_server(), make_tool(name="ping", description=""), FakeClient("c")
    )

    assert adapter.spec.description == "ping"


def test_risk_is_read_when_tool_is_read_only() -> None:
    adapter = make_adapter(
        make_server(), make_tool(read_only=True), FakeClient("c")
    )

    assert adapter.spec.risk == "read"
    assert adapter.spec.requires_confirmation is False


def test_risk_is_read_when_server_is_read_only() -> None:
    adapter = make_adapter(
        make_server(read_only=True),
        make_tool(read_only=False),
        FakeClient("c"),
    )

    assert adapter.spec.risk == "read"
    assert adapter.spec.requires_confirmation is False


def test_write_tool_requires_confirmation() -> None:
    adapter = make_adapter(
        make_server(), make_tool(read_only=False), FakeClient("c")
    )

    assert adapter.spec.risk == "write"
    assert adapter.spec.requires_confirmation is True


def test_auto_approve_drops_confirmation_for_write_tool() -> None:
    adapter = make_adapter(
        make_server(auto_approve=True),
        make_tool(read_only=False),
        FakeClient("c"),
    )

    assert adapter.spec.risk == "write"
    assert adapter.spec.requires_confirmation is False


def test_write_tools_override_marks_unannotated_tool_as_write() -> None:
    adapter = make_adapter(
        make_server(write_tools=frozenset({"API-post-page"})),
        make_tool(name="API-post-page", read_only=True),
        FakeClient("c"),
    )

    assert adapter.spec.risk == "write"
    assert adapter.spec.requires_confirmation is True


def test_write_tools_override_leaves_other_tools_read() -> None:
    adapter = make_adapter(
        make_server(write_tools=frozenset({"API-post-page"})),
        make_tool(name="API-post-search", read_only=True),
        FakeClient("c"),
    )

    assert adapter.spec.risk == "read"


def test_read_only_server_overrides_write_tools() -> None:
    adapter = make_adapter(
        make_server(read_only=True, write_tools=frozenset({"anything"})),
        make_tool(name="anything", read_only=True),
        FakeClient("c"),
    )

    assert adapter.spec.risk == "read"
    assert adapter.spec.requires_confirmation is False


def test_empty_schema_is_normalized_to_an_object() -> None:
    adapter = make_adapter(make_server(), make_tool(input_schema={}), FakeClient("c"))

    assert adapter.spec.parameters == {
        "type": "object",
        "properties": {},
        "required": [],
    }


def test_schema_is_normalized_and_input_is_not_mutated() -> None:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }
    adapter = make_adapter(make_server(), make_tool(input_schema=schema), FakeClient("c"))

    assert adapter.spec.parameters["properties"] == {"query": {"type": "string"}}
    assert adapter.spec.parameters["required"] == ["query"]
    assert adapter.spec.parameters is not schema
    assert adapter.spec.parameters["properties"] is not schema["properties"]
    assert schema == {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }


def test_adapter_parameters_have_no_refs_or_defs() -> None:
    schema: dict[str, Any] = {
        "$defs": {
            "block": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            }
        },
        "type": "object",
        "properties": {
            "children": {"type": "array", "items": {"$ref": "#/$defs/block"}}
        },
    }
    adapter = make_adapter(make_server(), make_tool(input_schema=schema), FakeClient("c"))

    serialized = json.dumps(adapter.spec.parameters)

    assert "$ref" not in serialized
    assert "$defs" not in serialized
    assert adapter.spec.parameters["type"] == "object"


def test_dry_run_does_not_call_the_client() -> None:
    client = FakeClient("c", result=McpCallResult("done"))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({}, make_ctx(dry_run=True))

    assert outcome.status == "ok"
    assert outcome.message == "Would run read_file."
    assert client.calls == []


def test_run_success_truncates_message_and_speaks() -> None:
    long_text = "word " * 2000
    client = FakeClient("c", result=McpCallResult(long_text))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({"a": 1}, make_ctx(dry_run=False))

    assert outcome.status == "ok"
    assert outcome.action == "Google Drive"
    assert outcome.message.endswith("...")
    assert len(outcome.message) <= 4003
    assert outcome.spoken_response is not None
    assert outcome.spoken_response.endswith("...")
    assert len(outcome.spoken_response) <= 403
    assert client.calls == [("read_file", {"a": 1})]


def test_run_collapses_whitespace_in_a_short_message() -> None:
    client = FakeClient("c", result=McpCallResult("  hello\n\nworld  "))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({}, make_ctx(dry_run=False))

    assert outcome.message == "hello world"
    assert outcome.spoken_response == "hello world"


def _empty_notion_search() -> str:
    return json.dumps(
        {
            "object": "list",
            "results": [],
            "next_cursor": None,
            "has_more": False,
            "request_id": "x",
        }
    )


def test_format_tool_result_summarizes_empty_notion_search() -> None:
    assert format_tool_result(_empty_notion_search()) == "No results found."


def test_format_tool_result_counts_list_results() -> None:
    text = json.dumps({"results": [{"id": "1"}, {"id": "2"}]})

    assert format_tool_result(text) == "Found 2 result(s)."


def test_format_tool_result_leaves_prose_unchanged() -> None:
    assert format_tool_result("hello world") == "hello world"


def test_format_tool_result_uses_title_for_object() -> None:
    assert format_tool_result(json.dumps({"title": "Roadmap"})) == "Roadmap"


def test_run_speaks_summary_instead_of_raw_json() -> None:
    client = FakeClient("c", result=McpCallResult(_empty_notion_search()))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({}, make_ctx(dry_run=False))

    assert outcome.status == "ok"
    assert outcome.message == "No results found."
    assert outcome.spoken_response == "No results found."


def test_run_maps_is_error_result() -> None:
    client = FakeClient("c", result=McpCallResult("boom", is_error=True))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({}, make_ctx(dry_run=False))

    assert outcome.status == "error"
    assert outcome.message == "boom"


def test_run_maps_raised_exception_to_error() -> None:
    client = FakeClient("c", error=RuntimeError("kaboom"))
    adapter = make_adapter(make_server(), make_tool(), client)

    outcome = adapter.run({}, make_ctx(dry_run=False))

    assert outcome.status == "error"
    assert "kaboom" in outcome.message


def test_manager_connect_records_statuses_and_exposes_good_tools() -> None:
    good_tool = McpTool("ping", "Ping.", {"type": "object"}, read_only=True)
    good = make_server(name="good", command="a")
    bad = make_server(name="bad", command="b")

    def factory(config: McpServerConfig) -> FakeClient:
        if config.name == "bad":
            return FakeClient(config.name, list_error=RuntimeError("nope"))
        return FakeClient(config.name, tools=[good_tool])

    manager = McpManager([good, bad], client_factory=factory)

    statuses = manager.connect()

    assert [status.name for status in statuses] == ["good", "bad"]
    assert statuses[0].ok is True
    assert statuses[0].tool_count == 1
    assert statuses[1].ok is False
    assert statuses[1].error == "nope"
    assert [tool.spec.name for tool in manager.tools] == ["good_ping"]
    assert manager.statuses == statuses


def test_manager_tools_allowlist_filters_and_counts() -> None:
    available = [
        McpTool("API-post-search", "Search.", {"type": "object"}, read_only=True),
        McpTool("API-delete-a-block", "Delete.", {"type": "object"}, read_only=True),
    ]
    server = make_server(name="notion", command="x", tools=("API-post-search",))

    def factory(config: McpServerConfig) -> FakeClient:
        return FakeClient(config.name, tools=available)

    manager = McpManager([server], client_factory=factory)

    statuses = manager.connect()

    assert [tool.spec.name for tool in manager.tools] == [
        "notion_api_post_search"
    ]
    assert statuses[0].tool_count == 1


def test_manager_connect_never_raises_on_factory_failure() -> None:
    def factory(config: McpServerConfig) -> FakeClient:
        raise RuntimeError("cannot start")

    manager = McpManager([make_server(name="s")], client_factory=factory)

    statuses = manager.connect()

    assert statuses == [
        McpServerStatus(name="s", ok=False, tool_count=0, error="cannot start")
    ]
    assert manager.tools == []


def test_manager_close_closes_every_client_and_is_idempotent() -> None:
    created: list[FakeClient] = []

    def factory(config: McpServerConfig) -> FakeClient:
        if config.name == "bad":
            client: FakeClient = FakeClient(config.name, list_error=RuntimeError("x"))
        else:
            client = FakeClient(config.name)
        created.append(client)
        return client

    manager = McpManager(
        [make_server(name="good"), make_server(name="bad")],
        client_factory=factory,
    )
    manager.connect()

    manager.close()
    manager.close()

    assert len(created) == 2
    assert all(client.close_count == 1 for client in created)
