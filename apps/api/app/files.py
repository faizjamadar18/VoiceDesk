"""Safe, local-only filesystem helpers for Kestrel's file tools.

Nothing here reads file contents or uploads anything. Searches are bounded
(max depth, skipped heavy directories) so a single command can never walk the
whole disk.

Writes follow the OS model: the user may name any folder they can reach, and
only system locations are refused. Destructive actions are never performed
here without the caller having confirmed them first, and deletion always goes
to the Windows Recycle Bin — never a permanent unlink.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

MAX_DEPTH = 4
DEFAULT_LIMIT = 20

# Directories that are large, hidden, or system-owned. Never descended into.
SKIP_DIR_NAMES = {
    "appdata",
    "node_modules",
    "$recycle.bin",
    "windows",
    "program files",
    "program files (x86)",
    "__pycache__",
    "venv",
    "dist",
    "build",
}

# Spoken folder names mapped to the user's real shell folders.
KNOWN_FOLDER_ALIASES = {
    "desktop": "desktop",
    "documents": "documents",
    "document": "documents",
    "downloads": "downloads",
    "download": "downloads",
    "pictures": "pictures",
    "photos": "pictures",
    "music": "music",
    "videos": "videos",
    "video": "videos",
}

# Any path component matching one of these is refused for writes. The OS itself
# blocks most of these without admin, but Kestrel refuses first and honestly.
BLOCKED_DIR_NAMES = (
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "appdata",
    "local settings",
    "$recycle.bin",
    "system volume information",
    "perflogs",
    "recovery",
)

_SHELL_FOLDER_DEFAULTS = {
    "desktop": "Desktop",
    "documents": "Documents",
    "downloads": "Downloads",
    "pictures": "Pictures",
    "music": "Music",
    "videos": "Videos",
}

# Registry value names for the real user shell folders (Windows only).
_SHELL_FOLDER_REGISTRY = {
    "desktop": "Desktop",
    "documents": "Personal",
    "downloads": "{374DE290-123F-4565-9164-39C4925E467B}",
    "pictures": "My Pictures",
    "music": "My Music",
    "videos": "My Video",
}


class UnsafeLocation(ValueError):
    """The requested location is outside the areas Kestrel may write to."""


class LocationNotFound(ValueError):
    """The requested location does not exist."""


class TargetExists(ValueError):
    """Something with that name is already there."""


def default_known_folders(home: Path | None = None) -> dict[str, Path]:
    """Return the user's real shell folders, honouring Windows redirection.

    OneDrive and Windows can move Desktop/Documents away from ``~/Desktop``, so
    on Windows we read the same registry keys Explorer uses.
    """
    base = home or Path.home()
    folders = {
        name: base / default for name, default in _SHELL_FOLDER_DEFAULTS.items()
    }
    if os.name == "nt":
        folders.update(_windows_shell_folders())
    return folders


def _windows_shell_folders() -> dict[str, Path]:
    try:
        import winreg
    except ImportError:  # pragma: no cover - non-Windows
        return {}

    folders: dict[str, Path] = {}
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer"
            r"\User Shell Folders",
        )
    except OSError:  # pragma: no cover - unusual machine
        return {}

    try:
        for name, value_name in _SHELL_FOLDER_REGISTRY.items():
            try:
                raw, _ = winreg.QueryValueEx(key, value_name)
            except OSError:
                continue
            if isinstance(raw, str) and raw.strip():
                folders[name] = Path(os.path.expandvars(raw))
    finally:
        winreg.CloseKey(key)
    return folders


def _system_roots() -> tuple[Path, ...]:
    roots: list[Path] = []
    for variable in (
        "WINDIR",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PROGRAMDATA",
        "LOCALAPPDATA",
        "APPDATA",
    ):
        value = os.environ.get(variable)
        if not value:
            continue
        try:
            roots.append(Path(value).resolve())
        except OSError:  # pragma: no cover - defensive
            continue
    return tuple(roots)


def _default_trash(path: Path) -> None:
    # Imported lazily so tests and headless environments can inject their own.
    from send2trash import send2trash

    send2trash(str(path))


class FileOps:
    """Bounded, local-only file search, creation, and Recycle-Bin deletion."""

    def __init__(
        self,
        home: Path | None = None,
        *,
        known_folders: dict[str, Path] | None = None,
        trash: Callable[[Path], None] | None = None,
    ) -> None:
        self._home = (home or Path.home()).resolve()
        self._known = known_folders or default_known_folders(self._home)
        self._trash = trash or _default_trash

    def _is_blocked(self, path: Path) -> bool:
        """Refuse system locations, but never the user's own tree by name."""
        resolved = path.resolve()
        try:
            relative = resolved.relative_to(self._home)
        except ValueError:
            relative = None

        if relative is not None:
            return any(
                part.lower() in BLOCKED_DIR_NAMES for part in relative.parts
            )

        for root in _system_roots():
            if resolved == root or root in resolved.parents:
                return True
        return any(
            part.lower() in BLOCKED_DIR_NAMES for part in resolved.parts
        )

    # -- search --------------------------------------------------------------

    def search(
        self,
        query: str,
        roots: Iterable[Path],
        limit: int = DEFAULT_LIMIT,
    ) -> list[dict]:
        """Return up to ``limit`` files whose name contains every query token."""
        tokens = [token for token in query.lower().split() if token]
        if not tokens:
            return []

        matches: list[dict] = []
        for root in roots:
            root = Path(root)
            if not root.is_dir():
                continue
            self._walk(root, tokens, matches)

        matches.sort(key=lambda item: item["modified"], reverse=True)
        return matches[:limit]

    def _walk(self, root: Path, tokens: list[str], matches: list[dict]) -> None:
        for directory, dirnames, filenames in os.walk(root):
            current = Path(directory)
            if _depth(current, root) >= MAX_DEPTH:
                dirnames[:] = []
            else:
                dirnames[:] = [
                    name for name in dirnames if _usable_directory(name)
                ]
            for filename in filenames:
                if not all(token in filename.lower() for token in tokens):
                    continue
                try:
                    stat = (current / filename).stat()
                except OSError:
                    continue
                matches.append(
                    {
                        "name": filename,
                        "path": str(current / filename),
                        "sizeBytes": stat.st_size,
                        "modified": _iso(stat.st_mtime),
                    }
                )

    # -- locations -----------------------------------------------------------

    def resolve_location(self, location: str | None) -> Path:
        """Turn a spoken location into an existing, writable directory.

        A blank location means the Desktop. Named shell folders resolve through
        the real user folders; anything else is treated as a path relative to
        the user's home (or an absolute path the user named).
        """
        if location is None or not location.strip():
            return self._require_dir(self._known_dir("desktop"))

        raw = location.strip().strip("\"'")
        collapsed = raw.lower()
        for article in ("the ", "my ", "our "):
            if collapsed.startswith(article):
                collapsed = collapsed[len(article) :]
                break

        known = KNOWN_FOLDER_ALIASES.get(collapsed.strip())
        if known is not None:
            return self._require_dir(self._known_dir(known))

        candidate = Path(os.path.expandvars(os.path.expanduser(raw)))
        if not candidate.is_absolute():
            candidate = self._home / candidate
        return self._require_dir(candidate.resolve())

    def _known_dir(self, name: str) -> Path:
        folder = self._known.get(name)
        if folder is None:
            folder = self._home / _SHELL_FOLDER_DEFAULTS[name]
        return folder.resolve() if folder.is_absolute() else (self._home / folder)

    def _require_dir(self, path: Path) -> Path:
        if self._is_blocked(path):
            raise UnsafeLocation(f"Kestrel won't write inside {path}.")
        if not path.is_dir():
            raise LocationNotFound(f'I couldn\'t find the folder "{path}".')
        return path

    def _child(self, base: Path, name: str) -> Path:
        cleaned = name.strip().strip("\"'")
        if not cleaned:
            raise ValueError("A name is required.")
        if (
            cleaned in {".", ".."}
            or "/" in cleaned
            or "\\" in cleaned
            or Path(cleaned).name != cleaned
        ):
            raise UnsafeLocation(
                f'"{name}" is not a plain name. Tell me the folder separately.'
            )
        target = (base / cleaned).resolve()
        if target.parent != base:
            raise UnsafeLocation("Kestrel won't write outside the chosen folder.")
        if self._is_blocked(target):
            raise UnsafeLocation(f"Kestrel won't write inside {target}.")
        return target

    # -- create --------------------------------------------------------------

    def create_folder(self, name: str, location: str | None = None) -> Path:
        """Create one folder under ``location`` (Desktop by default)."""
        base = self.resolve_location(location)
        target = self._child(base, name)
        if target.exists():
            raise TargetExists(f'"{target.name}" already exists in {base}.')
        target.mkdir()
        return target

    def create_file(self, name: str, location: str | None = None) -> Path:
        """Create one empty file under ``location`` (Desktop by default)."""
        base = self.resolve_location(location)
        cleaned = name.strip().strip("\"'")
        if cleaned and not Path(cleaned).suffix:
            cleaned = f"{cleaned}.txt"
        target = self._child(base, cleaned)
        if target.exists():
            raise TargetExists(f'"{target.name}" already exists in {base}.')
        with target.open("x", encoding="utf-8"):
            pass
        return target

    # -- delete --------------------------------------------------------------

    def resolve_delete_target(self, path: str | Path) -> Path:
        """Validate a file for deletion and return its resolved absolute path."""
        raw = Path(path)
        if not raw.is_absolute():
            raise UnsafeLocation("Refusing to touch a relative path.")
        resolved = raw.resolve()
        if self._is_blocked(resolved):
            raise UnsafeLocation("Kestrel won't touch files inside system folders.")
        if not resolved.is_file():
            raise FileNotFoundError(f'"{resolved.name}" is no longer there.')
        return resolved

    def delete_file(self, path: str | Path) -> Path:
        """Move one file to the Recycle Bin and return its resolved path."""
        target = self.resolve_delete_target(path)
        self._trash(target)
        return target

    def remove_created(self, path: str | Path) -> None:
        """Undo a creation by moving the item to the Recycle Bin."""
        resolved = Path(path).resolve()
        if self._is_blocked(resolved):
            raise UnsafeLocation(f"Kestrel won't write inside {resolved}.")
        if resolved.exists():
            self._trash(resolved)


class DirectFileSearch:
    """Expose :meth:`FileOps.search` through the file-search provider API.

    Used only when callers explicitly pass ``file_roots`` (notably tests); the
    production path is Windows Search.
    """

    def __init__(self, file_ops: FileOps, roots: Iterable[Path]) -> None:
        self._file_ops = file_ops
        self._roots = tuple(roots)

    def search(self, query: str, limit: int = DEFAULT_LIMIT) -> list[dict]:
        return self._file_ops.search(query, self._roots, limit=limit)


def _usable_directory(name: str) -> bool:
    return not name.startswith(".") and name.lower() not in SKIP_DIR_NAMES


def _depth(current: Path, root: Path) -> int:
    try:
        return len(current.relative_to(root).parts)
    except ValueError:
        return 0


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
