"""Turn a transcript into a directive the ``/act`` endpoint can execute.

A *directive* is either a plain answer (time/date), a tool call, or "I don't
understand". The rule planner preserves the original deterministic behaviour;
the Groq planner delegates the choice to a model, and the fallback planner
keeps the app working when the model is unavailable.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Callable, Protocol, Union
from urllib.parse import parse_qs, urlparse

from app.actions import plan_action
from app.tools import LlmReply, ToolCall, ToolRegistry, ToolSpec

if TYPE_CHECKING:
    from app.retrieval import ToolSelector

logger = logging.getLogger("kestrel.planner")


@dataclass(frozen=True)
class AnswerDirective:
    """A direct spoken answer that runs no tool."""

    message: str


@dataclass(frozen=True)
class ToolDirective:
    """A request to run one registered tool."""

    call: ToolCall


@dataclass(frozen=True)
class NoDirective:
    """No matching command; report this message as unhandled."""

    message: str


@dataclass(frozen=True)
class ScreenDirective:
    """Ask the desktop to capture the screen and send one vision request."""

    question: str


Directive = Union[
    AnswerDirective, ToolDirective, NoDirective, ScreenDirective
]


class Planner(Protocol):
    async def plan(self, transcript: str) -> Directive:
        """Choose what to do with a transcript."""
        ...


class RulePlanner:
    """Deterministic planner that wraps the original ``plan_action`` rules."""

    def __init__(self, clock: Callable[[], datetime] | None = None) -> None:
        self._clock = clock or datetime.now

    async def plan(self, transcript: str) -> Directive:
        create = _match_create(transcript)
        if create is not None:
            return create

        delete = _match_delete(transcript)
        if delete is not None:
            return delete

        file_query = _file_search_query(transcript)
        if file_query is not None:
            return ToolDirective(
                ToolCall("search_files", {"query": file_query})
            )

        weather_loc = _match_weather(transcript)
        if weather_loc is not None:
            return ToolDirective(ToolCall("get_weather", {"location": weather_loc}))

        plan = plan_action(transcript, now=self._clock())

        if plan.action == "open_app" and plan.target is not None:
            return ToolDirective(ToolCall("open_app", {"app": plan.target}))
        if plan.action == "browser" and plan.url is not None:
            return ToolDirective(
                ToolCall("web_search", {"query": _query_from_url(plan.url)})
            )
        if plan.action == "type" and plan.text is not None:
            return ToolDirective(ToolCall("type_text", {"text": plan.text}))
        if plan.action == "answer":
            return AnswerDirective(plan.message)
        return NoDirective(plan.message)


class LlmClient(Protocol):
    async def choose(self, transcript: str, specs: list[ToolSpec]) -> LlmReply:
        """Return the tool calls and text a model chose for the transcript."""
        ...


# Offered to the model but never registered as an executable tool. The desktop
# intercepts the resulting directive and captures the screen itself.
LOOK_AT_SCREEN_SPEC = ToolSpec(
    name="look_at_screen",
    description=(
        "Use for questions about what is visible on the user's screen, "
        "especially when they say 'this', 'that', or 'here', ask about an "
        "error, window, image, or text, or ask what is on the screen. "
        "Do not use for commands or general knowledge."
    ),
    parameters={
        "type": "object",
        "properties": {},
        "required": [],
    },
    risk="read",
    requires_confirmation=False,
)


class GroqPlanner:
    """Planner backed by a model; only registered tool names are accepted."""

    def __init__(
        self,
        registry: ToolRegistry,
        client: LlmClient,
        selector: "ToolSelector | None" = None,
    ) -> None:
        self._registry = registry
        self._client = client
        self._selector = selector

    async def plan(self, transcript: str) -> Directive:
        specs = self._registry.specs()
        if self._selector is not None:
            specs = self._selector.select(transcript, specs)
        specs = [*specs, LOOK_AT_SCREEN_SPEC]
        reply = await self._client.choose(transcript, specs)
        for call in reply.calls:
            if call.name == LOOK_AT_SCREEN_SPEC.name:
                return ScreenDirective(transcript)
            if self._registry.get(call.name) is not None:
                return ToolDirective(call)
        content = (reply.content or "").strip()
        if content:
            return AnswerDirective(content)
        return NoDirective(
            "I didn't catch a command I can run yet."
        )


class FallbackPlanner:
    """Try ``primary``; on any failure fall back to ``fallback``."""

    def __init__(self, primary: Planner, fallback: Planner) -> None:
        self._primary = primary
        self._fallback = fallback

    async def plan(self, transcript: str) -> Directive:
        try:
            return await self._primary.plan(transcript)
        except Exception as exc:
            logger.warning(
                "Primary planner failed (%s: %s); falling back to rules.",
                type(exc).__name__,
                exc,
            )
            return await self._fallback.plan(transcript)


_FILE_SEARCH_PATTERN = re.compile(
    r"^(?:find|search|show)\s+"
    r"(?:me\s+)?(?:for\s+)?(?:my\s+)?files?\s+"
    r"(?:named|called|for)\s+(?P<query>.+)$",
    re.IGNORECASE,
)

_CREATE_FOLDER_PATTERN = re.compile(
    r"^(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?folder\s+"
    r"(?:called\s+|named\s+)?(?P<name>.+?)"
    r"(?:\s+(?:on|in|inside|under)\s+(?P<location>.+))?$",
    re.IGNORECASE,
)

_CREATE_FILE_PATTERN = re.compile(
    r"^(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|empty\s+)?file\s+"
    r"(?:called\s+|named\s+)?(?P<name>.+?)"
    r"(?:\s+(?:on|in|inside|under)\s+(?P<location>.+))?$",
    re.IGNORECASE,
)

_DELETE_FILE_PATTERN = re.compile(
    r"^(?:delete|remove|trash)\s+(?:the\s+)?(?:file\s+)?(?P<query>.+)$",
    re.IGNORECASE,
)


def _match_weather(transcript: str) -> str | None:
    text = " ".join(transcript.split()).strip().rstrip(".,!?;:")
    m = re.search(
        r"(?:weather\s+(?:like\s+)?(?:in|for|of|at)\s+([a-zA-Z\s]+?))(?:\s+today|\s+now|\s+currently)?$",
        text,
        re.IGNORECASE,
    )
    if m:
        loc = m.group(1).strip()
        if loc:
            return loc
    if re.search(r"\bweather\b", text, re.IGNORECASE):
        return "Current Location"
    return None


def _match_create(transcript: str) -> ToolDirective | None:
    normalized = " ".join(transcript.split()).strip().rstrip(".,!?;:")
    if not normalized:
        return None

    for pattern, tool in (
        (_CREATE_FOLDER_PATTERN, "create_folder"),
        (_CREATE_FILE_PATTERN, "create_file"),
    ):
        match = pattern.match(normalized)
        if match is None:
            continue
        name = _clean_fragment(match.group("name"))
        if not name:
            continue
        arguments = {"name": name}
        location = match.group("location")
        if location:
            cleaned = _clean_fragment(location)
            if cleaned:
                arguments["location"] = cleaned
        return ToolDirective(ToolCall(tool, arguments))
    return None


def _match_delete(transcript: str) -> ToolDirective | None:
    normalized = " ".join(transcript.split()).strip().rstrip(".,!?;:")
    match = _DELETE_FILE_PATTERN.match(normalized)
    if match is None:
        return None
    query = _clean_fragment(match.group("query"))
    if not query:
        return None
    return ToolDirective(ToolCall("delete_file", {"query": query}))


def _clean_fragment(value: str) -> str:
    return value.strip().strip("\"'").rstrip(".,!?;:").strip()


def _file_search_query(transcript: str) -> str | None:
    """Extract a local file query from common spoken phrases.

    Deliberately narrow: "search the web for ..." still belongs to the web
    tool because it does not contain a "file/files" noun.
    """
    normalized = " ".join(transcript.split())
    match = _FILE_SEARCH_PATTERN.match(normalized)
    if match is None:
        return None
    query = match.group("query").strip().strip("\"'")
    query = query.rstrip(".,!?;:")
    return query or None


def _query_from_url(url: str) -> str:
    values = parse_qs(urlparse(url).query).get("q")
    return values[0] if values else ""
