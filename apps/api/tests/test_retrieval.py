"""Tests for local embedding-based tool retrieval (``app.retrieval``).

The suite is hermetic: every test uses a deterministic fake embedder or no
embedder at all, so ``fastembed`` and the real model are never required. One
optional integration test runs only when ``fastembed`` is installed *and*
``KESTREL_TEST_EMBEDDINGS=1`` is set.
"""

from __future__ import annotations

import importlib.util
import os
import sys

import pytest

from app.retrieval import (
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_TOP_K,
    EmbedderUnavailable,
    FastEmbedEmbedder,
    ToolSelector,
    selector_from_env,
)
from app.tools import ToolSpec

BUILTINS = frozenset({"open_app", "web_search"})


def spec(name: str, description: str, action_label: str | None = None) -> ToolSpec:
    return ToolSpec(
        name=name,
        description=description,
        parameters={"type": "object", "properties": {}, "required": []},
        risk="read",
        requires_confirmation=False,
        action_label=action_label,
    )


def catalog() -> list[ToolSpec]:
    return [
        spec("open_app", "Open any installed Windows application"),
        spec("web_search", "Search the web using the default browser"),
        spec("gmail_send_message", "Send an email message to a recipient"),
        spec("repo_status", "Show the working tree status of a code repository"),
        spec("notion_create_page", "Create a page in a Notion workspace"),
    ]


def _tokens(text: str) -> list[str]:
    return [part for part in text.lower().replace("_", " ").split() if part]


class FakeEmbedder:
    """Bag-of-words hashed into fixed dimensions; deterministic and offline."""

    def __init__(self, dims: int = 64) -> None:
        self.dims = dims
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * self.dims
            for token in _tokens(text):
                stable = sum(ord(char) for char in token)
                vector[stable % self.dims] += 1.0
            vectors.append(vector)
        return vectors


class BoomEmbedder:
    def __init__(self) -> None:
        self.calls = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        raise EmbedderUnavailable("boom")


def names(selected: list[ToolSpec]) -> list[str]:
    return [item.name for item in selected]


def test_selects_relevant_mcp_tool_by_embedding():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=1, always_include=BUILTINS
    )

    chosen = selector.select("send an email to bob", catalog())
    picked = names(chosen)

    assert "gmail_send_message" in picked
    assert "open_app" in picked
    assert "web_search" in picked
    assert "repo_status" not in picked
    assert "notion_create_page" not in picked


def test_always_include_specs_survive_unrelated_transcript():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=1, always_include=BUILTINS
    )

    picked = names(selector.select("make me a sandwich", catalog()))

    assert "open_app" in picked
    assert "web_search" in picked


def test_top_k_limits_only_non_core_tools():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=2, always_include=BUILTINS
    )

    chosen = selector.select("send an email about repo status in notion", catalog())
    picked = names(chosen)

    assert all(name in BUILTINS for name in picked if name in BUILTINS)
    assert len([name for name in picked if name not in BUILTINS]) == 2
    assert "open_app" in picked and "web_search" in picked


def test_non_positive_top_k_returns_only_always_include():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=0, always_include=BUILTINS
    )

    picked = names(selector.select("send an email", catalog()))

    assert set(picked) == set(BUILTINS)


def test_output_keeps_original_order_and_does_not_mutate_input():
    specs = catalog()
    snapshot = list(specs)
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=2, always_include=BUILTINS
    )

    chosen = selector.select("send an email about repo", specs)

    assert specs == snapshot
    assert chosen is not specs
    positions = [specs.index(item) for item in chosen]
    assert positions == sorted(positions)


def test_blank_transcript_returns_always_include_plus_first_specs():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=2, always_include=BUILTINS
    )

    picked = names(selector.select("   ", catalog()))

    assert set(BUILTINS).issubset(picked)
    assert len([name for name in picked if name not in BUILTINS]) == 2
    # Deterministic: the first two non-core tools in registry order.
    assert picked[-2:] == ["gmail_send_message", "repo_status"]


@pytest.mark.parametrize(
    ("transcript", "expected"),
    [
        ("send an email to alice", "gmail_send_message"),
        ("repo status", "repo_status"),
        ("make a notion page", "notion_create_page"),
    ],
)
def test_keyword_fallback_ranks_obvious_commands(transcript, expected):
    selector = ToolSelector(embedder=None, top_k=1, always_include=())

    chosen = selector.select(transcript, catalog())

    assert names(chosen)[0] == expected


def test_embedder_failure_falls_back_to_keyword_and_disables_embedder():
    boom = BoomEmbedder()
    selector = ToolSelector(embedder=boom, top_k=1, always_include=BUILTINS)

    first = names(selector.select("send an email to alice", catalog()))
    second = names(selector.select("repo status", catalog()))

    assert "gmail_send_message" in first
    assert "repo_status" in second
    assert boom.calls == 1


def test_empty_specs_return_empty_list():
    selector = ToolSelector(
        embedder=FakeEmbedder(), top_k=3, always_include=BUILTINS
    )

    assert selector.select("anything", []) == []


def test_tool_embeddings_are_cached_across_calls():
    embedder = FakeEmbedder()
    specs = catalog()
    selector = ToolSelector(embedder=embedder, top_k=2, always_include=BUILTINS)

    selector.select("send an email", specs)
    selector.select("repo status", specs)

    non_core = [item for item in specs if item.name not in BUILTINS]
    assert len(embedder.calls) == 3
    assert len(embedder.calls[0]) == len(non_core)
    assert embedder.calls[1] == ["send an email"]
    assert embedder.calls[2] == ["repo status"]


def test_selector_from_env_disabled_returns_none(monkeypatch):
    monkeypatch.setenv("KESTREL_TOOL_RETRIEVAL", "0")

    assert selector_from_env() is None


def test_selector_from_env_enabled_builds_cheap_selector(monkeypatch):
    monkeypatch.setenv("KESTREL_TOOL_RETRIEVAL", "1")
    monkeypatch.setenv("KESTREL_TOOL_TOP_K", "3")
    monkeypatch.delenv("KESTREL_EMBEDDING_MODEL", raising=False)
    sys.modules.pop("fastembed", None)

    selector = selector_from_env()

    assert isinstance(selector, ToolSelector)
    assert selector.top_k == 3
    assert "fastembed" not in sys.modules


def test_selector_from_env_ignores_invalid_top_k(monkeypatch):
    monkeypatch.setenv("KESTREL_TOOL_RETRIEVAL", "1")
    monkeypatch.setenv("KESTREL_TOOL_TOP_K", "not-a-number")

    selector = selector_from_env()

    assert selector is not None
    assert selector.top_k == DEFAULT_TOP_K


def test_defaults_match_option_a_plan():
    assert DEFAULT_EMBEDDING_MODEL == "BAAI/bge-small-en-v1.5"
    assert DEFAULT_TOP_K == 10


_HAS_FASTEMBED = importlib.util.find_spec("fastembed") is not None


@pytest.mark.skipif(
    not _HAS_FASTEMBED or os.getenv("KESTREL_TEST_EMBEDDINGS") != "1",
    reason="set KESTREL_TEST_EMBEDDINGS=1 and install fastembed to run",
)
def test_real_embedding_model_ranks_relevant_tool_first():
    embedder = FastEmbedEmbedder()
    selector = ToolSelector(embedder=embedder, top_k=1, always_include=BUILTINS)

    picked = names(selector.select("send an email to my manager", catalog()))

    assert "gmail_send_message" in picked
