"""Transport clients for Kestrel's MCP (Model Context Protocol) integration.

Two transports are supported: ``stdio`` spawns a server process and speaks
newline-delimited JSON-RPC over its standard streams, while ``http`` speaks
Streamable HTTP (plain JSON or server-sent events). Both share the JSON-RPC
handshake, pagination, and result-flattening behavior in :class:`_McpClientBase`.

The public seam is :func:`make_client`, plus the concrete clients so tests can
inject small timeouts or an ``httpx.Client``.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import subprocess
import threading
import time
from typing import Any

import httpx

from app.mcp.types import (
    McpCallResult,
    McpClient,
    McpConnectionError,
    McpServerConfig,
    McpTool,
)

logger = logging.getLogger("kestrel.mcp")

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "kestrel", "version": "0.1.0"}
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_INIT_TIMEOUT_SECONDS = 15.0
_DEFAULT_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {},
    "required": [],
}
_STREAM_ENDED = object()


def make_client(config: McpServerConfig) -> McpClient:
    """Return the transport client that matches ``config.transport``."""
    if config.transport == "stdio":
        return StdioMcpClient(config)
    if config.transport == "http":
        return HttpMcpClient(config)
    raise McpConnectionError(
        f"MCP server {config.name!r} uses unsupported transport "
        f"{config.transport!r}."
    )


def _resolve_command(command: str) -> str:
    """Resolve a bare command name to a runnable path.

    On Windows ``shutil.which("npx")`` finds ``npx.CMD`` because ``shell=False``
    ``subprocess`` cannot execute the ``npx.ps1`` wrapper that PowerShell would
    prefer. Commands that are already paths, or that cannot be found, are
    returned unchanged so the failure surfaces as a normal spawn error.
    """
    has_separator = os.sep in command or (
        os.altsep is not None and os.altsep in command
    )
    if not command or has_separator or os.path.isabs(command):
        return command
    return shutil.which(command) or command


class _McpClientBase:
    """JSON-RPC behavior shared by every MCP transport."""

    def __init__(
        self,
        config: McpServerConfig,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        init_timeout: float = DEFAULT_INIT_TIMEOUT_SECONDS,
    ) -> None:
        self.config = config
        self.name = config.name
        self._timeout = timeout
        self._init_timeout = init_timeout
        self._next_id = 0
        self._initialized = False
        self._closed = False

    # -- public protocol --------------------------------------------------

    def list_tools(self) -> list[McpTool]:
        self._ensure_initialized()

        tools: list[McpTool] = []
        cursor: str | None = None
        while True:
            params = {} if cursor is None else {"cursor": cursor}
            result = self._request("tools/list", params, timeout=self._timeout)
            for entry in result.get("tools") or []:
                if not isinstance(entry, dict):
                    continue
                tools.append(_tool_from_entry(entry))
            next_cursor = result.get("nextCursor")
            if not next_cursor or not isinstance(next_cursor, str):
                break
            cursor = next_cursor
        return tools

    def call_tool(self, name: str, arguments: dict[str, Any]) -> McpCallResult:
        self._ensure_initialized()

        result = self._request(
            "tools/call",
            {"name": name, "arguments": arguments},
            timeout=self._timeout,
        )
        return McpCallResult(
            text=_flatten_text(result.get("content")),
            is_error=bool(result.get("isError", False)),
        )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._close_transport()
        except Exception:  # pragma: no cover - close must never raise
            pass

    # -- shared helpers ---------------------------------------------------

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        self._check_open()
        self._request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": dict(CLIENT_INFO),
            },
            timeout=self._init_timeout,
        )
        self._send_notification("notifications/initialized")
        self._initialized = True

    def _check_open(self) -> None:
        if self._closed:
            raise McpConnectionError(f"MCP server {self.name!r} is closed.")

    def _next_request_id(self) -> int:
        self._next_id += 1
        return self._next_id

    def _result(self, message: Any, method: str) -> dict[str, Any]:
        if not isinstance(message, dict):
            raise McpConnectionError(
                f"MCP server {self.name!r} sent a malformed response to "
                f"{method!r}."
            )
        error = message.get("error")
        if error is not None:
            raise McpConnectionError(
                f"MCP server {self.name!r} returned an error for {method!r}: "
                f"{_error_message(error)}"
            )
        result = message.get("result")
        return result if isinstance(result, dict) else {}

    # -- transport hooks --------------------------------------------------

    def _request(
        self, method: str, params: dict[str, Any], *, timeout: float
    ) -> dict[str, Any]:
        raise NotImplementedError

    def _send_notification(self, method: str) -> None:
        raise NotImplementedError

    def _close_transport(self) -> None:
        raise NotImplementedError


class StdioMcpClient(_McpClientBase):
    """MCP client that talks to a child process over stdin/stdout."""

    def __init__(
        self,
        config: McpServerConfig,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        init_timeout: float = DEFAULT_INIT_TIMEOUT_SECONDS,
    ) -> None:
        super().__init__(config, timeout=timeout, init_timeout=init_timeout)
        if not config.command:
            raise McpConnectionError(
                f"MCP server {self.name!r} has no command configured."
            )

        self._messages: queue.Queue[Any] = queue.Queue()
        self._process: subprocess.Popen[str] | None = None
        self._process = self._spawn()

        self._stdout_thread = threading.Thread(
            target=self._read_stdout,
            name=f"mcp-stdout-{self.name}",
            daemon=True,
        )
        self._stdout_thread.start()
        self._stderr_thread = threading.Thread(
            target=self._read_stderr,
            name=f"mcp-stderr-{self.name}",
            daemon=True,
        )
        self._stderr_thread.start()

    def _spawn(self) -> subprocess.Popen[str]:
        assert self.config.command is not None
        command = [_resolve_command(self.config.command), *self.config.args]
        env = {**os.environ, **self.config.env}
        try:
            return subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=self.config.cwd,
                env=env,
            )
        except OSError as exc:
            raise McpConnectionError(
                f"Could not start MCP server {self.name!r}: {exc}"
            ) from exc

    def _request(
        self, method: str, params: dict[str, Any], *, timeout: float
    ) -> dict[str, Any]:
        self._check_open()
        request_id = self._next_request_id()
        self._send_raw(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )

        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise McpConnectionError(
                    f"MCP server {self.name!r} timed out waiting for "
                    f"{method!r}."
                )
            try:
                message = self._messages.get(timeout=remaining)
            except queue.Empty:
                raise McpConnectionError(
                    f"MCP server {self.name!r} timed out waiting for "
                    f"{method!r}."
                ) from None

            if message is _STREAM_ENDED:
                # Leave the sentinel in place so later waits also fail fast.
                self._messages.put(_STREAM_ENDED)
                raise McpConnectionError(
                    f"MCP server {self.name!r} exited before responding to "
                    f"{method!r}."
                )
            if not isinstance(message, dict):
                continue
            if "method" in message:
                if "id" in message:
                    self._reply_method_not_found(message.get("id"))
                continue
            if message.get("id") != request_id:
                continue
            return self._result(message, method)

    def _send_notification(self, method: str) -> None:
        self._send_raw({"jsonrpc": "2.0", "method": method})

    def _send_raw(self, message: dict[str, Any]) -> None:
        if self._closed or self._process is None:
            raise McpConnectionError(f"MCP server {self.name!r} is closed.")
        stdin = self._process.stdin
        if stdin is None:
            raise McpConnectionError(
                f"MCP server {self.name!r} has no input stream."
            )
        line = json.dumps(message, separators=(",", ":")) + "\n"
        try:
            stdin.write(line)
            stdin.flush()
        except (BrokenPipeError, OSError, ValueError) as exc:
            raise McpConnectionError(
                f"MCP server {self.name!r} is no longer accepting input: {exc}"
            ) from exc

    def _reply_method_not_found(self, request_id: Any) -> None:
        try:
            self._send_raw(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": "Method not found"},
                }
            )
        except McpConnectionError:
            pass

    def _read_stdout(self) -> None:
        process = self._process
        stream = process.stdout if process is not None else None
        try:
            if stream is not None:
                for line in stream:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        message = json.loads(stripped)
                    except ValueError:
                        continue
                    self._messages.put(message)
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("MCP server %s stdout reader stopped: %s", self.name, exc)
        finally:
            self._messages.put(_STREAM_ENDED)

    def _read_stderr(self) -> None:
        process = self._process
        stream = process.stderr if process is not None else None
        if stream is None:
            return
        try:
            for line in stream:
                text = line.rstrip()
                if text:
                    logger.debug("[%s] %s", self.name, text)
        except Exception:  # pragma: no cover - defensive
            pass

    def _close_transport(self) -> None:
        process = self._process
        self._process = None
        if process is None:
            return
        try:
            if process.stdin is not None:
                process.stdin.close()
        except Exception:
            pass
        try:
            process.terminate()
            process.wait(timeout=2)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
            try:
                process.wait(timeout=1)
            except Exception:
                pass


class HttpMcpClient(_McpClientBase):
    """MCP client for a Streamable HTTP endpoint."""

    def __init__(
        self,
        config: McpServerConfig,
        *,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        init_timeout: float = DEFAULT_INIT_TIMEOUT_SECONDS,
        client: httpx.Client | None = None,
    ) -> None:
        super().__init__(config, timeout=timeout, init_timeout=init_timeout)
        if not config.url:
            raise McpConnectionError(
                f"MCP server {self.name!r} has no URL configured."
            )
        self._url = config.url
        self._owns_client = client is None
        self._client = client if client is not None else httpx.Client(timeout=timeout)
        self._session_id: str | None = None

    def _request(
        self, method: str, params: dict[str, Any], *, timeout: float
    ) -> dict[str, Any]:
        self._check_open()
        request_id = self._next_request_id()
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        }
        try:
            response = self._client.post(
                self._url,
                json=payload,
                headers=self._request_headers(),
                timeout=timeout,
            )
        except httpx.HTTPError as exc:
            raise McpConnectionError(
                f"MCP server {self.name!r} request failed: {exc}"
            ) from exc

        if not 200 <= response.status_code < 300:
            raise McpConnectionError(
                f"MCP server {self.name!r} returned HTTP "
                f"{response.status_code}: {_response_snippet(response)}"
            )

        if method == "initialize":
            self._capture_session_id(response)

        return self._result(self._parse_message(response, request_id, method), method)

    def _send_notification(self, method: str) -> None:
        if self._closed:
            return
        payload = {"jsonrpc": "2.0", "method": method}
        try:
            response = self._client.post(
                self._url,
                json=payload,
                headers=self._request_headers(),
                timeout=self._timeout,
            )
        except httpx.HTTPError:
            # The initialized notification is best-effort.
            return
        self._capture_session_id(response)

    def _request_headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        headers.update(self.config.headers)
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        return headers

    def _capture_session_id(self, response: httpx.Response) -> None:
        session_id = response.headers.get("Mcp-Session-Id")
        if session_id:
            self._session_id = session_id

    def _parse_message(
        self, response: httpx.Response, request_id: int, method: str
    ) -> Any:
        content_type = response.headers.get("content-type", "").lower()
        if "text/event-stream" in content_type:
            return self._parse_sse(response.text, request_id, method)
        try:
            return response.json()
        except ValueError as exc:
            raise McpConnectionError(
                f"MCP server {self.name!r} sent an invalid JSON response to "
                f"{method!r}."
            ) from exc

    def _parse_sse(self, text: str, request_id: int, method: str) -> Any:
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                message = json.loads(payload)
            except ValueError:
                continue
            if not isinstance(message, dict):
                continue
            if "method" in message:
                # A notification or server-initiated request; not our response.
                continue
            if message.get("id") == request_id:
                return message
        raise McpConnectionError(
            f"MCP server {self.name!r} did not send a response to {method!r}."
        )

    def _close_transport(self) -> None:
        if self._owns_client:
            try:
                self._client.close()
            except Exception:
                pass


def _tool_from_entry(entry: dict[str, Any]) -> McpTool:
    name = entry.get("name")
    description = entry.get("description") or ""
    schema = entry.get("inputSchema")
    if not isinstance(schema, dict):
        schema = dict(_DEFAULT_INPUT_SCHEMA)
    annotations = entry.get("annotations")
    if not isinstance(annotations, dict):
        annotations = {}
    return McpTool(
        name=str(name) if name is not None else "",
        description=str(description),
        input_schema=schema,
        read_only=bool(annotations.get("readOnlyHint", True)),
    )


def _flatten_text(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") != "text":
            continue
        text = block.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(parts)


def _error_message(error: Any) -> str:
    if isinstance(error, dict):
        message = error.get("message")
        if message is not None:
            return str(message)
    return str(error)


def _response_snippet(response: httpx.Response) -> str:
    try:
        return response.text[:200]
    except Exception:  # pragma: no cover - defensive
        return "<unreadable body>"