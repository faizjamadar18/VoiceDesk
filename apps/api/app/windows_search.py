"""Windows Search adapter for local file lookups.

Queries the Windows Search ``SYSTEMINDEX`` through ADODB (the same
``Search.CollatorDSO`` provider File Explorer uses). The Windows index is the
production search source; :class:`app.files.FileOps` remains a bounded
direct-scan fallback for tests and explicit file roots.

Only file name and path metadata are read. No file contents leave the machine.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Protocol, Sequence

DEFAULT_LIMIT = 20
MAX_LIMIT = 100
COMMAND_TIMEOUT_SECONDS = 5
OVERFETCH_FACTOR = 10
MIN_OVERFETCH = 50
MAX_OVERFETCH = 250

CONNECTION_STRING = (
    "Provider=Search.CollatorDSO;Extended Properties='Application=Windows';"
)

# Paths that are system-owned or heavy app clutter. Matching is
# case-insensitive and requires the surrounding backslashes, so a user folder
# called "Windows Notes" is not excluded.
EXCLUDED_PATH_FRAGMENTS = (
    "\\windows\\",
    "\\program files\\",
    "\\program files (x86)\\",
    "\\programdata\\",
    "\\appdata\\",
    "\\node_modules\\",
    "\\$recycle.bin\\",
    "\\system volume information\\",
)

# Voice text is untrusted: keep only token characters. The query builder adds
# its own quotes/wildcards after sanitising.
_DISALLOWED_TOKEN_CHARS = re.compile(r"[^\w.-]+", re.UNICODE)
_MAX_TOKEN_LENGTH = 64


class WindowsSearchUnavailable(RuntimeError):
    """Windows Search could not be queried on this machine."""


@dataclass(frozen=True)
class SearchRow:
    """One raw row returned by the search transport."""

    name: object | None
    path: object | None
    size: object | None
    modified: object | None


class SearchTransport(Protocol):
    """Executes one Windows Search SQL statement and returns raw rows."""

    def fetch(self, sql: str, timeout: int) -> Sequence[SearchRow]:
        ...


class FileSearch(Protocol):
    """Local file search provider used by the ``search_files`` tool."""

    def search(
        self, query: str, limit: int = DEFAULT_LIMIT
    ) -> list[dict]:
        ...


def sanitize_query(query: str) -> list[str]:
    """Split a spoken query into safe tokens for the Windows Search dialect.

    Punctuation with query-language meaning (quotes, parentheses, wildcards,
    semicolons, backslashes) is removed before the builder wraps each token in
    a quoted wildcard phrase.
    """
    tokens: list[str] = []
    for raw in query.split():
        cleaned = _DISALLOWED_TOKEN_CHARS.sub("", raw).strip(".-")
        if cleaned:
            tokens.append(cleaned[:_MAX_TOKEN_LENGTH])
    return tokens


def build_search_sql(tokens: Sequence[str], fetch_limit: int) -> str:
    """Build a bounded Windows Search query with AND semantics per token."""
    conditions: list[str] = []
    for token in tokens:
        pattern = _sql_literal(f'"{token}*"')
        conditions.append(
            f'(CONTAINS("System.FileName", {pattern}) OR '
            f'CONTAINS("System.ItemPathDisplay", {pattern}))'
        )

    # Avoid letting node_modules swamp the over-fetch window. The remaining
    # exclusions are enforced in Python against the fully-qualified path.
    conditions.append(
        'NOT CONTAINS("System.ItemPathDisplay", \'"node_modules"\')'
    )
    where = " AND ".join(conditions)
    return (
        f'SELECT TOP {int(fetch_limit)} "System.ItemNameDisplay", '
        '"System.ItemPathDisplay", "System.Size", "System.DateModified" '
        f'FROM "SYSTEMINDEX" WHERE {where} '
        'ORDER BY "System.DateModified" DESC'
    )


class AdodbSearchTransport:
    """Open a fresh ADODB connection per call, with COM balanced per thread."""

    def fetch(self, sql: str, timeout: int) -> list[SearchRow]:
        try:
            import pythoncom
            import win32com.client
        except Exception as exc:  # pragma: no cover - depends on pywin32 install
            raise WindowsSearchUnavailable(
                "Windows Search is not available because pywin32 is missing."
            ) from exc

        try:
            pythoncom.CoInitialize()
        except Exception as exc:
            raise WindowsSearchUnavailable(
                "Windows Search is not available on this PC."
            ) from exc

        connection = None
        recordset = None
        try:
            connection = win32com.client.Dispatch("ADODB.Connection")
            connection.ConnectionTimeout = timeout
            connection.CommandTimeout = timeout
            connection.Open(CONNECTION_STRING)

            result = connection.Execute(sql)
            recordset = result[0] if isinstance(result, tuple) else result

            rows: list[SearchRow] = []
            while not recordset.EOF:
                rows.append(
                    SearchRow(
                        name=_field(recordset, 0),
                        path=_field(recordset, 1),
                        size=_field(recordset, 2),
                        modified=_field(recordset, 3),
                    )
                )
                recordset.MoveNext()
            return rows
        except Exception as exc:
            raise WindowsSearchUnavailable(
                "Windows Search is not available on this PC."
            ) from exc
        finally:
            if recordset is not None:
                try:
                    recordset.Close()
                except Exception:
                    pass
            if connection is not None:
                try:
                    connection.Close()
                except Exception:
                    pass
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass


class WindowsSearchProvider:
    """Search Windows' index and reduce rows to Kestrel's result shape.

    ``transport`` is injectable so unit tests never depend on the real index.
    """

    def __init__(
        self,
        transport: SearchTransport | None = None,
        command_timeout: int = COMMAND_TIMEOUT_SECONDS,
    ) -> None:
        self._transport = transport or AdodbSearchTransport()
        self._command_timeout = command_timeout

    def search(
        self, query: str, limit: int = DEFAULT_LIMIT
    ) -> list[dict]:
        tokens = sanitize_query(query)
        if not tokens:
            return []

        try:
            effective_limit = int(limit)
        except (TypeError, ValueError):
            effective_limit = DEFAULT_LIMIT
        if effective_limit <= 0:
            return []
        effective_limit = min(effective_limit, MAX_LIMIT)

        sql = build_search_sql(tokens, _fetch_limit(effective_limit))
        try:
            rows = self._transport.fetch(sql, self._command_timeout)
        except WindowsSearchUnavailable:
            raise
        except Exception as exc:
            raise WindowsSearchUnavailable(
                "Windows Search is not available on this PC."
            ) from exc

        results: list[dict] = []
        seen: set[str] = set()
        for row in rows:
            path_text = str(row.path or "").strip()
            if not path_text or _is_excluded(path_text):
                continue

            try:
                path = Path(path_text)
                if not path.is_file():
                    continue
                key = os.path.normcase(str(path.resolve()))
            except (OSError, ValueError, RuntimeError):
                continue
            if key in seen:
                continue
            seen.add(key)

            results.append(
                {
                    "name": _display_name(row.name, path),
                    "path": str(path),
                    "sizeBytes": _size_bytes(row.size, path),
                    "modified": _modified_text(row.modified, path),
                }
            )
            if len(results) >= effective_limit:
                break
        return results


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _fetch_limit(limit: int) -> int:
    return min(max(limit * OVERFETCH_FACTOR, MIN_OVERFETCH), MAX_OVERFETCH)


def _field(recordset: object, index: int) -> object | None:
    try:
        return recordset.Fields.Item(index).Value  # type: ignore[attr-defined]
    except Exception:
        return None


def _is_excluded(path_text: str) -> bool:
    normalized = path_text.replace("/", "\\").casefold()
    return any(fragment in normalized for fragment in EXCLUDED_PATH_FRAGMENTS)


def _display_name(name: object | None, path: Path) -> str:
    text = str(name).strip() if name is not None else ""
    return text or path.name


def _size_bytes(size: object | None, path: Path) -> int | None:
    if size is not None:
        try:
            return int(size)
        except (TypeError, ValueError, OverflowError):
            pass
    try:
        return path.stat().st_size
    except OSError:
        return None


def _modified_text(value: object | None, path: Path) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value is not None:
        text = str(value).strip()
        if text:
            try:
                return datetime.fromisoformat(
                    text.replace("Z", "+00:00")
                ).isoformat()
            except ValueError:
                pass
    try:
        return datetime.fromtimestamp(
            path.stat().st_mtime, tz=timezone.utc
        ).isoformat()
    except OSError:
        return None
