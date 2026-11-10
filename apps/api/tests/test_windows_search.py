from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.windows_search import (
    DEFAULT_LIMIT,
    EXCLUDED_PATH_FRAGMENTS,
    SearchRow,
    WindowsSearchProvider,
    WindowsSearchUnavailable,
    build_search_sql,
    sanitize_query,
)


@pytest.fixture(autouse=True)
def temp_files_are_not_under_appdata(monkeypatch):
    """pytest's tmp_path lives under AppData, which production excludes.

    Keep the AppData check in one focused test and use the rest of the real
    exclusion list for path-filtering tests.
    """
    monkeypatch.setattr(
        "app.windows_search.EXCLUDED_PATH_FRAGMENTS",
        tuple(
            fragment
            for fragment in EXCLUDED_PATH_FRAGMENTS
            if fragment != "\\appdata\\"
        ),
    )


class RecordingTransport:
    """Fake search transport; tests never touch the real Windows index."""

    def __init__(self, rows: list[SearchRow] | None = None, error=None) -> None:
        self.rows = rows or []
        self.error = error
        self.calls: list[tuple[str, int]] = []

    def fetch(self, sql: str, timeout: int) -> list[SearchRow]:
        self.calls.append((sql, timeout))
        if self.error is not None:
            raise self.error
        return list(self.rows)


def row_for(path: Path, *, name: str | None = None) -> SearchRow:
    return SearchRow(
        name=name or path.name,
        path=str(path),
        size=path.stat().st_size if path.is_file() else None,
        modified=datetime(2026, 11, 7, 9, 41, 12, tzinfo=timezone.utc),
    )


def test_search_returns_only_existing_regular_files(tmp_path):
    first = tmp_path / "budget.xlsx"
    first.write_text("data")
    second = tmp_path / "notes.txt"
    second.write_text("hello")
    folder = tmp_path / "a-folder"
    folder.mkdir()
    missing = tmp_path / "gone.txt"

    transport = RecordingTransport(
        [
            row_for(first),
            row_for(second),
            SearchRow(name=folder.name, path=str(folder), size=None, modified=None),
            SearchRow(name="gone.txt", path=str(missing), size=1, modified=None),
        ]
    )

    results = WindowsSearchProvider(transport).search("budget")

    assert [item["path"] for item in results] == [str(first), str(second)]


def test_search_filters_system_app_and_node_modules_paths(tmp_path):
    keep = tmp_path / "Documents" / "keep.txt"
    keep.parent.mkdir()
    keep.write_text("keep")

    excluded: list[Path] = []
    for relative in (
        "Windows/note.txt",
        "Program Files/app.txt",
        "Program Files (x86)/app.txt",
        "ProgramData/data.txt",
        "node_modules/pkg/readme.txt",
        "$Recycle.Bin/deleted.txt",
        "System Volume Information/info.txt",
    ):
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("clutter")
        excluded.append(path)

    transport = RecordingTransport([row_for(path) for path in [keep, *excluded]])

    results = WindowsSearchProvider(transport).search("anything")

    assert [item["path"] for item in results] == [str(keep)]


def test_search_excludes_appdata_paths(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.windows_search.EXCLUDED_PATH_FRAGMENTS",
        EXCLUDED_PATH_FRAGMENTS,
    )
    target = tmp_path / "AppData" / "Local" / "data.txt"
    target.parent.mkdir(parents=True)
    target.write_text("clutter")
    transport = RecordingTransport([row_for(target)])

    results = WindowsSearchProvider(transport).search("anything")

    assert results == []


def test_search_matches_folder_names_in_generated_query(tmp_path):
    target = tmp_path / "2025 Tax Returns" / "scan-001.pdf"
    target.parent.mkdir()
    target.write_text("pdf")

    sql = build_search_sql(sanitize_query("tax returns"), 50)

    assert 'CONTAINS("System.FileName", \'"tax*"\')' in sql
    assert 'CONTAINS("System.ItemPathDisplay", \'"tax*"\')' in sql
    assert 'CONTAINS("System.FileName", \'"returns*"\')' in sql
    assert 'CONTAINS("System.ItemPathDisplay", \'"returns*"\')' in sql

    # The fake transport returns what the real index would return for the path
    # match: a file whose file name does not contain either query token.
    transport = RecordingTransport([row_for(target)])
    results = WindowsSearchProvider(transport).search("tax returns")

    assert [item["name"] for item in results] == ["scan-001.pdf"]


def test_every_query_token_is_required(tmp_path):
    target = tmp_path / "budget_2026.xlsx"
    target.write_text("x")

    sql = build_search_sql(sanitize_query("budget xlsx"), 50)

    assert " AND " in sql
    for token in ("budget", "xlsx"):
        assert sql.count(f'CONTAINS("System.FileName", \'"{token}*"\')') == 1
        assert (
            sql.count(f'CONTAINS("System.ItemPathDisplay", \'"{token}*"\')') == 1
        )

    transport = RecordingTransport([row_for(target)])
    results = WindowsSearchProvider(transport).search("budget xlsx")

    assert [item["name"] for item in results] == ["budget_2026.xlsx"]


def test_blank_query_returns_empty_without_calling_the_index():
    transport = RecordingTransport([SearchRow("x", r"C:\x.txt", 1, None)])

    assert WindowsSearchProvider(transport).search("") == []
    assert WindowsSearchProvider(transport).search("   ") == []
    assert WindowsSearchProvider(transport).search("?!...") == []
    assert transport.calls == []


def test_no_results_returns_empty_list(tmp_path):
    transport = RecordingTransport([])

    assert WindowsSearchProvider(transport).search("nothing") == []


def test_result_shape_and_modified_is_iso_text(tmp_path):
    target = tmp_path / "note.txt"
    target.write_text("hello")
    transport = RecordingTransport([row_for(target)])

    results = WindowsSearchProvider(transport).search("note")

    assert len(results) == 1
    item = results[0]
    assert set(item) == {"name", "path", "sizeBytes", "modified"}
    assert item["name"] == "note.txt"
    assert item["path"] == str(target)
    assert Path(item["path"]).is_file()
    assert item["sizeBytes"] == 5
    assert isinstance(item["sizeBytes"], int)
    parsed = datetime.fromisoformat(item["modified"])
    assert parsed.year == 2026


def test_results_are_deduped_by_case_insensitive_absolute_path(tmp_path):
    target = tmp_path / "Report.txt"
    target.write_text("x")
    transport = RecordingTransport(
        [row_for(target), row_for(target, name=target.name.upper())]
    )

    results = WindowsSearchProvider(transport).search("report")

    assert len(results) == 1


def test_limit_is_respected_and_query_overfetches(tmp_path):
    files = []
    for index in range(3):
        path = tmp_path / f"report_{index}.txt"
        path.write_text("x")
        files.append(path)
    transport = RecordingTransport([row_for(path) for path in files])

    results = WindowsSearchProvider(transport).search("report", limit=2)

    assert len(results) == 2
    assert len(transport.calls) == 1
    sql, timeout = transport.calls[0]
    top = int(sql.split("TOP", 1)[1].split()[0])
    assert top > 2
    assert timeout == 5


def test_default_limit_is_twenty(tmp_path):
    files = []
    for index in range(25):
        path = tmp_path / f"report_{index}.txt"
        path.write_text("x")
        files.append(path)
    transport = RecordingTransport([row_for(path) for path in files])

    results = WindowsSearchProvider(transport).search("report")

    assert len(results) == DEFAULT_LIMIT


def test_sanitize_query_removes_search_syntax():
    tokens = sanitize_query('budget"); DROP TABLE "files" -- (x) OR *')

    assert tokens
    assert all(
        not any(char in token for char in "\"';()*\\")
        for token in tokens
    )
    assert "budget" in tokens


def test_transport_failure_raises_windows_search_unavailable():
    transport = RecordingTransport(error=RuntimeError("COM exploded"))

    with pytest.raises(WindowsSearchUnavailable):
        WindowsSearchProvider(transport).search("budget")
