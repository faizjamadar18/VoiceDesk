"""Load Kestrel's MCP server configuration from a JSON file.

The file has a single ``servers`` object keyed by server name::

    {
      "servers": {
        "local": {
          "command": "${PYTHON}",
          "args": ["-m", "my_mcp_server"],
          "env": {"MY_TOKEN": "${MY_TOKEN}"}
        },
        "docs": {
          "transport": "http",
          "url": "https://docs.test/mcp",
          "headers": {"Authorization": "Bearer ${DOCS_TOKEN}"}
        }
      }
    }

Secrets are never written into the file: every string is run through
``${VAR}`` expansion from the process environment before it reaches a client.
The loader is deliberately lenient about the file's top level (a missing or
malformed file simply yields no servers) but strict about each individual
server, because a half-configured server is a configuration mistake worth
surfacing.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from app.mcp.types import McpServerConfig

_VARIABLE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
# ``${PYTHON}`` is a convenience for tools that need the interpreter running
# Kestrel, without the operator having to know where that binary lives.
_PYTHON_VARIABLES = frozenset({"PYTHON", "PYTHON_EXE"})


def load_server_configs(path: Path) -> list[McpServerConfig]:
    """Return the enabled server configs described by ``path``.

    A missing file, unreadable JSON, or a missing ``servers`` object yields an
    empty list. A malformed *entry* raises :class:`ValueError` naming the
    offending server.
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return []

    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(data, dict):
        return []

    servers = data.get("servers")
    if not isinstance(servers, dict):
        return []

    configs: list[McpServerConfig] = []
    for name, entry in servers.items():
        config = _parse_server(str(name), entry)
        if config is not None:
            configs.append(config)
    return configs


def _parse_server(name: str, entry: Any) -> McpServerConfig | None:
    """Build one config, or ``None`` when the server is disabled."""
    if not isinstance(entry, dict):
        raise ValueError(f"MCP server '{name}' must be a JSON object.")

    if not entry.get("enabled", True):
        return None

    raw_command = entry.get("command")
    if raw_command is not None and not isinstance(raw_command, str):
        raise ValueError(f"MCP server '{name}' has a non-string command.")
    command = _expand(raw_command) if isinstance(raw_command, str) else None

    raw_transport = entry.get("transport")
    if raw_transport is None:
        transport = "stdio" if raw_command is not None else "http"
    elif isinstance(raw_transport, str):
        transport = raw_transport
    else:
        raise ValueError(f"MCP server '{name}' has a non-string transport.")
    if transport not in ("stdio", "http"):
        raise ValueError(
            f"MCP server '{name}' has unknown transport '{transport}'."
        )

    args = _expand_args(name, entry.get("args"))
    env = _expand_mapping(name, entry.get("env"))
    headers = _expand_mapping(name, entry.get("headers"))
    cwd = _expand_optional(name, "cwd", entry.get("cwd"))
    url = _expand_optional(name, "url", entry.get("url"))
    write_tools = _parse_write_tools(name, entry.get("write_tools"))
    tools = _parse_tools(name, entry.get("tools"))

    if transport == "stdio" and not (command or "").strip():
        raise ValueError(
            f"MCP server '{name}' uses stdio but has no command."
        )
    if transport == "http" and not (url or "").strip():
        raise ValueError(f"MCP server '{name}' uses http but has no url.")

    return McpServerConfig(
        name=name,
        transport=transport,
        command=command,
        args=args,
        env=env,
        cwd=cwd,
        url=url,
        headers=headers,
        enabled=True,
        auto_approve=bool(entry.get("auto_approve", False)),
        read_only=bool(entry.get("read_only", False)),
        write_tools=write_tools,
        tools=tools,
    )


def _expand(value: str) -> str:
    """Expand ``${VAR}`` references in ``value`` from the environment."""

    def replace(match: re.Match[str]) -> str:
        variable = match.group(1)
        if variable in _PYTHON_VARIABLES:
            return sys.executable
        return os.environ.get(variable, "")

    return _VARIABLE.sub(replace, value)


def _expand_args(name: str, raw: Any) -> tuple[str, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list) or not all(
        isinstance(item, str) for item in raw
    ):
        raise ValueError(f"MCP server '{name}' has invalid args.")
    return tuple(_expand(item) for item in raw)


def _expand_mapping(name: str, raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError(f"MCP server '{name}' has an invalid mapping field.")
    return {str(key): _expand(str(value)) for key, value in raw.items()}


def _expand_optional(name: str, field: str, raw: Any) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"MCP server '{name}' has a non-string {field}.")
    return _expand(raw)


def _parse_write_tools(name: str, raw: Any) -> frozenset[str]:
    """Read the optional ``write_tools`` list of mutating tool names."""
    if raw is None:
        return frozenset()
    if not isinstance(raw, list) or not all(
        isinstance(item, str) for item in raw
    ):
        raise ValueError(
            f"MCP server '{name}' has invalid write_tools (expected a list of "
            "strings)."
        )
    return frozenset(raw)


def _parse_tools(name: str, raw: Any) -> tuple[str, ...] | None:
    """Read the optional ``tools`` allowlist, or ``None`` for every tool."""
    if raw is None:
        return None
    if not isinstance(raw, list) or not all(
        isinstance(item, str) for item in raw
    ):
        raise ValueError(
            f"MCP server '{name}' has invalid tools (expected a list of "
            "strings)."
        )
    return tuple(raw)
