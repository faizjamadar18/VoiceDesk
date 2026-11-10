from __future__ import annotations

from app.tools import build_default_registry

TOOL_NAMES = {
    "open_app",
    "web_search",
    "type_text",
    "current_time",
    "current_date",
    "search_files",
    "create_folder",
    "create_file",
    "delete_file",
    "get_weather",
}


def test_registry_exposes_all_default_tools():
    registry = build_default_registry(None)

    names = {spec.name for spec in registry.specs()}

    assert names == TOOL_NAMES


def test_unknown_tool_returns_none():
    registry = build_default_registry(None)

    assert registry.get("no_such_tool") is None


def test_create_folder_spec_creates_without_confirmation_and_can_undo():
    registry = build_default_registry(None)

    spec = registry.get("create_folder").spec

    assert spec.risk == "write"
    assert spec.requires_confirmation is False
    assert spec.undo == "remove_created"


def test_create_file_spec_creates_without_confirmation_and_can_undo():
    registry = build_default_registry(None)

    spec = registry.get("create_file").spec

    assert spec.risk == "write"
    assert spec.requires_confirmation is False
    assert spec.undo == "remove_created"


def test_delete_file_spec_needs_confirmation_and_has_no_undo():
    registry = build_default_registry(None)

    spec = registry.get("delete_file").spec

    assert spec.risk == "write"
    assert spec.requires_confirmation is True
    assert spec.undo is None


def test_search_files_spec_is_read_without_confirmation():
    registry = build_default_registry(None)

    spec = registry.get("search_files").spec

    assert spec.risk == "read"
    assert spec.requires_confirmation is False


def test_type_text_is_write_without_confirmation():
    registry = build_default_registry(None)

    spec = registry.get("type_text").spec

    assert spec.risk == "write"
    assert spec.requires_confirmation is False


def test_open_app_spec_accepts_any_installed_app():
    registry = build_default_registry(None)

    spec = registry.get("open_app").spec
    app_parameter = spec.parameters["properties"]["app"]

    assert app_parameter["type"] == "string"
    assert "enum" not in app_parameter
    assert "installed" in spec.description.lower()


def test_function_declarations_use_google_format():
    registry = build_default_registry(None)

    declarations = registry.function_declarations()

    assert len(declarations) == len(TOOL_NAMES)
    for declaration in declarations:
        assert set(declaration) == {"name", "description", "parameters"}
        assert isinstance(declaration["description"], str)
        assert declaration["parameters"]["type"] == "object"
        assert isinstance(declaration["parameters"]["properties"], dict)
