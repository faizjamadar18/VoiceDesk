"""Tool registry and built-in tools for Kestrel.

A *tool* is a small, named capability with a JSON-Schema signature that a model
can call. The registry is the single source of truth for what Kestrel can do,
and it produces Google-style function declarations for the planner.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Protocol
from urllib.parse import quote_plus

from app.actions import ActionExecutionError, ActionExecutor
from app.apps import app_label
from app.files import LocationNotFound, TargetExists, UnsafeLocation
from app.weather import WeatherClient
from app.windows_search import WindowsSearchUnavailable

if TYPE_CHECKING:
    from app.files import FileOps
    from app.windows_search import FileSearch


@dataclass(frozen=True)
class ToolSpec:
    """A tool's public contract: how a model should call it and how safe it is."""

    name: str
    description: str
    parameters: dict
    risk: str
    requires_confirmation: bool
    undo: str | None = None
    action_label: str | None = None


@dataclass(frozen=True)
class ToolCall:
    """A validated request to run a tool with keyword arguments."""

    name: str
    arguments: dict


@dataclass(frozen=True)
class LlmReply:
    """A model reply: tool calls it chose plus any plain-text content."""

    calls: list[ToolCall] = field(default_factory=list)
    content: str | None = None


@dataclass(frozen=True)
class ToolOutcome:
    """The result of running a tool, shaped for the ``/act`` wire response."""

    status: str
    action: str
    message: str
    text: str | None = None
    url: str | None = None
    target: str | None = None
    results: tuple[dict, ...] | None = None
    plan_id: str | None = None
    risk: str | None = None
    requires_confirmation: bool = False
    can_undo: bool = False
    card: dict | None = None
    spoken_response: str | None = None


@dataclass(frozen=True)
class ToolPreparation:
    """A tool's pre-flight step, run before any confirmation is requested.

    Write tools that must name a concrete target (delete) use this to resolve a
    spoken query to one real path, and to report the path in the confirm card.
    ``outcome`` short-circuits ``/act`` when the tool cannot proceed.
    """

    arguments: dict
    display: str | None = None
    message: str | None = None
    outcome: ToolOutcome | None = None


@dataclass
class ToolContext:
    """Everything a tool needs to run, injected so tests stay hermetic."""

    executor: ActionExecutor
    clock: Callable[[], datetime]
    file_roots: tuple[Path, ...]
    dry_run: bool
    file_ops: "FileOps"
    file_search: "FileSearch"


class Tool(Protocol):
    spec: ToolSpec

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        """Run the tool with already-validated keyword arguments."""
        ...


class ToolRegistry:
    """Holds the tools Kestrel can run, keyed by name."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.spec.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def specs(self) -> list[ToolSpec]:
        return [tool.spec for tool in self._tools.values()]

    def function_declarations(self) -> list[dict]:
        """Return declarations in Google's ``functionDeclarations`` format."""
        return function_declarations_from_specs(self.specs())


def function_declarations_from_specs(specs: list[ToolSpec]) -> list[dict]:
    """Convert tool specs into Google ``functionDeclarations`` entries."""
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters,
        }
        for spec in specs
    ]


def _object_schema(properties: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
    }


def _app_label(app: str) -> str:
    return app_label(app)


class OpenAppTool:
    spec = ToolSpec(
        name="open_app",
        description=(
            "Open any application installed on the user's Windows PC, "
            "including Start menu, Microsoft Store, and desktop apps. Use the "
            "name people say, such as 'Notion', 'WhatsApp', 'Visual Studio "
            "Code', or 'Calculator'. Do not use for websites, files, or "
            "folders."
        ),
        parameters=_object_schema(
            {
                "app": {
                    "type": "string",
                    "description": "The installed application's common name.",
                }
            },
            ["app"],
        ),
        risk="read",
        requires_confirmation=False,
        action_label="open_app",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        app = str(arguments["app"]).strip()
        if not ctx.dry_run:
            try:
                ctx.executor.open_app(app)
            except ActionExecutionError as exc:
                return ToolOutcome(
                    status="error",
                    action="open_app",
                    message=str(exc),
                    target=app,
                )
        return ToolOutcome(
            status="ok",
            action="open_app",
            message=f"Opening {_app_label(app)}.",
            target=app,
        )


class WebSearchTool:
    spec = ToolSpec(
        name="web_search",
        description="Search the web using the user's default browser.",
        parameters=_object_schema(
            {"query": {"type": "string", "description": "The search query."}},
            ["query"],
        ),
        risk="read",
        requires_confirmation=False,
        action_label="browser",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        query = arguments["query"]
        url = f"https://www.google.com/search?q={quote_plus(query)}"
        if not ctx.dry_run:
            ctx.executor.open_url(url)
        return ToolOutcome(
            status="ok",
            action="browser",
            message=f"Searching the web for {query}.",
            url=url,
        )


class TypeTextTool:
    spec = ToolSpec(
        name="type_text",
        description="Type text into the app the user is currently focused on.",
        parameters=_object_schema(
            {"text": {"type": "string", "description": "The text to type."}},
            ["text"],
        ),
        risk="write",
        requires_confirmation=False,
        action_label="type",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        text = arguments["text"]
        return ToolOutcome(
            status="ok",
            action="type",
            message="Typing that into the focused app.",
            text=text,
        )


class CurrentTimeTool:
    spec = ToolSpec(
        name="current_time",
        description="Tell the user the current local time.",
        parameters=_object_schema({}, []),
        risk="read",
        requires_confirmation=False,
        action_label="answer",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        return ToolOutcome(
            status="ok",
            action="answer",
            message=f"It's {ctx.clock().strftime('%H:%M')}.",
        )


class CurrentDateTool:
    spec = ToolSpec(
        name="current_date",
        description="Tell the user today's local date.",
        parameters=_object_schema({}, []),
        risk="read",
        requires_confirmation=False,
        action_label="answer",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        return ToolOutcome(
            status="ok",
            action="answer",
            message=f"Today is {ctx.clock().strftime('%Y-%m-%d')}.",
        )


class SearchFilesTool:
    spec = ToolSpec(
        name="search_files",
        description=(
            "Search the user's local files by file name or folder path. "
            "Read only."
        ),
        parameters=_object_schema(
            {
                "query": {
                    "type": "string",
                    "description": "Words to match in a file or folder name.",
                }
            },
            ["query"],
        ),
        risk="read",
        requires_confirmation=False,
        action_label="search_files",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        query = arguments["query"]
        try:
            found = ctx.file_search.search(query)
        except WindowsSearchUnavailable:
            return ToolOutcome(
                status="error",
                action="search_files",
                message=(
                    "I couldn't search your files because Windows Search "
                    "is not available on this PC."
                ),
            )
        results = tuple(
            {
                "name": item["name"],
                "path": item["path"],
                "sizeBytes": item["sizeBytes"],
                "modified": item["modified"],
            }
            for item in found
        )
        return ToolOutcome(
            status="ok",
            action="search_files",
            message=f'I found {len(results)} file(s) matching "{query}".',
            results=results,
        )


class CreateFolderTool:
    spec = ToolSpec(
        name="create_folder",
        description=(
            "Create one new folder where the user says, or on the Desktop. "
            "Fails if the folder already exists."
        ),
        parameters=_object_schema(
            {
                "name": {"type": "string", "description": "The new folder name."},
                "location": {
                    "type": "string",
                    "description": (
                        "Where to create it, e.g. 'Desktop', 'Downloads', "
                        "'in my Documents'. Defaults to the Desktop."
                    ),
                },
            },
            ["name"],
        ),
        risk="write",
        requires_confirmation=False,
        undo="remove_created",
        action_label="create_folder",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        name = arguments["name"]
        location = arguments.get("location")
        if ctx.dry_run:
            return ToolOutcome(
                status="ok",
                action="create_folder",
                message=f'Created folder "{name}".',
            )
        try:
            target = ctx.file_ops.create_folder(name, location)
        except (UnsafeLocation, LocationNotFound, TargetExists, ValueError) as exc:
            return ToolOutcome(
                status="error", action="create_folder", message=str(exc)
            )
        return ToolOutcome(
            status="ok",
            action="create_folder",
            message=f'Created "{target.name}" in {target.parent}.',
            target=str(target),
            can_undo=True,
        )


class CreateFileTool:
    spec = ToolSpec(
        name="create_file",
        description=(
            "Create one new, empty file where the user says, or on the "
            "Desktop. Fails if the file already exists."
        ),
        parameters=_object_schema(
            {
                "name": {
                    "type": "string",
                    "description": "The new file name, e.g. 'notes.txt'.",
                },
                "location": {
                    "type": "string",
                    "description": (
                        "Where to create it, e.g. 'Desktop', 'Downloads', "
                        "'in my Documents'. Defaults to the Desktop."
                    ),
                },
            },
            ["name"],
        ),
        risk="write",
        requires_confirmation=False,
        undo="remove_created",
        action_label="create_file",
    )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        name = arguments["name"]
        location = arguments.get("location")
        if ctx.dry_run:
            return ToolOutcome(
                status="ok",
                action="create_file",
                message=f'Created file "{name}".',
            )
        try:
            target = ctx.file_ops.create_file(name, location)
        except (UnsafeLocation, LocationNotFound, TargetExists, ValueError) as exc:
            return ToolOutcome(
                status="error", action="create_file", message=str(exc)
            )
        return ToolOutcome(
            status="ok",
            action="create_file",
            message=f'Created "{target.name}" in {target.parent}.',
            target=str(target),
            can_undo=True,
        )


class DeleteFileTool:
    spec = ToolSpec(
        name="delete_file",
        description=(
            "Move one file the user names to the Windows Recycle Bin. Never "
            "deletes permanently. Always asks for approval first."
        ),
        parameters=_object_schema(
            {
                "query": {
                    "type": "string",
                    "description": "Words from the name of the file to delete.",
                }
            },
            ["query"],
        ),
        risk="write",
        requires_confirmation=True,
        action_label="delete_file",
    )

    def prepare(self, arguments: dict, ctx: ToolContext) -> ToolPreparation:
        """Resolve the spoken query to exactly one real file, or explain why not."""
        query = str(arguments.get("query", "")).strip()
        if not query:
            return ToolPreparation(
                arguments,
                outcome=ToolOutcome(
                    status="unhandled",
                    action="delete_file",
                    message="Which file should I delete?",
                ),
            )

        try:
            found = ctx.file_search.search(query)
        except WindowsSearchUnavailable:
            return ToolPreparation(
                arguments,
                outcome=ToolOutcome(
                    status="error",
                    action="delete_file",
                    message=(
                        "I can't search your files because Windows Search is "
                        "not available on this PC."
                    ),
                ),
            )

        existing: list[dict] = []
        for item in found:
            try:
                path = ctx.file_ops.resolve_delete_target(item.get("path"))
            except (UnsafeLocation, FileNotFoundError):
                continue
            existing.append(
                {
                    "name": item.get("name") or path.name,
                    "path": str(path),
                    "sizeBytes": item.get("sizeBytes"),
                    "modified": item.get("modified") or "",
                }
            )

        if not existing:
            return ToolPreparation(
                arguments,
                outcome=ToolOutcome(
                    status="unhandled",
                    action="delete_file",
                    message=f'I couldn\'t find a file matching "{query}".',
                ),
            )

        if len(existing) > 1:
            return ToolPreparation(
                arguments,
                outcome=ToolOutcome(
                    status="unhandled",
                    action="delete_file",
                    message=(
                        f'I found {len(existing)} files matching "{query}". '
                        "Which one do you mean?"
                    ),
                    results=tuple(existing),
                ),
            )

        only = existing[0]
        return ToolPreparation(
            arguments={"path": only["path"]},
            display=only["path"],
            message=f'Delete "{only["name"]}"? Approval needed.',
        )

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        path = arguments["path"]
        if ctx.dry_run:
            return ToolOutcome(
                status="ok",
                action="delete_file",
                message="Moved the file to the Recycle Bin.",
                target=str(path),
            )
        try:
            removed = ctx.file_ops.delete_file(path)
        except (UnsafeLocation, FileNotFoundError) as exc:
            return ToolOutcome(
                status="error", action="delete_file", message=str(exc)
            )
        return ToolOutcome(
            status="ok",
            action="delete_file",
            message=f'Moved "{removed.name}" to the Recycle Bin.',
            target=str(removed),
        )


class GetWeatherTool:
    spec = ToolSpec(
        name="get_weather",
        description="Check real-time weather and forecast for any city, country, or location.",
        parameters={
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City, state, or country name (e.g. 'India', 'San Francisco', 'London').",
                }
            },
            "required": ["location"],
        },
        risk="read",
        requires_confirmation=False,
        action_label="Weather",
    )

    def prepare(self, arguments: dict, ctx: ToolContext) -> ToolPreparation:
        return ToolPreparation(arguments)

    def run(self, arguments: dict, ctx: ToolContext) -> ToolOutcome:
        loc = arguments.get("location", "Current Location")
        client = WeatherClient()
        weather = client.fetch_sync(loc)
        return ToolOutcome(
            status="ok",
            action="weather",
            message=f"Weather for {weather.location}: {weather.temperature}, {weather.condition}.",
            card=weather.to_card(),
            spoken_response=weather.spoken,
        )


def _builtin_tools() -> tuple[Tool, ...]:
    """Return one fresh instance of each built-in tool, in registry order."""
    return (
        OpenAppTool(),
        WebSearchTool(),
        TypeTextTool(),
        CurrentTimeTool(),
        CurrentDateTool(),
        SearchFilesTool(),
        CreateFolderTool(),
        CreateFileTool(),
        DeleteFileTool(),
        GetWeatherTool(),
    )


def builtin_tool_names() -> frozenset[str]:
    """Names of the always-registered built-in tools, for retrieval."""
    return frozenset(tool.spec.name for tool in _builtin_tools())


def build_default_registry(file_ops: "FileOps | None" = None) -> ToolRegistry:
    """Return a registry containing Kestrel's built-in tools."""
    registry = ToolRegistry()
    for tool in _builtin_tools():
        registry.register(tool)
    return registry
