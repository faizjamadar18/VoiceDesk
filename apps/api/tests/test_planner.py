from __future__ import annotations

import asyncio
from datetime import datetime

import pytest

from app.planner import (
    AnswerDirective,
    FallbackPlanner,
    GroqPlanner,
    NoDirective,
    RulePlanner,
    ScreenDirective,
    ToolDirective,
)
from app.tools import LlmReply, ToolCall, build_default_registry

FIXED_NOW = datetime(2026, 11, 7, 9, 41, 12)


def plan_with(planner, transcript: str):
    return asyncio.run(planner.plan(transcript))


class FakeLlmClient:
    def __init__(self, calls: list[ToolCall], content: str | None = None) -> None:
        self.calls = calls
        self.content = content
        self.seen: tuple[str, list] | None = None

    async def choose(self, transcript: str, specs: list):
        self.seen = (transcript, specs)
        return LlmReply(calls=self.calls, content=self.content)


class FakeSelector:
    def __init__(self, keep: set[str]) -> None:
        self.keep = keep

    def select(self, transcript: str, specs: list):
        return [spec for spec in specs if spec.name in self.keep]


class BoomPlanner:
    async def plan(self, transcript: str):
        raise RuntimeError("planner exploded")


def test_rule_planner_maps_open_app():
    planner = RulePlanner(clock=lambda: FIXED_NOW)

    directive = plan_with(planner, "open notepad")

    assert directive == ToolDirective(ToolCall("open_app", {"app": "notepad"}))


def test_rule_planner_maps_any_app_name():
    planner = RulePlanner(clock=lambda: FIXED_NOW)

    directive = plan_with(planner, "open notion")

    assert directive == ToolDirective(ToolCall("open_app", {"app": "notion"}))


def test_rule_planner_maps_browser_query():
    planner = RulePlanner()

    directive = plan_with(planner, "search the web for kestrel voice agent")

    assert isinstance(directive, ToolDirective)
    assert directive.call.name == "web_search"
    assert directive.call.arguments == {"query": "kestrel voice agent"}


@pytest.mark.parametrize(
    ("transcript", "query"),
    [
        ("find my files named 2025 tax returns", "2025 tax returns"),
        ("search my files for budget", "budget"),
        ("show me files called invoice", "invoice"),
        ("find files named report", "report"),
        ("search files for meeting notes", "meeting notes"),
    ],
)
def test_rule_planner_maps_file_search_phrases(transcript, query):
    planner = RulePlanner()

    directive = plan_with(planner, transcript)

    assert directive == ToolDirective(ToolCall("search_files", {"query": query}))


def test_rule_planner_keeps_web_search_for_web_phrases():
    planner = RulePlanner()

    directive = plan_with(planner, "search the web for tax returns")

    assert directive == ToolDirective(ToolCall("web_search", {"query": "tax returns"}))


def test_rule_planner_maps_typing():
    planner = RulePlanner()

    directive = plan_with(planner, "type Hello from Kestrel")

    assert directive == ToolDirective(ToolCall("type_text", {"text": "Hello from Kestrel"}))


def test_rule_planner_maps_time_to_answer():
    planner = RulePlanner(clock=lambda: FIXED_NOW)

    directive = plan_with(planner, "what time is it")

    assert directive == AnswerDirective("It's 09:41.")


def test_rule_planner_maps_date_to_answer():
    planner = RulePlanner(clock=lambda: FIXED_NOW)

    directive = plan_with(planner, "what's the date today")

    assert directive == AnswerDirective("Today is 2026-11-07.")


def test_rule_planner_maps_unknown_to_no_directive():
    planner = RulePlanner()

    directive = plan_with(planner, "make me a sandwich")

    assert isinstance(directive, NoDirective)
    assert directive.message


def test_rule_planner_maps_create_folder():
    directive = plan_with(RulePlanner(), "create a folder called Invoices")

    assert directive == ToolDirective(
        ToolCall("create_folder", {"name": "Invoices"})
    )


def test_rule_planner_maps_create_folder_with_a_location():
    directive = plan_with(
        RulePlanner(), "make a folder named Tax Returns in my Documents"
    )

    assert directive == ToolDirective(
        ToolCall(
            "create_folder",
            {"name": "Tax Returns", "location": "my Documents"},
        )
    )


def test_rule_planner_maps_create_file():
    directive = plan_with(
        RulePlanner(), "create a file called notes on my desktop"
    )

    assert directive == ToolDirective(
        ToolCall("create_file", {"name": "notes", "location": "my desktop"})
    )


def test_rule_planner_maps_delete_file():
    directive = plan_with(RulePlanner(), "delete the file report.pdf")

    assert directive == ToolDirective(
        ToolCall("delete_file", {"query": "report.pdf"})
    )


def test_groq_planner_returns_first_known_tool():
    registry = build_default_registry(None)
    client = FakeLlmClient([ToolCall("open_app", {"app": "calculator"})])

    directive = plan_with(GroqPlanner(registry, client), "open calc")

    assert directive == ToolDirective(ToolCall("open_app", {"app": "calculator"}))
    assert client.seen is not None
    assert client.seen[0] == "open calc"
    assert {spec.name for spec in client.seen[1]} == {
        spec.name for spec in registry.specs()
    } | {"look_at_screen"}
    assert registry.get("look_at_screen") is None


def test_groq_planner_applies_selector_to_registry_specs():
    registry = build_default_registry(None)
    client = FakeLlmClient([ToolCall("open_app", {"app": "calculator"})])
    selector = FakeSelector({"open_app", "web_search"})

    directive = plan_with(
        GroqPlanner(registry, client, selector=selector), "open calc"
    )

    assert directive == ToolDirective(ToolCall("open_app", {"app": "calculator"}))
    assert client.seen is not None
    assert [spec.name for spec in client.seen[1]] == [
        "open_app",
        "web_search",
        "look_at_screen",
    ]


def test_groq_planner_screen_tool_description_is_planner_only():
    registry = build_default_registry(None)
    client = FakeLlmClient([])

    plan_with(GroqPlanner(registry, client), "what is this?")

    screen_spec = next(
        spec for spec in client.seen[1] if spec.name == "look_at_screen"
    )
    assert "screen" in screen_spec.description.lower()
    assert "error" in screen_spec.description.lower()
    assert "general knowledge" in screen_spec.description.lower()
    assert screen_spec.parameters == {
        "type": "object",
        "properties": {},
        "required": [],
    }


def test_groq_planner_maps_look_at_screen_to_a_screen_directive():
    registry = build_default_registry(None)
    transcript = "what is this error?"
    client = FakeLlmClient([ToolCall("look_at_screen", {})])

    directive = plan_with(GroqPlanner(registry, client), transcript)

    assert directive == ScreenDirective(transcript)


def test_groq_planner_ignores_unknown_tool_names():
    registry = build_default_registry(None)
    client = FakeLlmClient(
        [
            ToolCall("delete_everything", {}),
            ToolCall("web_search", {"query": "kestrel"}),
        ]
    )

    directive = plan_with(GroqPlanner(registry, client), "search kestrel")

    assert directive == ToolDirective(ToolCall("web_search", {"query": "kestrel"}))


def test_groq_planner_with_only_unknown_tools_is_unhandled():
    registry = build_default_registry(None)
    client = FakeLlmClient([ToolCall("nope", {})])

    directive = plan_with(GroqPlanner(registry, client), "do a backflip")

    assert isinstance(directive, NoDirective)


def test_groq_planner_returns_model_text_as_answer():
    registry = build_default_registry(None)
    client = FakeLlmClient([], content="Which page do you mean?")

    directive = plan_with(GroqPlanner(registry, client), "open the page")

    assert directive == AnswerDirective("Which page do you mean?")


def test_groq_planner_unhandled_when_no_calls_and_no_content():
    registry = build_default_registry(None)
    client = FakeLlmClient([], content=None)

    directive = plan_with(GroqPlanner(registry, client), "do a backflip")

    assert isinstance(directive, NoDirective)


def test_fallback_planner_uses_fallback_when_primary_raises():
    planner = FallbackPlanner(BoomPlanner(), RulePlanner(clock=lambda: FIXED_NOW))

    directive = plan_with(planner, "open notepad")

    assert directive == ToolDirective(ToolCall("open_app", {"app": "notepad"}))


def test_fallback_planner_prefers_primary_when_it_works():
    planner = FallbackPlanner(
        RulePlanner(clock=lambda: FIXED_NOW),
        BoomPlanner(),
    )

    directive = plan_with(planner, "open notepad")

    assert directive == ToolDirective(ToolCall("open_app", {"app": "notepad"}))
