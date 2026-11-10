"""Local embedding-based tool retrieval for Kestrel's planner.

The planner sends every tool to the model in one request, which makes large
MCP tool sets expensive and slow. This module narrows the *non-built-in* tools
to the few most relevant to a transcript, using a small local embedding model
(``BAAI/bge-small-en-v1.5`` via ``fastembed``) and a deterministic keyword
fallback when the model is unavailable.

The built-in tools are always included, so core behaviour never depends on
retrieval. Retrieval is best-effort: it never raises into planning.
"""

from __future__ import annotations

import logging
import math
import os
import re
from collections.abc import Collection
from typing import Protocol

from app.tools import ToolSpec, builtin_tool_names

logger = logging.getLogger("kestrel.retrieval")

DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_TOP_K = 10

# Values that turn retrieval off. Retrieval is enabled by default.
_FALSY = frozenset({"0", "false", "off", "no"})

# Small, conservative stopword set. Tokens are lowercased and split on any
# non-alphanumeric run, so snake_case names fall apart into useful words.
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "my",
        "me",
        "i",
        "you",
        "it",
        "this",
        "that",
        "to",
        "for",
        "of",
        "in",
        "on",
        "at",
        "and",
        "or",
        "is",
        "are",
        "was",
        "be",
        "with",
        "please",
        "can",
        "do",
        "does",
        "from",
        "into",
        "by",
        "as",
        "using",
    }
)

_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")

Fingerprint = tuple[str, str, str]


class EmbedderUnavailable(RuntimeError):
    """Raised when the local embedding model cannot be loaded or used."""


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text."""
        ...


class FastEmbedEmbedder:
    """``Embedder`` backed by ``fastembed`` (ONNX, CPU, offline).

    Construction is deliberately cheap: neither ``fastembed`` nor the model is
    imported here. Both happen lazily on the first :meth:`embed` call, so
    importing the app never downloads or loads a model.
    """

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL) -> None:
        self.model_name = model_name
        self._model = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load_model()
        try:
            vectors = list(model.embed(list(texts)))
        except Exception as exc:  # noqa: BLE001 - surfaced as EmbedderUnavailable
            raise EmbedderUnavailable(
                f"embedding failed ({type(exc).__name__})"
            ) from exc
        return [[float(value) for value in vector] for vector in vectors]

    def _load_model(self):
        if self._model is not None:
            return self._model
        try:
            from fastembed import TextEmbedding
        except Exception as exc:  # noqa: BLE001 - reported as unavailable
            raise EmbedderUnavailable(
                f"fastembed is not installed: {type(exc).__name__}"
            ) from exc
        try:
            self._model = TextEmbedding(model_name=self.model_name)
        except Exception as exc:  # noqa: BLE001 - reported as unavailable
            raise EmbedderUnavailable(
                f"could not load embedding model {self.model_name!r} "
                f"({type(exc).__name__})"
            ) from exc
        return self._model


class ToolSelector:
    """Narrow a tool list to the most relevant tools for a transcript.

    ``always_include`` names (the built-ins) are always returned. ``top_k``
    limits only the remaining tools. When the embedder is missing, the
    transcript is blank, or the embedder fails, a deterministic keyword
    matcher is used instead.
    """

    def __init__(
        self,
        *,
        embedder: Embedder | None = None,
        top_k: int = DEFAULT_TOP_K,
        always_include: Collection[str] = (),
    ) -> None:
        self._embedder = embedder
        self.top_k = top_k
        self._always_include = frozenset(always_include)
        self._tool_cache: dict[Fingerprint, list[float]] = {}

    def select(self, transcript: str, specs: list[ToolSpec]) -> list[ToolSpec]:
        """Return the tool specs to send to the model, in original order."""
        if not specs:
            return []

        candidates = [
            spec for spec in specs if spec.name not in self._always_include
        ]
        pinned = [
            spec for spec in specs if spec.name in self._always_include
        ]

        chosen: list[ToolSpec] = []
        if self.top_k > 0 and candidates:
            ranked = self._rank(transcript, candidates)
            chosen = ranked[: self.top_k]

        selected_names = {spec.name for spec in pinned}
        selected_names.update(spec.name for spec in chosen)
        return [spec for spec in specs if spec.name in selected_names]

    def _rank(
        self, transcript: str, candidates: list[ToolSpec]
    ) -> list[ToolSpec]:
        if self._embedder is None or not transcript.strip():
            return _keyword_rank(transcript, candidates)
        try:
            return self._vector_rank(transcript, candidates)
        except Exception as exc:  # noqa: BLE001 - never break planning
            logger.warning(
                "Tool retrieval embedding failed (%s: %s); using keyword "
                "matching instead.",
                type(exc).__name__,
                exc,
            )
            self._embedder = None
            return _keyword_rank(transcript, candidates)

    def _vector_rank(
        self, transcript: str, candidates: list[ToolSpec]
    ) -> list[ToolSpec]:
        assert self._embedder is not None
        vectors = self._tool_vectors(candidates)
        query_vectors = self._embedder.embed([transcript])
        if not query_vectors:
            raise EmbedderUnavailable("embedder returned no transcript vector")
        query = query_vectors[0]

        scored = sorted(
            range(len(candidates)),
            key=lambda index: (-_cosine(query, vectors[index]), index),
        )
        return [candidates[index] for index in scored]

    def _tool_vectors(self, specs: list[ToolSpec]) -> list[list[float]]:
        assert self._embedder is not None
        missing: list[tuple[Fingerprint, str]] = []
        seen: set[Fingerprint] = set()
        for spec in specs:
            fingerprint = _fingerprint(spec)
            if fingerprint in self._tool_cache or fingerprint in seen:
                continue
            seen.add(fingerprint)
            missing.append((fingerprint, _tool_text(spec)))

        if missing:
            embedded = self._embedder.embed([text for _, text in missing])
            if len(embedded) != len(missing):
                raise EmbedderUnavailable(
                    "embedder returned the wrong number of tool vectors"
                )
            for (fingerprint, _), vector in zip(missing, embedded):
                self._tool_cache[fingerprint] = vector

        return [self._tool_cache[_fingerprint(spec)] for spec in specs]


def _fingerprint(spec: ToolSpec) -> Fingerprint:
    return (spec.name, spec.description, spec.action_label or "")


def _tool_text(spec: ToolSpec) -> str:
    parts = [spec.name, spec.description]
    if spec.action_label:
        parts.append(spec.action_label)
    return " ".join(part for part in parts if part)


def _tokenize(text: str) -> set[str]:
    tokens: set[str] = set()
    for raw in _TOKEN_SPLIT.split(text.lower()):
        if raw and raw not in _STOPWORDS:
            tokens.add(raw)
    return tokens


def _spec_tokens(spec: ToolSpec) -> set[str]:
    tokens = _tokenize(spec.name)
    tokens |= _tokenize(spec.description)
    if spec.action_label:
        tokens |= _tokenize(spec.action_label)
    return tokens


def _keyword_rank(transcript: str, candidates: list[ToolSpec]) -> list[ToolSpec]:
    query = _tokenize(transcript)
    scored = sorted(
        range(len(candidates)),
        key=lambda index: (
            -len(query & _spec_tokens(candidates[index])),
            index,
        ),
    )
    return [candidates[index] for index in scored]


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


def selector_from_env() -> ToolSelector | None:
    """Build a selector from the environment, or ``None`` when disabled.

    Construction never imports ``fastembed`` or loads a model; that happens on
    the first :meth:`ToolSelector.select` call.
    """
    raw = os.getenv("KESTREL_TOOL_RETRIEVAL")
    if raw is not None and raw.strip().lower() in _FALSY:
        return None

    top_k = DEFAULT_TOP_K
    raw_top_k = os.getenv("KESTREL_TOOL_TOP_K", "").strip()
    if raw_top_k:
        try:
            top_k = int(raw_top_k)
        except ValueError:
            top_k = DEFAULT_TOP_K

    model = os.getenv("KESTREL_EMBEDDING_MODEL", "").strip()
    return ToolSelector(
        embedder=FastEmbedEmbedder(model or DEFAULT_EMBEDDING_MODEL),
        top_k=top_k,
        always_include=builtin_tool_names(),
    )
