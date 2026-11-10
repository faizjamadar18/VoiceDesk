from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.files import (
    FileOps,
    LocationNotFound,
    TargetExists,
    UnsafeLocation,
)


def make_ops(
    tmp_path: Path,
    trash=None,
) -> tuple[FileOps, dict[str, Path], list[Path]]:
    """Build FileOps whose shell folders live under ``tmp_path``.

    The trash recorder mimics the Recycle Bin by removing the path, so tests
    never touch the real one.
    """
    home = tmp_path / "home"
    home.mkdir()
    known = {
        "desktop": home / "Desktop",
        "documents": home / "Documents",
        "downloads": home / "Downloads",
        "pictures": home / "Pictures",
        "music": home / "Music",
        "videos": home / "Videos",
    }
    for folder in known.values():
        folder.mkdir()

    recorded: list[Path] = []

    def record(path: Path) -> None:
        recorded.append(Path(path))
        if Path(path).is_dir():
            shutil.rmtree(path)
        else:
            Path(path).unlink()

    ops = FileOps(home=home, known_folders=known, trash=trash or record)
    return ops, known, recorded


def test_search_finds_matching_files_and_ignores_others(tmp_path):
    (tmp_path / "budget_2026.xlsx").write_text("x")
    (tmp_path / "notes.txt").write_text("y")
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "budget_summary.pdf").write_text("z")

    results = FileOps().search("budget", [tmp_path])

    names = {item["name"] for item in results}
    assert names == {"budget_2026.xlsx", "budget_summary.pdf"}


def test_search_requires_every_whitespace_token(tmp_path):
    (tmp_path / "budget_2026.xlsx").write_text("x")
    (tmp_path / "budget.txt").write_text("y")

    results = FileOps().search("budget xlsx", [tmp_path])

    assert [item["name"] for item in results] == ["budget_2026.xlsx"]


def test_search_returns_expected_shape(tmp_path):
    (tmp_path / "note.txt").write_text("hello")

    results = FileOps().search("note", [tmp_path])

    assert len(results) == 1
    item = results[0]
    assert set(item) == {"name", "path", "sizeBytes", "modified"}
    assert item["sizeBytes"] == 5
    assert item["path"].endswith("note.txt")


def test_search_is_bounded_and_skips_heavy_dirs(tmp_path):
    heavy = tmp_path / "node_modules" / "deep"
    heavy.mkdir(parents=True)
    (heavy / "treasure.txt").write_text("hidden")

    results = FileOps().search("treasure", [tmp_path])

    assert results == []


def test_search_respects_limit(tmp_path):
    for index in range(5):
        (tmp_path / f"report_{index}.txt").write_text("x")

    results = FileOps().search("report", [tmp_path], limit=2)

    assert len(results) == 2


def test_create_folder_defaults_to_desktop(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    target = ops.create_folder("Invoices", None)

    assert target == (known["desktop"] / "Invoices").resolve()
    assert target.is_dir()


def test_create_folder_honors_a_named_location(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    target = ops.create_folder("Q1", "Downloads")

    assert target == (known["downloads"] / "Q1").resolve()
    assert target.is_dir()


def test_create_folder_accepts_articles_and_case(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    target = ops.create_folder("Notes", "my Documents")

    assert target.parent == known["documents"].resolve()


def test_create_folder_refuses_an_existing_name(tmp_path):
    ops, known, _ = make_ops(tmp_path)
    (known["desktop"] / "Invoices").mkdir()

    with pytest.raises(TargetExists):
        ops.create_folder("Invoices", None)


def test_create_folder_refuses_system_folders(tmp_path):
    ops, known, _ = make_ops(tmp_path)
    system = known["desktop"] / "Program Files"
    system.mkdir()

    with pytest.raises(UnsafeLocation):
        ops.create_folder("X", str(system))


def test_create_folder_rejects_a_path_in_the_name(tmp_path):
    ops, _, _ = make_ops(tmp_path)

    with pytest.raises(UnsafeLocation):
        ops.create_folder("../escape", None)
    with pytest.raises(UnsafeLocation):
        ops.create_folder("sub/child", None)


def test_create_folder_reports_an_unknown_location(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    with pytest.raises(LocationNotFound):
        ops.create_folder("X", str(known["desktop"] / "nope"))


def test_create_file_adds_txt_and_stays_empty(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    target = ops.create_file("notes", None)

    assert target.name == "notes.txt"
    assert target.parent == known["desktop"].resolve()
    assert target.read_text() == ""


def test_create_file_keeps_an_explicit_extension(tmp_path):
    ops, _, _ = make_ops(tmp_path)

    target = ops.create_file("plan.md", None)

    assert target.name == "plan.md"
    assert target.read_text() == ""


def test_create_file_refuses_an_existing_name(tmp_path):
    ops, known, _ = make_ops(tmp_path)
    (known["desktop"] / "notes.txt").write_text("keep")

    with pytest.raises(TargetExists):
        ops.create_file("notes.txt", None)


def test_delete_file_sends_the_file_to_the_trash(tmp_path):
    ops, known, recorded = make_ops(tmp_path)
    victim = known["desktop"] / "old.txt"
    victim.write_text("bye")

    result = ops.delete_file(str(victim))

    assert result == victim.resolve()
    assert recorded == [victim.resolve()]
    assert not victim.exists()


def test_delete_file_refuses_system_folders(tmp_path):
    ops, known, recorded = make_ops(tmp_path)
    hidden = known["desktop"] / "AppData"
    hidden.mkdir()
    victim = hidden / "x.txt"
    victim.write_text("x")

    with pytest.raises(UnsafeLocation):
        ops.delete_file(str(victim))

    assert victim.exists()
    assert recorded == []


def test_delete_file_reports_a_missing_file(tmp_path):
    ops, known, _ = make_ops(tmp_path)

    with pytest.raises(FileNotFoundError):
        ops.delete_file(str(known["desktop"] / "gone.txt"))


def test_delete_file_refuses_a_relative_path(tmp_path):
    ops, _, _ = make_ops(tmp_path)

    with pytest.raises(UnsafeLocation):
        ops.delete_file("report.pdf")


def test_remove_created_trashes_the_path(tmp_path):
    ops, _, recorded = make_ops(tmp_path)
    created = ops.create_folder("Temp", None)

    ops.remove_created(str(created))

    assert recorded == [created]
    assert not created.exists()
