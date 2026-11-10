"""Shared types for Kestrel's MCP (Model Context Protocol) client layer.

These dataclasses are the frozen seam between the transport clients, the tool
adapters, and the registry manager. Nothing here imports the rest of the app,
so tests can use these types without spawning processes or opening sockets.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class McpServerConfig:
    """One configured MCP server, ready to connect to.

    ``transport`` is ``"stdio"`` (a child process over stdin/stdout) or
    ``"http"`` (a Streamable HTTP endpoint). Secrets are already expanded from
    the environment by the config loader before this reaches a client.
    """

    name: str
    transport: str
    command: str | None = None
    args: tuple[str, ...] = ()
    env: dict[str, str] = field(default_factory=dict)
    cwd: str | None = None
    url: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
    enabled: bool = True
    # Operator overrides: skip the confirmation gate for this server, or force
    # every tool it exposes to be treated as read-only.
    auto_approve: bool = False
    read_only: bool = False
    # Tool names that mutate even when the server omits a ``readOnlyHint``.
    # Some servers (Notion, for example) advertise no annotations at all, so
    # without this they would all default to read-only and writes would run
    # without confirmation.
    write_tools: frozenset[str] = frozenset()
    # Optional allowlist of tool names to expose. ``None`` exposes every tool
    # the server advertises; a tuple exposes only the named tools.
    tools: tuple[str, ...] | None = None


@dataclass(frozen=True)
class McpTool:
    """A single tool advertised by an MCP server via ``tools/list``."""

    name: str
    description: str
    input_schema: dict[str, Any]
    # From the tool's ``annotations.readOnlyHint``; defaults to read-only.
    read_only: bool = True


@dataclass(frozen=True)
class McpCallResult:
    """The flattened result of ``tools/call``."""

    text: str
    is_error: bool = False


@dataclass(frozen=True)
class McpServerStatus:
    """A connection attempt's outcome, surfaced through the status endpoint."""

    name: str
    ok: bool
    tool_count: int
    error: str | None = None


class McpError(RuntimeError):
    """Base class for MCP transport failures."""


class McpConnectionError(McpError):
    """The server could not be started, reached, or spoken to."""


class McpClient(Protocol):
    """A live connection to one MCP server. Implementations are synchronous."""

    name: str

    def list_tools(self) -> list[McpTool]:
        """Return the tools the server advertises."""
        ...

    def call_tool(self, name: str, arguments: dict[str, Any]) -> McpCallResult:
        """Invoke one tool and return its flattened result."""
        ...

    def close(self) -> None:
        """Release the process or socket. Safe to call more than once."""
        ...
