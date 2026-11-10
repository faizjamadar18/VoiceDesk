"""Expose connected MCP servers as ordinary Kestrel tools.

Each tool a server advertises becomes an :class:`McpToolAdapter`, which
implements the :class:`app.tools.Tool` protocol: it presents a :class:`ToolSpec`
for the planner and runs the tool through the live :class:`McpClient`.
:class:`McpManager` owns the clients: it connects every configured server,
collects their tools, reports per-server status, and tears the connections down.
"""

from __future__ import annotations

import json
import re
from contextlib import suppress
from typing import Any, Callable, Sequence

from app.mcp.schema import normalize_parameters
from app.mcp.types import (
    McpClient,
    McpServerConfig,
    McpServerStatus,
    McpTool,
)
from app.tools import Tool, ToolContext, ToolOutcome, ToolSpec

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_MESSAGE_LIMIT = 4000
_SPOKEN_LIMIT = 400


def humanize(name: str) -> str:
    """Turn a server id into a readable label, e.g. ``google_drive``."""
    words = [word for word in re.split(r"[^A-Za-z0-9]+", name) if word]
    if not words:
        return name
    return " ".join(word.lower().capitalize() for word in words)


def format_tool_result(text: str) -> str:
    """Turn a tool's raw text into one short, human-readable line."""
    stripped = text.strip()
    if not stripped:
        return "Done."
    if not stripped.startswith(("{", "[")):
        return text
    try:
        data = json.loads(stripped)
    except ValueError:
        return text

    if isinstance(data, list):
        return _summarize_items(data)
    if isinstance(data, dict):
        results = data.get("results")
        if isinstance(results, list):
            return _summarize_items(results)
        for key in ("title", "name", "message", "url"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return "Done."
    return str(data)


def _summarize_items(items: list[Any]) -> str:
    if not items:
        return "No results found."
    return f"Found {len(items)} result(s)."


def _sanitize(name: str) -> str:
    """Reduce ``name`` to ``[a-z0-9_]`` for use inside a tool identifier."""
    return _NON_ALNUM.sub("_", name.lower()).strip("_")


def _normalized_schema(schema: dict[str, Any] | None) -> dict[str, Any]:
    """Return a provider-safe object schema for an MCP tool.

    Delegates to :func:`app.mcp.schema.normalize_parameters`, which inlines
    ``$ref``/``$defs`` and strips JSON-Schema features that OpenAI-style
    function calling rejects, so one bad tool cannot fail a planner request.
    """
    return normalize_parameters(schema)


def _truncate(text: str, limit: int) -> str:
    """Collapse whitespace and cut ``text`` to ``limit`` characters."""
    collapsed = " ".join(str(text).split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[:limit].rstrip() + "..."


class McpToolAdapter:
    """A single MCP tool presented as a Kestrel :class:`Tool`."""

    def __init__(
        self, server: McpServerConfig, tool: McpTool, client: McpClient
    ) -> None:
        self._server = server
        self._tool = tool
        self._client = client
        if server.read_only:
            risk = "read"
        elif not tool.read_only or tool.name in server.write_tools:
            risk = "write"
        else:
            risk = "read"
        self.spec = ToolSpec(
            name=f"{_sanitize(server.name)}_{_sanitize(tool.name)}",
            description=tool.description or tool.name,
            parameters=_normalized_schema(tool.input_schema),
            risk=risk,
            requires_confirmation=risk == "write" and not server.auto_approve,
            action_label=humanize(server.name),
        )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        action = self.spec.action_label
        if ctx.dry_run:
            return ToolOutcome(
                status="ok",
                action=action,
                message=f"Would run {self._tool.name}.",
            )
        try:
            result = self._client.call_tool(self._tool.name, dict(arguments))
        except Exception as exc:  # noqa: BLE001 - never let a tool crash the app
            return ToolOutcome(
                status="error",
                action=action,
                message=f"{humanize(self._server.name)} couldn't run "
                f"{self._tool.name}: {exc}",
            )
        text = _truncate(result.text, _MESSAGE_LIMIT)
        if result.is_error:
            return ToolOutcome(status="error", action=action, message=text)
        summary = format_tool_result(result.text)
        return ToolOutcome(
            status="ok",
            action=action,
            message=_truncate(summary, _MESSAGE_LIMIT),
            spoken_response=_truncate(summary, _SPOKEN_LIMIT),
        )


class McpManager:
    """Connect to every configured MCP server and expose their tools."""

    def __init__(
        self,
        configs: Sequence[McpServerConfig],
        client_factory: Callable[[McpServerConfig], McpClient] | None = None,
        logger: Any = None,
    ) -> None:
        self._configs = list(configs)
        self._client_factory = client_factory
        self._logger = logger
        self._clients: list[McpClient] = []
        self._adapters: list[Tool] = []
        self._statuses: list[McpServerStatus] = []

    @property
    def tools(self) -> list[Tool]:
        """Every tool exposed by the servers that connected successfully."""
        return list(self._adapters)

    @property
    def statuses(self) -> list[McpServerStatus]:
        """The outcome of each server's last connection attempt."""
        return list(self._statuses)

    def connect(self) -> list[McpServerStatus]:
        """Connect every config, recording a status and never raising."""
        self._adapters = []
        self._statuses = []
        for config in self._configs:
            self._statuses.append(self._connect_one(config))
        return list(self._statuses)

    def close(self) -> None:
        """Close every connected client, swallowing errors. Idempotent."""
        clients, self._clients = self._clients, []
        for client in clients:
            with suppress(Exception):
                client.close()

    def _connect_one(self, config: McpServerConfig) -> McpServerStatus:
        try:
            client = self._make_client(config)
        except Exception as exc:  # noqa: BLE001 - report, don't crash
            return McpServerStatus(
                name=config.name, ok=False, tool_count=0, error=str(exc)
            )

        # Track the client before listing tools, so a half-open process is
        # still torn down by ``close`` even if ``list_tools`` fails.
        self._clients.append(client)
        try:
            tools = client.list_tools()
        except Exception as exc:  # noqa: BLE001 - report, don't crash
            return McpServerStatus(
                name=config.name, ok=False, tool_count=0, error=str(exc)
            )

        selected = [
            tool
            for tool in tools
            if config.tools is None or tool.name in config.tools
        ]
        for tool in selected:
            self._adapters.append(McpToolAdapter(config, tool, client))
        return McpServerStatus(
            name=config.name, ok=True, tool_count=len(selected)
        )

    def _make_client(self, config: McpServerConfig) -> McpClient:
        factory = self._client_factory
        if factory is None:
            from app.mcp.client import make_client as factory
        return factory(config)
