"""Tests for the MCP transport clients (stdio and Streamable HTTP)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.mcp.client import HttpMcpClient, StdioMcpClient, make_client
from app.mcp.types import McpConnectionError, McpServerConfig

FIXTURE_SERVER = Path(__file__).resolve().parent / "fixtures" / "fake_mcp_server.py"


def _stdio_config(**overrides: Any) -> McpServerConfig:
    values: dict[str, Any] = {
        "name": "fake",
        "transport": "stdio",
        "command": sys.executable,
        "args": (str(FIXTURE_SERVER),),
    }
    values.update(overrides)
    return McpServerConfig(**values)


@pytest.fixture
def stdio_client():
    """Factory for stdio clients that are always closed after the test."""
    clients: list[StdioMcpClient] = []

    def factory(*, timeout: float = 30.0, **config_overrides: Any) -> StdioMcpClient:
        client = StdioMcpClient(_stdio_config(**config_overrides), timeout=timeout)
        clients.append(client)
        return client

    yield factory

    for client in clients:
        client.close()


def _http_config(**overrides: Any) -> McpServerConfig:
    values: dict[str, Any] = {
        "name": "remote",
        "transport": "http",
        "url": "https://mcp.test/rpc",
    }
    values.update(overrides)
    return McpServerConfig(**values)


def _http_client(handler, **overrides: Any) -> tuple[HttpMcpClient, httpx.Client]:
    """Build an ``HttpMcpClient`` backed by an ``httpx.MockTransport``."""
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return HttpMcpClient(_http_config(**overrides), client=http), http


def _sse(*messages: dict[str, Any]) -> str:
    return "".join(
        f"event: message\ndata: {json.dumps(message)}\n\n" for message in messages
    )


# --- factory -----------------------------------------------------------------


def test_make_client_selects_transport():
    stdio = make_client(
        McpServerConfig(
            name="local", transport="stdio", command=sys.executable, args=("-c", "pass")
        )
    )
    try:
        assert isinstance(stdio, StdioMcpClient)
    finally:
        stdio.close()

    http = make_client(_http_config())
    try:
        assert isinstance(http, HttpMcpClient)
    finally:
        http.close()

    with pytest.raises(McpConnectionError):
        make_client(McpServerConfig(name="bad", transport="smtp"))


# --- stdio -------------------------------------------------------------------


def test_stdio_initialize_lists_paginated_tools(stdio_client):
    tools = stdio_client().list_tools()

    assert [tool.name for tool in tools] == ["search_docs", "delete_docs"]

    search, delete = tools
    assert search.description == "Search the documentation."
    assert search.input_schema == {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }
    assert search.read_only is True

    assert delete.description == "Delete documentation."
    assert delete.input_schema == {"type": "object", "properties": {}, "required": []}
    assert delete.read_only is False


def test_stdio_call_tool_flattens_text_blocks(stdio_client):
    result = stdio_client().call_tool("good", {"query": "anything"})

    assert result.text == "first line\nsecond line"
    assert result.is_error is False


def test_stdio_call_tool_maps_is_error(stdio_client):
    result = stdio_client().call_tool("boom", {})

    assert result.text == "kaboom"
    assert result.is_error is True


def test_stdio_jsonrpc_error_raises_connection_error(stdio_client):
    with pytest.raises(McpConnectionError) as exc_info:
        stdio_client().call_tool("missing", {})

    message = str(exc_info.value)
    assert "fake" in message
    assert "unknown tool" in message


def test_stdio_timeout_raises_connection_error(stdio_client):
    client = stdio_client(timeout=0.3)

    with pytest.raises(McpConnectionError, match="timed out"):
        client.call_tool("hang", {})


def test_stdio_process_exit_raises_connection_error():
    config = McpServerConfig(
        name="dead",
        transport="stdio",
        command=sys.executable,
        args=("-c", "import sys; sys.exit(0)"),
    )
    client = StdioMcpClient(config)
    try:
        with pytest.raises(McpConnectionError):
            client.list_tools()
    finally:
        client.close()


def test_stdio_ignores_stderr_noise(stdio_client):
    tools = stdio_client().list_tools()

    assert len(tools) == 2


def test_stdio_close_is_idempotent(stdio_client):
    client = stdio_client()
    assert len(client.list_tools()) == 2

    client.close()
    client.close()

    with pytest.raises(McpConnectionError):
        client.list_tools()


# --- http --------------------------------------------------------------------


def test_http_json_response_and_initialize_notification():
    seen: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        seen.append(payload)
        method = payload["method"]
        if method == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {"tools": {}},
                    },
                },
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {
                        "tools": [
                            {
                                "name": "ping",
                                "description": "Ping something.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"host": {"type": "string"}},
                                    "required": ["host"],
                                },
                            }
                        ]
                    },
                },
            )
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        tools = client.list_tools()
    finally:
        client.close()
        http.close()

    assert [tool.name for tool in tools] == ["ping"]
    assert tools[0].read_only is True
    assert [payload["method"] for payload in seen] == [
        "initialize",
        "notifications/initialized",
        "tools/list",
    ]


def test_http_sse_response_is_parsed():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload["method"]
        if method == "initialize":
            return httpx.Response(
                200,
                text=_sse(
                    {
                        "jsonrpc": "2.0",
                        "id": payload["id"],
                        "result": {"protocolVersion": "2025-06-18"},
                    }
                ),
                headers={"content-type": "text/event-stream"},
            )
        if method == "notifications/initialized":
            return httpx.Response(204)
        if method == "tools/list":
            body = (
                'data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n'
                'data: {"jsonrpc":"2.0","id":'
                + str(payload["id"])
                + ',"result":{"tools":[{"name":"pong","description":"Pong."}]}}\n\n'
            )
            return httpx.Response(
                200, text=body, headers={"content-type": "text/event-stream"}
            )
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        tools = client.list_tools()
    finally:
        client.close()
        http.close()

    assert [tool.name for tool in tools] == ["pong"]
    assert tools[0].description == "Pong."


def test_http_session_id_is_sent_on_later_requests():
    session_headers: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload["method"]
        session_headers[method] = request.headers.get("Mcp-Session-Id")
        if method == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"protocolVersion": "2025-06-18"},
                },
                headers={"Mcp-Session-Id": "sess-42"},
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"tools": []},
                },
            )
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        assert client.list_tools() == []
    finally:
        client.close()
        http.close()

    assert session_headers["initialize"] is None
    assert session_headers["notifications/initialized"] == "sess-42"
    assert session_headers["tools/list"] == "sess-42"


def test_http_error_status_raises_connection_error():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload["method"]
        if method == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"protocolVersion": "2025-06-18"},
                },
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return httpx.Response(500, text="upstream exploded")
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        with pytest.raises(McpConnectionError) as exc_info:
            client.list_tools()
    finally:
        client.close()
        http.close()

    message = str(exc_info.value)
    assert "remote" in message
    assert "500" in message


def test_http_jsonrpc_error_raises_connection_error():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload["method"]
        if method == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"protocolVersion": "2025-06-18"},
                },
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "error": {"code": -32601, "message": "no tools here"},
                },
            )
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        with pytest.raises(McpConnectionError) as exc_info:
            client.list_tools()
    finally:
        client.close()
        http.close()

    message = str(exc_info.value)
    assert "remote" in message
    assert "no tools here" in message


def test_http_notification_failure_does_not_break_handshake():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload["method"]
        if method == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"protocolVersion": "2025-06-18"},
                },
            )
        if method == "notifications/initialized":
            return httpx.Response(500, text="notification rejected")
        if method == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"tools": []},
                },
            )
        raise AssertionError(f"unexpected method {method}")

    client, http = _http_client(handler)
    try:
        assert client.list_tools() == []
    finally:
        client.close()
        http.close()


def test_http_close_is_idempotent():
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    client, http = _http_client(handler)
    try:
        client.close()
        client.close()

        with pytest.raises(McpConnectionError):
            client.list_tools()
    finally:
        http.close()