"""Tests for resolving bare MCP server commands to runnable paths."""

from __future__ import annotations

import sys

import app.mcp.client as mcp_client
from app.mcp.client import _resolve_command


def test_absolute_path_is_returned_unchanged():
    assert _resolve_command(sys.executable) == sys.executable


def test_bare_command_resolves_through_shutil_which(monkeypatch):
    monkeypatch.setattr(
        mcp_client.shutil, "which", lambda name: r"C:\bin\npx.cmd"
    )
    assert _resolve_command("npx") == r"C:\bin\npx.cmd"


def test_unknown_command_is_returned_unchanged(monkeypatch):
    monkeypatch.setattr(mcp_client.shutil, "which", lambda name: None)
    assert _resolve_command("definitely-not-installed") == "definitely-not-installed"


def test_command_containing_a_separator_is_not_resolved(monkeypatch):
    def fail(name: str) -> str:  # pragma: no cover - must not be called
        raise AssertionError("shutil.which should not run for a path")

    monkeypatch.setattr(mcp_client.shutil, "which", fail)
    assert _resolve_command("some/dir/server") == "some/dir/server"