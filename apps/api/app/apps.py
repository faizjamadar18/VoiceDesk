"""Resolve spoken application names to launchable Windows targets.

Windows has no single registry of "installed apps", so Kestrel composes the
same sources the Start menu and the Run dialog use:

* the App Paths registry (desktop apps such as Chrome, Word, and VS Code)
* Start menu and desktop shortcuts (classic desktop apps and games)
* the Start apps list (Microsoft Store apps such as WhatsApp)
* the executable search path (console tools such as ``cmd``)

Nothing here accepts a shell command from the user. Every launch is an argv
list built from a local target that was found on this machine.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

DEFAULT_CACHE_SECONDS = 300.0
START_APPS_TIMEOUT_SECONDS = 8.0

_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# Spoken name -> canonical app id. Aliases cover names whose executable is
# spelled differently, plus the phrases people actually use.
APP_ALIASES: dict[str, str] = {
    "notepad": "notepad",
    "note pad": "notepad",
    "calculator": "calculator",
    "calc": "calculator",
    "chrome": "chrome",
    "google chrome": "chrome",
    "browser": "chrome",
    "explorer": "explorer",
    "file explorer": "explorer",
    "files": "explorer",
    "word": "word",
    "microsoft word": "word",
    "excel": "excel",
    "microsoft excel": "excel",
    "powerpoint": "powerpnt",
    "microsoft powerpoint": "powerpnt",
    "outlook": "outlook",
    "microsoft outlook": "outlook",
    "settings": "settings",
    "windows settings": "settings",
    "edge": "edge",
    "microsoft edge": "edge",
    "terminal": "terminal",
    "windows terminal": "terminal",
    "cmd": "cmd",
    "command prompt": "cmd",
    "command line": "cmd",
    "powershell": "powershell",
    "power shell": "powershell",
    "paint": "paint",
    "microsoft paint": "paint",
    "task manager": "taskmgr",
    "control panel": "control",
    "vs code": "code",
    "vscode": "code",
    "visual studio code": "code",
    "notepad++": "notepad++",
    "notepad plus plus": "notepad++",
    "notepad plus": "notepad++",
    "7zip": "7-zip",
    "7 zip": "7-zip",
}

APP_LABELS: dict[str, str] = {
    "notepad": "Notepad",
    "notepad++": "Notepad++",
    "calculator": "Calculator",
    "chrome": "Chrome",
    "explorer": "File Explorer",
    "word": "Word",
    "excel": "Excel",
    "powerpnt": "PowerPoint",
    "outlook": "Outlook",
    "settings": "Settings",
    "edge": "Microsoft Edge",
    "terminal": "Terminal",
    "cmd": "Command Prompt",
    "powershell": "PowerShell",
    "paint": "Paint",
    "taskmgr": "Task Manager",
    "control": "Control Panel",
    "code": "Visual Studio Code",
    "7-zip": "7-Zip",
}

# Executable names that differ from the canonical id. The order matters: the
# first executable Windows can find is the one that gets launched.
APP_EXECUTABLES: dict[str, tuple[str, ...]] = {
    "notepad": ("notepad",),
    "notepad++": ("notepad++",),
    "calculator": ("calc",),
    "chrome": ("chrome",),
    "explorer": ("explorer",),
    "word": ("winword",),
    "excel": ("excel",),
    "powerpnt": ("powerpnt",),
    "outlook": ("outlook",),
    "edge": ("msedge",),
    "terminal": ("wt", "powershell"),
    "cmd": ("cmd",),
    "powershell": ("powershell",),
    "paint": ("mspaint",),
    "taskmgr": ("taskmgr",),
    "control": ("control",),
    "code": ("code",),
    "7-zip": ("7zfm",),
}

_SOURCE_PRIORITY = {
    "shell": 0,
    "path": 0,
    "app_paths": 1,
    "start_app": 2,
    "shortcut": 3,
}

# Packaged (Store/MSIX) apps live here and refuse direct CreateProcess launches;
# the Start apps list is the supported way to start them.
_RESTRICTED_PACKAGE_FRAGMENT = "\\program files\\windowsapps\\"

_NON_ALNUM = re.compile(r"[\W_]+", re.UNICODE)
_TOKEN = re.compile(r"[\w]+", re.UNICODE)


@dataclass(frozen=True)
class AppEntry:
    """One launchable app discovered on this machine."""

    name: str
    launch: tuple[str, ...]
    shell: bool = False
    source: str = "app_paths"

    @property
    def key(self) -> str:
        return _key(self.name)

    @property
    def tokens(self) -> tuple[str, ...]:
        return _tokens(self.name)


class AppNotInstalledError(RuntimeError):
    """The requested app could not be found on this PC."""

    def __init__(self, app: str) -> None:
        self.app = app
        self.label = app_label(app)
        super().__init__(f"{self.label} is not installed on this PC.")


class AppLaunchError(RuntimeError):
    """The app was found but Windows could not start it."""


# Windows shell targets that are not ordinary executables.
_SPECIAL_TARGETS: dict[str, AppEntry] = {
    "settings": AppEntry(
        "Settings",
        ("ms-settings:",),
        shell=True,
        source="shell",
    ),
}


def app_label(app: str) -> str:
    """Return a readable label for a spoken app name."""
    spoken = " ".join(str(app).split()).strip().strip("\"'")
    if not spoken:
        return "That app"
    canonical = APP_ALIASES.get(spoken.casefold(), spoken.casefold())
    known = APP_LABELS.get(canonical)
    if known:
        return known
    return spoken[:1].upper() + spoken[1:]


def _key(text: str) -> str:
    return _NON_ALNUM.sub("", text.casefold())


def _tokens(text: str) -> tuple[str, ...]:
    return tuple(_TOKEN.findall(text.casefold()))


def _candidate_names(app: str) -> list[str]:
    """Return the names to try, most specific first."""
    spoken = " ".join(str(app).split()).strip()
    if not spoken:
        return []
    lowered = spoken.casefold()
    canonical = APP_ALIASES.get(lowered, lowered)
    names = [spoken]
    if canonical != lowered:
        names.append(canonical)
    label = APP_LABELS.get(canonical)
    if label:
        names.append(label)
    names.extend(APP_EXECUTABLES.get(canonical, ()))
    if lowered != canonical:
        names.extend(APP_EXECUTABLES.get(lowered, ()))

    unique: list[str] = []
    seen: set[str] = set()
    for name in names:
        cleaned = name.strip()
        if not cleaned:
            continue
        marker = cleaned.casefold()
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(cleaned)
    return unique


def _best(matches: list[AppEntry], spoken: str) -> AppEntry:
    spoken_raw = " ".join(spoken.split()).casefold()
    return min(
        matches,
        key=lambda entry: (
            0
            if " ".join(entry.name.split()).casefold() == spoken_raw
            else 1,
            _SOURCE_PRIORITY.get(entry.source, 9),
            1 if entry.shell else 0,
            len(entry.name),
            entry.name.casefold(),
        ),
    )


def _command_for(path: str) -> tuple[str, ...]:
    lowered = path.casefold()
    if lowered.endswith((".cmd", ".bat")):
        return (os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", path)
    if lowered.endswith(".ps1"):
        return (
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path,
        )
    return (path,)


def _launch_entry(entry: AppEntry) -> None:
    if entry.shell:
        startfile = getattr(os, "startfile", None)
        if startfile is None:
            raise OSError("os.startfile is unavailable")
        startfile(entry.launch[0])
        return
    subprocess.Popen(list(entry.launch))


def _is_restricted_package_path(entry: AppEntry) -> bool:
    if entry.source != "app_paths" or not entry.launch:
        return False
    return _RESTRICTED_PACKAGE_FRAGMENT in entry.launch[0].casefold()


class WindowsAppCatalog:
    """Find and launch installed Windows apps.

    Readers and the process launcher are injectable so tests never depend on
    the real machine, PowerShell, or a GUI window.
    """

    def __init__(
        self,
        *,
        app_path_reader: Callable[[], Iterable[AppEntry]] | None = None,
        shortcut_roots: Sequence[Path] | None = None,
        start_app_reader: Callable[[], Iterable[AppEntry]] | None = None,
        path_finder: Callable[[str], str | None] | None = None,
        launcher: Callable[[AppEntry], None] | None = None,
        cache_seconds: float = DEFAULT_CACHE_SECONDS,
    ) -> None:
        self._app_path_reader = app_path_reader or read_app_path_entries
        self._shortcut_roots = (
            tuple(shortcut_roots)
            if shortcut_roots is not None
            else default_shortcut_roots()
        )
        self._start_app_reader = start_app_reader or read_start_app_entries
        self._path_finder = path_finder or shutil.which
        self._launcher = launcher or _launch_entry
        self._cache_seconds = cache_seconds
        self._lock = threading.Lock()
        self._entries: tuple[AppEntry, ...] | None = None
        self._entries_at = 0.0

    def resolve(self, app: str) -> AppEntry:
        """Find one installed app or raise :class:`AppNotInstalledError`."""
        spoken = " ".join(str(app).split()).strip()
        if not spoken:
            raise AppNotInstalledError(app)

        names = _candidate_names(spoken)
        entries = self._all_entries()

        for name in names:
            special = _SPECIAL_TARGETS.get(_key(name))
            if special is not None:
                return special

        for name in names:
            raw = " ".join(name.split()).casefold()
            matches = [
                entry
                for entry in entries
                if " ".join(entry.name.split()).casefold() == raw
            ]
            if matches:
                return _best(matches, spoken)

            key = _key(name)
            if key:
                matches = [entry for entry in entries if entry.key == key]
                if matches:
                    return _best(matches, spoken)

            executable = self._find_executable(name)
            if executable is not None:
                return AppEntry(
                    name,
                    _command_for(executable),
                    source="path",
                )

        fuzzy = self._best_fuzzy(entries, spoken)
        if fuzzy is not None:
            return fuzzy

        raise AppNotInstalledError(spoken)

    def launch(self, app: str) -> None:
        """Resolve and start an app, translating failures into clear errors."""
        entry = self.resolve(app)
        try:
            self._launcher(entry)
        except OSError as exc:
            raise AppLaunchError(
                f"I found {entry.name}, but Windows couldn't open it."
            ) from exc

    def _find_executable(self, name: str) -> str | None:
        if not name or "\\" in name or "/" in name:
            return None
        found = self._path_finder(name)
        if found:
            return found
        if not name.casefold().endswith(
            (".exe", ".cmd", ".bat", ".com", ".ps1")
        ):
            found = self._path_finder(f"{name}.exe")
            if found:
                return found
        return None

    def _all_entries(self) -> tuple[AppEntry, ...]:
        now = time.monotonic()
        with self._lock:
            if (
                self._entries is not None
                and self._cache_seconds > 0
                and now - self._entries_at < self._cache_seconds
            ):
                return self._entries

            collected: list[AppEntry] = []
            for reader in (self._app_path_reader,):
                collected.extend(reader())
            collected.extend(shortcut_entries(self._shortcut_roots))
            collected.extend(self._start_app_reader())

            unique: list[AppEntry] = []
            seen: set[tuple[str, tuple[str, ...], bool]] = set()
            for entry in collected:
                if not entry.name.strip() or not entry.launch:
                    continue
                if _is_restricted_package_path(entry):
                    continue
                marker = (entry.key, entry.launch, entry.shell)
                if marker in seen:
                    continue
                seen.add(marker)
                unique.append(entry)

            self._entries = tuple(unique)
            self._entries_at = now
            return self._entries

    def _best_fuzzy(
        self, entries: Sequence[AppEntry], spoken: str
    ) -> AppEntry | None:
        key = _key(spoken)
        tokens = _tokens(spoken)
        if not key:
            return None

        best: tuple[tuple, AppEntry] | None = None
        for entry in entries:
            score = _fuzzy_score(entry, key, tokens)
            if score is None:
                continue
            if best is None or score < best[0]:
                best = (score, entry)
        return best[1] if best is not None else None


def _fuzzy_score(
    entry: AppEntry, spoken_key: str, spoken_tokens: tuple[str, ...]
) -> tuple | None:
    entry_key = entry.key
    if not entry_key:
        return None

    token_match = bool(spoken_tokens) and all(
        token in entry.tokens for token in spoken_tokens
    )
    key_match = len(spoken_key) >= 6 and (
        entry_key.startswith(spoken_key)
        or (
            spoken_key.startswith(entry_key)
            and len(entry_key) >= 6
        )
    )
    if not (token_match or key_match):
        return None

    return (
        0 if entry_key.startswith(spoken_key) else 1,
        abs(len(entry_key) - len(spoken_key)),
        len(entry.name),
        _SOURCE_PRIORITY.get(entry.source, 9),
        entry.name.casefold(),
    )


def read_app_path_entries() -> list[AppEntry]:
    """Read executable paths registered under Windows' App Paths key."""
    if os.name != "nt":
        return []
    try:
        import winreg
    except ImportError:  # pragma: no cover - Windows always has winreg
        return []

    base = r"Software\Microsoft\Windows\CurrentVersion\App Paths"
    locations = (
        (winreg.HKEY_CURRENT_USER, 0),
        (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_64KEY),
        (winreg.HKEY_LOCAL_MACHINE, winreg.KEY_WOW64_32KEY),
    )
    entries: list[AppEntry] = []
    for hive, view in locations:
        try:
            root = winreg.OpenKey(hive, base, 0, winreg.KEY_READ | view)
        except OSError:
            continue
        try:
            count = winreg.QueryInfoKey(root)[0]
            for index in range(count):
                try:
                    sub_name = winreg.EnumKey(root, index)
                    with winreg.OpenKey(root, sub_name) as sub:
                        value, _ = winreg.QueryValueEx(sub, "")
                except OSError:
                    continue

                path_text = os.path.expandvars(
                    str(value).strip().strip('"')
                )
                if not path_text or not os.path.isfile(path_text):
                    continue
                name = Path(sub_name).stem or Path(path_text).stem
                if name:
                    entries.append(
                        AppEntry(name, (path_text,), source="app_paths")
                    )
        except OSError:
            continue
        finally:
            try:
                root.Close()
            except OSError:
                pass
    return entries


def shortcut_entries(roots: Sequence[Path]) -> list[AppEntry]:
    """Read Start menu and desktop shortcuts under ``roots``."""
    entries: list[AppEntry] = []
    suffixes = {".lnk", ".appref-ms"}
    for root in roots:
        try:
            if not root.is_dir():
                continue
            for path in root.rglob("*"):
                try:
                    if (
                        not path.is_file()
                        or path.suffix.casefold() not in suffixes
                    ):
                        continue
                except OSError:
                    continue
                entries.append(
                    AppEntry(
                        path.stem,
                        (str(path),),
                        shell=True,
                        source="shortcut",
                    )
                )
        except OSError:
            continue
    return entries


def default_shortcut_roots() -> tuple[Path, ...]:
    """Return the standard Start menu and desktop shortcut folders."""
    roots: list[Path] = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        roots.append(
            Path(appdata)
            / "Microsoft"
            / "Windows"
            / "Start Menu"
            / "Programs"
        )
    programdata = os.environ.get("PROGRAMDATA")
    if programdata:
        roots.append(
            Path(programdata)
            / "Microsoft"
            / "Windows"
            / "Start Menu"
            / "Programs"
        )
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        roots.append(Path(userprofile) / "Desktop")
    public = os.environ.get("PUBLIC")
    if public:
        roots.append(Path(public) / "Desktop")
    return tuple(roots)


def read_start_app_entries() -> list[AppEntry]:
    """Read the Start apps list through Windows PowerShell.

    ``Get-StartApps`` includes Microsoft Store apps that have no .lnk on disk.
    It is read-only and the user's text is never passed to PowerShell.
    """
    if os.name != "nt":
        return []

    powershell = (
        shutil.which("powershell.exe")
        or shutil.which("powershell")
        or "powershell.exe"
    )
    script = (
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        "Get-StartApps | Select-Object Name, AppID | "
        "ConvertTo-Json -Compress"
    )
    try:
        completed = subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=START_APPS_TIMEOUT_SECONDS,
            creationflags=_CREATE_NO_WINDOW,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    if completed.returncode != 0:
        return []

    payload = (completed.stdout or "").strip()
    if not payload:
        return []
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return []
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []

    entries: list[AppEntry] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("Name") or "").strip()
        app_id = str(item.get("AppID") or "").strip()
        if not name or not app_id:
            continue
        entries.append(
            AppEntry(
                name,
                ("explorer.exe", f"shell:AppsFolder\\{app_id}"),
                source="start_app",
            )
        )
    return entries