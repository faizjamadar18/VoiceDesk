"""Turn MCP tool schemas into provider-safe parameter schemas.

MCP servers publish full JSON Schema: ``$ref``/``$defs``, ``anyOf``/``oneOf``
unions, array types (``["object", "null"]``), ``const``, ``additionalProperties``,
and so on. OpenAI-style function calling — and therefore Groq — rejects several
of these, and because every tool shares one request, a single bad schema fails
the whole planner call.

:func:`normalize_parameters` flattens any schema into a small, conservative
object schema that every provider accepts, while keeping the property names and
types a model needs to call the tool.
"""

from __future__ import annotations

from typing import Any

# How deep to follow nested ``$ref``/``properties`` before giving up and
# emitting a permissive object. Bounds both recursion and payload size.
MAX_DEPTH = 8

_OBJECT = "object"
_ALLOWED_TYPES = frozenset(
    {"object", "array", "string", "number", "integer", "boolean"}
)
_REF_PREFIXES = ("#/$defs/", "#/definitions/")


def normalize_parameters(schema: Any) -> dict[str, Any]:
    """Return a provider-safe object schema for ``schema``.

    The result always has ``type``, ``properties`` and ``required`` keys, never
    contains ``$ref`` or ``$defs``, and never mutates the input.
    """
    root = schema if isinstance(schema, dict) else {}
    defs = _collect_defs(root)
    converted = _convert(root, defs, (), 0)
    if not isinstance(converted, dict):
        converted = {}

    properties = converted.get("properties")
    if not isinstance(properties, dict):
        properties = {}
    required = converted.get("required")
    if not isinstance(required, list):
        required = []
    required = [name for name in required if name in properties]
    return {"type": _OBJECT, "properties": properties, "required": required}


def _collect_defs(root: dict[str, Any]) -> dict[str, Any]:
    defs: dict[str, Any] = {}
    for key in ("$defs", "definitions"):
        value = root.get(key)
        if isinstance(value, dict):
            for name, subschema in value.items():
                if isinstance(subschema, dict):
                    defs[str(name)] = subschema
    return defs


def _convert(
    node: Any,
    defs: dict[str, Any],
    ref_stack: tuple[str, ...],
    depth: int,
) -> dict[str, Any]:
    if depth > MAX_DEPTH or not isinstance(node, dict):
        return {"type": _OBJECT}

    ref = node.get("$ref")
    if isinstance(ref, str):
        return _resolve_ref(ref, defs, ref_stack, depth)

    for keyword in ("anyOf", "oneOf", "allOf"):
        branches = node.get(keyword)
        if isinstance(branches, list) and branches:
            return _merge_branches(branches, defs, ref_stack, depth)

    node_type = _normalize_type(node.get("type"))
    properties = node.get("properties")
    has_properties = isinstance(properties, dict)
    if node_type is None and has_properties:
        node_type = _OBJECT

    out: dict[str, Any] = {}
    if node_type is not None:
        out["type"] = node_type

    description = node.get("description")
    if isinstance(description, str) and description.strip():
        out["description"] = description

    enum = node.get("enum")
    if isinstance(enum, list) and enum:
        out["enum"] = list(enum)
    elif "const" in node:
        out["enum"] = [node["const"]]

    if node_type == _OBJECT:
        out["type"] = _OBJECT
        new_properties: dict[str, Any] = {}
        if has_properties:
            for name, child in properties.items():
                new_properties[str(name)] = _convert(
                    child, defs, ref_stack, depth + 1
                )
        out["properties"] = new_properties
        required = node.get("required")
        out["required"] = (
            [str(name) for name in required if str(name) in new_properties]
            if isinstance(required, list)
            else []
        )
    elif node_type == "array":
        items = node.get("items")
        if isinstance(items, dict):
            out["items"] = _convert(items, defs, ref_stack, depth + 1)

    return out


def _resolve_ref(
    ref: str,
    defs: dict[str, Any],
    ref_stack: tuple[str, ...],
    depth: int,
) -> dict[str, Any]:
    name = _ref_name(ref)
    if name is None or name in ref_stack:
        # Unknown or recursive reference: stop with a permissive object rather
        # than emitting a dangling ``$ref``.
        return {"type": _OBJECT}
    target = defs.get(name)
    if not isinstance(target, dict):
        return {"type": _OBJECT}
    return _convert(target, defs, ref_stack + (name,), depth + 1)


def _ref_name(ref: str) -> str | None:
    for prefix in _REF_PREFIXES:
        if ref.startswith(prefix):
            return ref[len(prefix) :]
    return None


def _merge_branches(
    branches: list[Any],
    defs: dict[str, Any],
    ref_stack: tuple[str, ...],
    depth: int,
) -> dict[str, Any]:
    converted = [
        _convert(branch, defs, ref_stack, depth + 1)
        for branch in branches
        if isinstance(branch, dict)
    ]
    if not converted:
        return {"type": _OBJECT}

    objects = [
        branch
        for branch in converted
        if branch.get("type") == _OBJECT or "properties" in branch
    ]
    if objects:
        properties: dict[str, Any] = {}
        for branch in objects:
            branch_props = branch.get("properties")
            if isinstance(branch_props, dict):
                for name, value in branch_props.items():
                    properties.setdefault(name, value)
        return {"type": _OBJECT, "properties": properties, "required": []}

    enums = [branch["enum"] for branch in converted if "enum" in branch]
    if enums and len(enums) == len(converted):
        merged: list[Any] = []
        for values in enums:
            for value in values:
                if value not in merged:
                    merged.append(value)
        return {"enum": merged}

    types: list[str] = []
    for branch in converted:
        branch_type = branch.get("type")
        if isinstance(branch_type, str) and branch_type not in types:
            types.append(branch_type)
    if len(types) == 1:
        return {"type": types[0]}
    return {"type": _OBJECT}


def _normalize_type(raw: Any) -> str | None:
    if isinstance(raw, str):
        return raw if raw in _ALLOWED_TYPES else None
    if isinstance(raw, list):
        names = [name for name in raw if isinstance(name, str) and name != "null"]
        if _OBJECT in names:
            return _OBJECT
        for name in names:
            if name in _ALLOWED_TYPES:
                return name
    return None