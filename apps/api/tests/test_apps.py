from __future__ import annotations

import pytest

from app.apps import (
    AppEntry,
    AppLaunchError,
    AppNotInstalledError,
    WindowsAppCatalog,
    app_label,
)


def make_catalog(**overrides) -> WindowsAppCatalog:
    options = {
        "app_path_reader": lambda: [],
        "shortcut_roots": (),
        "start_app_reader": lambda: [],
        "path_finder": lambda name: None,
        "cache_seconds": 0,
    }
    options.update(overrides)
    return WindowsAppCatalog(**options)


def test_resolves_a_store_app_by_display_name():
    catalog = make_catalog(
        start_app_reader=lambda: [
            AppEntry(
                "WhatsApp",
                (
                    "explorer.exe",
                    r"shell:AppsFolder\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App",
                ),
                source="start_app",
            )
        ]
    )

    entry = catalog.resolve("whatsapp")

    assert entry.name == "WhatsApp"
    assert entry.launch[0] == "explorer.exe"


def test_resolves_a_shortcut_by_partial_name(tmp_path):
    (tmp_path / "Google Chrome.lnk").write_text("placeholder", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("not an app", encoding="utf-8")
    catalog = make_catalog(shortcut_roots=(tmp_path,))

    entry = catalog.resolve("chrome")

    assert entry.name == "Google Chrome"
    assert entry.shell is True
    assert entry.launch == (str(tmp_path / "Google Chrome.lnk"),)


def test_resolves_a_registry_app_path():
    catalog = make_catalog(
        app_path_reader=lambda: [
            AppEntry("Notion", (r"C:\Users\me\AppData\Local\Programs\Notion\Notion.exe",))
        ]
    )

    entry = catalog.resolve("notion")

    assert entry.name == "Notion"
    assert entry.launch[-1].endswith("Notion.exe")


def test_store_app_paths_defer_to_the_start_apps_catalog():
    catalog = make_catalog(
        app_path_reader=lambda: [
            AppEntry(
                "notepad",
                (
                    r"C:\Program Files\WindowsApps"
                    r"\Microsoft.WindowsNotepad_11.0_x64__8wekyb3d8bbwe"
                    r"\Notepad\Notepad.exe",
                ),
                source="app_paths",
            )
        ],
        start_app_reader=lambda: [
            AppEntry(
                "Notepad",
                (
                    "explorer.exe",
                    r"shell:AppsFolder\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App",
                ),
                source="start_app",
            )
        ],
    )

    entry = catalog.resolve("notepad")

    assert entry.source == "start_app"
    assert entry.launch[0] == "explorer.exe"


def test_alias_uses_the_windows_executable_name():
    seen: list[str] = []

    def find(name: str) -> str | None:
        seen.append(name)
        if name == "calc":
            return r"C:\Windows\System32\calc.exe"
        return None

    catalog = make_catalog(path_finder=find)

    entry = catalog.resolve("calculator")

    assert entry.launch == (r"C:\Windows\System32\calc.exe",)
    assert "calc" in seen


def test_terminal_falls_back_to_powershell_when_windows_terminal_is_missing():
    def find(name: str) -> str | None:
        if name == "powershell":
            return r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
        return None

    catalog = make_catalog(path_finder=find)

    entry = catalog.resolve("terminal")

    assert entry.launch[-1].endswith("powershell.exe")


def test_vs_code_alias_matches_the_code_executable():
    catalog = make_catalog(
        path_finder=lambda name: r"C:\VS Code\Code.exe" if name == "code" else None
    )

    entry = catalog.resolve("vs code")

    assert entry.launch == (r"C:\VS Code\Code.exe",)


def test_settings_opens_the_windows_settings_uri():
    entry = make_catalog().resolve("settings")

    assert entry.shell is True
    assert entry.launch == ("ms-settings:",)


def test_missing_app_explains_that_it_is_not_installed():
    with pytest.raises(AppNotInstalledError) as excinfo:
        make_catalog().resolve("notion")

    assert str(excinfo.value) == "Notion is not installed on this PC."


def test_blank_app_name_is_rejected():
    with pytest.raises(AppNotInstalledError):
        make_catalog().resolve("   ")


def test_launch_uses_the_resolved_entry_and_injected_launcher():
    launched: list[AppEntry] = []
    catalog = make_catalog(
        app_path_reader=lambda: [AppEntry("Notion", (r"C:\Notion.exe",))],
        launcher=launched.append,
    )

    catalog.launch("notion")

    assert [entry.name for entry in launched] == ["Notion"]


def test_launch_failure_is_reported_clearly():
    def fail(entry: AppEntry) -> None:
        raise OSError("access denied")

    catalog = make_catalog(
        app_path_reader=lambda: [AppEntry("Notion", (r"C:\Notion.exe",))],
        launcher=fail,
    )

    with pytest.raises(AppLaunchError) as excinfo:
        catalog.launch("notion")

    assert str(excinfo.value) == (
        "I found Notion, but Windows couldn't open it."
    )


def test_catalog_is_cached_between_lookups():
    reads: list[int] = []

    def read() -> list[AppEntry]:
        reads.append(1)
        return [AppEntry("Notion", (r"C:\Notion.exe",))]

    catalog = make_catalog(app_path_reader=read, cache_seconds=60)

    catalog.resolve("notion")
    catalog.resolve("notion")

    assert len(reads) == 1


@pytest.mark.parametrize(
    ("spoken", "label"),
    [
        ("notion", "Notion"),
        ("calc", "Calculator"),
        ("vs code", "Visual Studio Code"),
        ("google chrome", "Chrome"),
    ],
)
def test_app_label_is_friendly(spoken: str, label: str):
    assert app_label(spoken) == label
