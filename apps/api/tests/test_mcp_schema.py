"""Tests for turning MCP JSON Schemas into provider-safe parameter schemas."""

from __future__ import annotations

import json
from typing import Any

from app.mcp.schema import normalize_parameters

EMPTY_OBJECT: dict[str, Any] = {
    "type": "object",
    "properties": {},
    "required": [],
}


def test_inlines_refs_and_removes_defs() -> None:
    schema = {
        "$defs": {
            "thing": {
                "type": "object",
                "properties": {"id": {"type": "string"}},
                "required": ["id"],
            }
        },
        "type": "object",
        "properties": {"item": {"$ref": "#/$defs/thing"}},
        "required": ["item"],
    }

    result = normalize_parameters(schema)

    assert "$defs" not in result
    assert "$ref" not in json.dumps(result)
    assert result["properties"]["item"] == {
        "type": "object",
        "properties": {"id": {"type": "string"}},
        "required": ["id"],
    }


def test_definitions_keyword_is_also_inlined() -> None:
    schema = {
        "definitions": {"thing": {"type": "string"}},
        "type": "object",
        "properties": {"name": {"$ref": "#/definitions/thing"}},
    }

    result = normalize_parameters(schema)

    assert result["properties"]["name"] == {"type": "string"}
    assert "$ref" not in json.dumps(result)


def test_nested_refs_are_inlined() -> None:
    schema = {
        "$defs": {
            "inner": {"type": "object", "properties": {"x": {"type": "string"}}},
            "outer": {
                "type": "object",
                "properties": {"inner": {"$ref": "#/$defs/inner"}},
            },
        },
        "type": "object",
        "properties": {"outer": {"$ref": "#/$defs/outer"}},
    }

    result = normalize_parameters(schema)

    assert result["properties"]["outer"]["properties"]["inner"] == {
        "type": "object",
        "properties": {"x": {"type": "string"}},
        "required": [],
    }
    assert "$ref" not in json.dumps(result)


def test_recursive_def_terminates_without_refs() -> None:
    schema = {
        "$defs": {
            "node": {
                "type": "object",
                "properties": {"child": {"$ref": "#/$defs/node"}},
            }
        },
        "type": "object",
        "properties": {"root": {"$ref": "#/$defs/node"}},
    }

    result = normalize_parameters(schema)

    assert "$ref" not in json.dumps(result)
    assert "$defs" not in json.dumps(result)


def test_unresolvable_ref_becomes_permissive_object() -> None:
    schema = {"type": "object", "properties": {"x": {"$ref": "#/$defs/missing"}}}

    result = normalize_parameters(schema)

    assert result["properties"]["x"] == {"type": "object"}


def test_const_becomes_enum() -> None:
    schema = {"type": "object", "properties": {"kind": {"const": "page"}}}

    result = normalize_parameters(schema)

    assert result["properties"]["kind"] == {"enum": ["page"]}


def test_array_type_is_collapsed_to_a_single_type() -> None:
    schema = {
        "type": "object",
        "properties": {
            "obj": {"type": ["object", "null"]},
            "text": {"type": ["string", "null"]},
        },
    }

    props = normalize_parameters(schema)["properties"]

    assert props["obj"]["type"] == "object"
    assert props["text"] == {"type": "string"}


def test_any_of_object_branches_are_merged() -> None:
    schema = {
        "$defs": {
            "p": {
                "type": "object",
                "properties": {"paragraph": {"type": "object"}},
            },
            "b": {
                "type": "object",
                "properties": {"bulleted": {"type": "object"}},
            },
        },
        "type": "object",
        "properties": {
            "children": {
                "type": "array",
                "items": {
                    "anyOf": [
                        {"$ref": "#/$defs/p"},
                        {"$ref": "#/$defs/b"},
                    ]
                },
            }
        },
    }

    items = normalize_parameters(schema)["properties"]["children"]["items"]

    assert items["type"] == "object"
    assert set(items["properties"]) == {"paragraph", "bulleted"}
    assert "$ref" not in json.dumps(items)


def test_top_level_is_always_an_object() -> None:
    assert normalize_parameters({"type": "string"}) == EMPTY_OBJECT


def test_required_is_filtered_to_existing_properties() -> None:
    schema = {
        "type": "object",
        "properties": {"a": {"type": "string"}},
        "required": ["a", "ghost"],
    }

    assert normalize_parameters(schema)["required"] == ["a"]


def test_unsupported_keywords_are_dropped() -> None:
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "a": {"type": "string", "format": "uuid", "default": "x"}
        },
    }

    result = normalize_parameters(schema)

    assert "additionalProperties" not in result
    assert result["properties"]["a"] == {"type": "string"}


def test_input_schema_is_not_mutated() -> None:
    schema = {
        "$defs": {"thing": {"type": "string"}},
        "type": "object",
        "properties": {"a": {"$ref": "#/$defs/thing"}},
        "required": ["a"],
    }
    before = json.dumps(schema, sort_keys=True)

    normalize_parameters(schema)

    assert json.dumps(schema, sort_keys=True) == before


def test_missing_or_non_dict_input_is_an_empty_object() -> None:
    assert normalize_parameters(None) == EMPTY_OBJECT
    assert normalize_parameters("nope") == EMPTY_OBJECT
    assert normalize_parameters({}) == EMPTY_OBJECT