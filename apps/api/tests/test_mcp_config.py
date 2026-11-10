from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

from app.mcp.config import load_server_configs


def write_config(tmp_path: Path, data: Any) -> Path:
    path = tmp_path / "mcp.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_missing_file_returns_empty_list(tmp_path: Path) -> None:
    assert load_server_configs(tmp_path / "does-not-exist.json") == []


def test_missing_servers_key_is_lenient(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"unrelated": True})

    assert load_server_configs(path) == []


def test_non_object_top_level_is_lenient(tmp_path: Path) -> None:
    path = tmp_path / "mcp.json"
    path.write_text("[]", encoding="utf-8")

    assert load_server_configs(path) == []


def test_expands_environment_variables(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MCP_SECRET", "s3cret")
    path = write_config(
        tmp_path,
        {"servers": {"gh": {"transport": "http", "url": "https://x.test/${MCP_SECRET}"}}},
    )

    configs = load_server_configs(path)

    assert len(configs) == 1
    assert configs[0].url == "https://x.test/s3cret"


def test_python_vars_expand_to_the_interpreter(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PYTHON", "ignored")
    path = write_config(
        tmp_path,
        {
            "servers": {
                "one": {"command": "${PYTHON}"},
                "two": {"command": "${PYTHON_EXE}"},
            }
        },
    )

    configs = load_server_configs(path)

    assert [config.command for config in configs] == [
        sys.executable,
        sys.executable,
    ]


def test_unknown_variable_expands_to_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MCP_NOT_SET", raising=False)
    path = write_config(
        tmp_path, {"servers": {"s": {"command": "run-${MCP_NOT_SET}-now"}}}
    )

    configs = load_server_configs(path)

    assert configs[0].command == "run--now"


def test_expands_args_env_cwd_url_and_headers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ROOT", "/opt/app")
    monkeypatch.setenv("KEY", "abc")
    path = write_config(
        tmp_path,
        {
            "servers": {
                "s": {
                    "command": "${PYTHON}",
                    "args": ["--root", "${ROOT}"],
                    "env": {"TOKEN": "${KEY}"},
                    "cwd": "${ROOT}/sub",
                },
                "h": {
                    "transport": "http",
                    "url": "https://${KEY}.test",
                    "headers": {"Authorization": "Bearer ${KEY}"},
                },
            }
        },
    )

    by_name = {config.name: config for config in load_server_configs(path)}

    assert by_name["s"].args == ("--root", "/opt/app")
    assert by_name["s"].env == {"TOKEN": "abc"}
    assert by_name["s"].cwd == "/opt/app/sub"
    assert by_name["h"].url == "https://abc.test"
    assert by_name["h"].headers == {"Authorization": "Bearer abc"}


def test_disabled_servers_are_skipped(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {
            "servers": {
                "keep": {"command": "a"},
                "drop": {"command": "b", "enabled": False},
            }
        },
    )

    configs = load_server_configs(path)

    assert [config.name for config in configs] == ["keep"]


def test_disabled_server_is_not_validated(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {"servers": {"drop": {"transport": "http", "enabled": False}}},
    )

    assert load_server_configs(path) == []


def test_transport_defaults_to_stdio_when_command_present(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"s": {"command": "npx"}}})

    assert load_server_configs(path)[0].transport == "stdio"


def test_transport_defaults_to_http_when_no_command(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"s": {"url": "https://x.test"}}})

    assert load_server_configs(path)[0].transport == "http"


def test_explicit_transport_is_respected(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {"servers": {"s": {"transport": "http", "url": "https://x.test"}}},
    )

    assert load_server_configs(path)[0].transport == "http"


def test_stdio_server_without_command_raises(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"broken": {"transport": "stdio"}}})

    with pytest.raises(ValueError) as excinfo:
        load_server_configs(path)

    assert "broken" in str(excinfo.value)


def test_http_server_without_url_raises(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"broken": {"transport": "http"}}})

    with pytest.raises(ValueError) as excinfo:
        load_server_configs(path)

    assert "broken" in str(excinfo.value)


def test_boolean_flags_default_to_false_and_enabled(
    tmp_path: Path,
) -> None:
    path = write_config(tmp_path, {"servers": {"s": {"command": "x"}}})

    config = load_server_configs(path)[0]

    assert config.enabled is True
    assert config.auto_approve is False
    assert config.read_only is False


def test_explicit_boolean_flags_are_read(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {
            "servers": {
                "s": {
                    "command": "x",
                    "auto_approve": True,
                    "read_only": True,
                }
            }
        },
    )

    config = load_server_configs(path)[0]

    assert config.auto_approve is True
    assert config.read_only is True


def test_write_tools_is_read_from_config(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {
            "servers": {
                "notion": {
                    "command": "x",
                    "write_tools": ["API-post-page", "API-delete-a-block"],
                }
            }
        },
    )

    config = load_server_configs(path)[0]

    assert config.write_tools == frozenset(
        {"API-post-page", "API-delete-a-block"}
    )


def test_write_tools_defaults_to_empty(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"s": {"command": "x"}}})

    assert load_server_configs(path)[0].write_tools == frozenset()


def test_invalid_write_tools_raises(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {"servers": {"notion": {"command": "x", "write_tools": "nope"}}},
    )

    with pytest.raises(ValueError) as excinfo:
        load_server_configs(path)

    assert "notion" in str(excinfo.value)


def test_tools_allowlist_is_read_from_config(tmp_path: Path) -> None:
    path = write_config(
        tmp_path,
        {
            "servers": {
                "notion": {
                    "command": "x",
                    "tools": ["API-post-search", "API-post-page"],
                }
            }
        },
    )

    config = load_server_configs(path)[0]

    assert config.tools == ("API-post-search", "API-post-page")


def test_tools_defaults_to_none(tmp_path: Path) -> None:
    path = write_config(tmp_path, {"servers": {"s": {"command": "x"}}})

    assert load_server_configs(path)[0].tools is None


def test_invalid_tools_raises(tmp_path: Path) -> None:
    path = write_config(
        tmp_path, {"servers": {"notion": {"command": "x", "tools": "nope"}}}
    )

    with pytest.raises(ValueError) as excinfo:
        load_server_configs(path)

    assert "notion" in str(excinfo.value)
