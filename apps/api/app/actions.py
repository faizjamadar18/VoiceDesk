"""Rule-based action planning for the Kestrel prototype.

No model, API key, or network call is needed to decide what to do. The
transcript is matched against a small, deterministic command set. Executing an
action happens on the same Windows machine that runs the API.
"""

from __future__ import annotations

import re
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from urllib.parse import quote_plus

from app.apps import (
    APP_ALIASES,
    AppLaunchError,
    AppNotInstalledError,
    WindowsAppCatalog,
    app_label,
)


@dataclass(frozen=True)
class ActionPlan:
    status: str
    action: str
    message: str
    target: str | None = None
    url: str | None = None
    text: str | None = None


class ActionExecutionError(RuntimeError):
    """Raised when an otherwise valid action cannot be performed."""


class ActionExecutor(Protocol):
    def open_app(self, app: str) -> None:
        """Open an installed local application."""

    def open_url(self, url: str) -> None:
        """Open a URL in the user's default browser."""


class WindowsActionExecutor:
    """Launches installed apps and URLs. Never used in tests by default."""

    def __init__(self, catalog: WindowsAppCatalog | None = None) -> None:
        self._catalog = catalog or WindowsAppCatalog()

    def open_app(self, app: str) -> None:
        try:
            self._catalog.launch(app)
        except (AppNotInstalledError, AppLaunchError) as exc:
            raise ActionExecutionError(str(exc)) from exc

    def open_url(self, url: str) -> None:
        webbrowser.open(url, new=2)


def plan_action(transcript: str, *, now: datetime | None = None) -> ActionPlan:
    """Turn one spoken command into an action plan without side effects."""
    cleaned = re.sub(r"\([^)]*\)|\[[^\]]*\]|\*[^*]*\*", " ", transcript)
    original = " ".join(cleaned.split())
    normalized = original.strip().rstrip(".,!?;:")
    if not normalized:
        return ActionPlan(
            status="unhandled",
            action="none",
            message="I didn't hear a command.",
        )

    lowered = normalized.lower()

    time_plan = _match_time(lowered, now or datetime.now())
    if time_plan is not None:
        return time_plan

    date_plan = _match_date(lowered, now or datetime.now())
    if date_plan is not None:
        return date_plan

    open_app = _match_open_app(lowered)
    if open_app is not None:
        return open_app

    search = _match_search(normalized)
    if search is not None:
        return search

    typing = _match_typing(original)
    if typing is not None:
        return typing

    if lowered.startswith(("open ", "launch ", "start ")):
        return ActionPlan(
            status="unhandled",
            action="none",
            message="I don't know how to open that app yet.",
        )

    return ActionPlan(
        status="unhandled",
        action="none",
        message=(
            "I didn't catch a command. Try “open Notepad”, “search the web for "
            "Kestrel”, or “type hello”."
        ),
    )


def _match_time(text: str, now: datetime) -> ActionPlan | None:
    if text in {"time", "what time is it", "what's the time", "what is the time"}:
        return ActionPlan(
            status="ok",
            action="answer",
            message=f"It's {now.strftime('%H:%M')}.",
        )
    return None


def _match_date(text: str, now: datetime) -> ActionPlan | None:
    if text in {
        "date",
        "what's the date",
        "what is the date",
        "what's today's date",
        "what is today's date",
        "what's the date today",
        "what is the date today",
    }:
        return ActionPlan(
            status="ok",
            action="answer",
            message=f"Today is {now.strftime('%Y-%m-%d')}.",
        )
    return None


_OPEN_APP_PATTERN = re.compile(
    r"^(?:open|launch|start)\s+"
    r"(?:(?:the|my|a|an)\s+)?"
    r"(?:app(?:lication)?\s+(?:called|named)\s+)?"
    r"(?P<target>.+)$",
    re.IGNORECASE,
)


def _match_open_app(text: str) -> ActionPlan | None:
    match = _OPEN_APP_PATTERN.match(text)
    if match is None:
        return None
    target = match.group("target").strip()
    target = re.sub(r"\s+(?:app|application)$", "", target).strip()
    if not target or target in {"it", "that", "this"}:
        return None
    canonical = APP_ALIASES.get(target.casefold(), target.casefold())
    return ActionPlan(
        status="ok",
        action="open_app",
        message=f"Opening {app_label(canonical)}.",
        target=canonical,
    )


def _match_search(original: str) -> ActionPlan | None:
    lowered = original.lower()
    prefixes = (
        "search the web for ",
        "search the web ",
        "search for ",
        "search ",
        "google ",
        "look up ",
    )
    for prefix in prefixes:
        if lowered.startswith(prefix):
            query = original[len(prefix) :].strip()
            if not query:
                return None
            return ActionPlan(
                status="ok",
                action="browser",
                message=f"Searching the web for {query}.",
                url=f"https://www.google.com/search?q={quote_plus(query)}",
            )
    return None


def _match_typing(original: str) -> ActionPlan | None:
    lowered = original.lower()
    for prefix in ("type ", "write ", "insert "):
        if lowered.startswith(prefix):
            text = original[len(prefix) :].strip()
            if not text:
                return None
            return ActionPlan(
                status="ok",
                action="type",
                message="Typing that into the focused app.",
                text=text,
            )
    return None
