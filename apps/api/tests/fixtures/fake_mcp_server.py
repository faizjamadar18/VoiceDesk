"""A tiny fake MCP server used by the transport tests.

It speaks newline-delimited JSON-RPC over stdin/stdout and implements just
enough of the protocol for ``test_mcp_client.py``: ``initialize``,
``notifications/initialized``, a paginated ``tools/list``, and ``tools/call``
with good, erroring, and hanging paths. It also writes chatter to stderr so
the client's stderr draining can be exercised without corrupting stdout.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

PROTOCOL_VERSION = "2025-06-18"

_SEARCH_TOOL = {
    "name": "search_docs",
    "description": "Search the documentation.",
    "inputSchema": {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    },
    "annotations": {"readOnlyHint": True},
}

_DELETE_TOOL = {
    "name": "delete_docs",
    "description": "Delete documentation.",
    "annotations": {"readOnlyHint": False},
}


def _write(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _respond(request_id: Any, result: dict[str, Any]) -> None:
    _write({"jsonrpc": "2.0", "id": request_id, "result": result})


def _error(request_id: Any, code: int, message: str) -> None:
    if request_id is None:
        return
    _write(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }
    )


def _handle(message: dict[str, Any], initialized: bool) -> bool:
    """Handle one message; return the new ``initialized`` flag."""
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}
    sys.stderr.write(f"fake server received {method}\n")
    sys.stderr.flush()

    if method == "initialize":
        if params.get("protocolVersion") != PROTOCOL_VERSION:
            _error(request_id, -32602, "unsupported protocol version")
            return initialized
        if (params.get("clientInfo") or {}).get("name") != "kestrel":
            _error(request_id, -32602, "unexpected client name")
            return initialized
        _respond(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "fake", "version": "1.0.0"},
            },
        )
        return initialized

    if method == "notifications/initialized":
        return True

    if method == "tools/list":
        if not initialized:
            _error(request_id, -32002, "not initialized")
            return initialized
        if params.get("cursor") == "page-2":
            _respond(request_id, {"tools": [_DELETE_TOOL]})
        else:
            _respond(request_id, {"tools": [_SEARCH_TOOL], "nextCursor": "page-2"})
        return initialized

    if method == "tools/call":
        name = params.get("name")
        if name == "good":
            _respond(
                request_id,
                {
                    "content": [
                        {"type": "text", "text": "first line"},
                        {"type": "image", "data": "ignored", "mimeType": "image/png"},
                        {"type": "text", "text": "second line"},
                    ],
                    "isError": False,
                },
            )
        elif name == "boom":
            _respond(
                request_id,
                {
                    "content": [{"type": "text", "text": "kaboom"}],
                    "isError": True,
                },
            )
        elif name == "hang":
            time.sleep(30)
            _respond(
                request_id,
                {"content": [{"type": "text", "text": "too late"}], "isError": False},
            )
        else:
            _error(request_id, -32602, f"unknown tool: {name}")
        return initialized

    _error(request_id, -32601, f"unknown method: {method}")
    return initialized


def main() -> None:
    sys.stderr.write("fake mcp server starting\n")
    sys.stderr.flush()
    initialized = False
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if not isinstance(message, dict):
            continue
        initialized = _handle(message, initialized)


if __name__ == "__main__":
    main()