"""Kestrel API: health, speech-to-text, actions, planner, and screen Q&A."""

from __future__ import annotations

import base64
import binascii
import logging
import os
import time
from collections.abc import Callable, Sequence
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, StrictBool, field_validator

from app.actions import ActionExecutor, WindowsActionExecutor
from app.files import DirectFileSearch, FileOps
from app.groq import DEFAULT_GROQ_MODEL, resilient_from_env
from app.mcp.config import load_server_configs
from app.mcp.registry import McpManager
from app.mcp.types import McpServerStatus
from app.pending import PendingStore
from app.planner import (
    AnswerDirective,
    FallbackPlanner,
    GroqPlanner,
    NoDirective,
    Planner,
    RulePlanner,
    ScreenDirective,
)
from app.retrieval import selector_from_env
from app.tools import (
    ToolContext,
    ToolOutcome,
    ToolPreparation,
    ToolRegistry,
    ToolSpec,
    build_default_registry,
)
from app.transcribers import (
    FakeTranscriber,
    GroqTranscriber,
    MissingProviderKeyError,
    Transcriber,
    TranscriptionProviderError,
)
from app.vision import (
    DEFAULT_VISION_MODEL,
    GroqVisionClient,
    VisionClient,
    VisionNotConfiguredError,
    VisionProviderError,
    VisionQuotaError,
)
from app.windows_search import FileSearch, WindowsSearchProvider

_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file)
else:
    load_dotenv()

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_SCREEN_IMAGE_BYTES = 12 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"
SUPPORTED_PROVIDERS = frozenset({"fake", "groq"})
DEFAULT_PROVIDER = "groq"

CALLBACK_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Successful - VoiceDesk</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #ffffff 0%, #edf4fe 100%);
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
      padding: 24px;
    }
    .content-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 480px;
    }
    h1 {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 32px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 12px 0;
    }
    p {
      font-size: 15px;
      color: #6b7280;
      margin: 0 0 28px 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="content-container">
    <h1>Login Successful</h1>
    <p>You can now return to VoiceDesk and start using your voice as your keyboard</p>
    <button onclick="openApp()" style="display: inline-flex; align-items: center; gap: 10px; background: #000000; color: #ffffff; padding: 12px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 1h6v6H1V1zm8 0h6v6H9V1zm-8 8h6v6H1V9zm8 0h6v6H9V9z"/>
      </svg>
      <span>Open VoiceDesk</span>
    </button>
  </div>
  <script>
    function openApp() {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const target = 'voicedesk://auth/callback' + hash + (search ? (hash ? '&' : '?') + search.slice(1) : '');
      window.location.href = target;
    }
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(openApp, 300);
    });
  </script>
</body>
</html>
"""

TranscriberFactory = Callable[[str], Transcriber]


class HealthResponse(BaseModel):
    status: str
    provider: str
    configured: bool


class TranscriptionResponse(BaseModel):
    text: str
    provider: str
    latencyMs: int


class ActionRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=4000)

    @field_validator("transcript")
    @classmethod
    def transcript_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("transcript must not be blank")
        return value


class ActionResponse(BaseModel):
    status: str
    action: str
    message: str
    text: str | None = None
    dryRun: bool = False
    risk: str | None = None
    requiresConfirmation: bool | None = None
    planId: str | None = None
    results: list[dict] | None = None
    canUndo: bool | None = None
    # Display-only absolute path for create/delete confirmation cards.
    target: str | None = None
    card: dict | None = None
    spokenResponse: str | None = None


class ConfirmRequest(BaseModel):
    planId: str = Field(min_length=1)
    approved: bool


class UndoRequest(BaseModel):
    planId: str = Field(min_length=1)


class PlannerStatusResponse(BaseModel):
    provider: str
    configured: bool
    model: str


class McpServerStatusResponse(BaseModel):
    name: str
    ok: bool
    toolCount: int
    error: str | None = None


class McpStatusResponse(BaseModel):
    enabled: bool
    servers: list[McpServerStatusResponse]


class ScreenAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    image: str = Field(min_length=1)
    marked: StrictBool

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class ScreenAnswerResponse(BaseModel):
    answer: str
    model: str
    latencyMs: int


def create_app(
    transcriber_factory: TranscriberFactory | None = None,
    action_executor: ActionExecutor | None = None,
    action_clock: Callable[[], datetime] | None = None,
    planner: Planner | None = None,
    file_roots: Sequence[Path] | None = None,
    pending_store: PendingStore | None = None,
    file_ops: FileOps | None = None,
    windows_search: FileSearch | None = None,
    registry: ToolRegistry | None = None,
    vision_client: VisionClient | None = None,
    mcp_manager: McpManager | None = None,
) -> FastAPI:
    """Build the API. Tests may inject providers and action dependencies."""
    factory = transcriber_factory or _default_transcriber
    executor = action_executor or WindowsActionExecutor()
    clock = action_clock or datetime.now

    ops = file_ops or FileOps()
    tool_registry = registry or build_default_registry(ops)
    explicit_file_roots = file_roots is not None
    roots = (
        tuple(file_roots) if explicit_file_roots else _default_file_roots()
    )
    if explicit_file_roots:
        file_search: FileSearch = DirectFileSearch(ops, roots)
    elif windows_search is not None:
        file_search = windows_search
    else:
        file_search = WindowsSearchProvider()
    pending = pending_store or PendingStore()
    manager = _setup_mcp(mcp_manager, tool_registry)
    chosen_planner = _build_planner(planner, tool_registry, clock)
    planner_provider = _planner_provider(chosen_planner)

    application = FastAPI(title="Kestrel API", version="0.1.0")

    @application.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        provider = _provider_name()
        return HealthResponse(
            status="ok",
            provider=provider,
            configured=_provider_configured(provider),
        )

    @application.get("/callback", response_class=HTMLResponse)
    @application.get("/auth/callback", response_class=HTMLResponse)
    async def auth_callback() -> HTMLResponse:
        return HTMLResponse(content=CALLBACK_HTML)

    @application.post("/transcribe", response_model=TranscriptionResponse)
    async def transcribe(request: Request) -> TranscriptionResponse:
        content_type = request.headers.get("content-type", "")
        if not _is_supported_content_type(content_type):
            raise HTTPException(
                status_code=415,
                detail=(
                    "Unsupported Content-Type. Send raw audio with an audio/* "
                    "or application/octet-stream Content-Type."
                ),
            )

        audio = await _read_audio(request)
        provider = _provider_name()

        try:
            transcriber = factory(provider)
        except MissingProviderKeyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        started = time.perf_counter()
        try:
            text = await transcriber.transcribe(audio, content_type)
        except MissingProviderKeyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=_provider_failure_detail(exc),
            ) from exc

        latency_ms = max(0, int((time.perf_counter() - started) * 1000))
        return TranscriptionResponse(
            text=text,
            provider=provider,
            latencyMs=latency_ms,
        )

    @application.get("/planner", response_model=PlannerStatusResponse)
    async def planner_status() -> PlannerStatusResponse:
        return PlannerStatusResponse(
            provider=planner_provider,
            configured=True,
            model=_planner_model(planner_provider),
        )

    @application.post("/act", response_model=ActionResponse)
    async def act(request: ActionRequest) -> ActionResponse:
        dry_run = _action_dry_run()
        directive = await chosen_planner.plan(request.transcript)

        if isinstance(directive, NoDirective):
            return ActionResponse(
                status="unhandled",
                action="none",
                message=directive.message,
                spokenResponse=directive.message,
                dryRun=dry_run,
            )

        if isinstance(directive, AnswerDirective):
            return ActionResponse(
                status="ok",
                action="answer",
                message=directive.message,
                spokenResponse=directive.message,
                dryRun=dry_run,
            )

        if isinstance(directive, ScreenDirective):
            return ActionResponse(
                status="ok",
                action="look_at_screen",
                message="",
                spokenResponse=None,
                dryRun=dry_run,
            )

        call = directive.call
        tool = tool_registry.get(call.name)
        if tool is None:
            return ActionResponse(
                status="unhandled",
                action="none",
                message="I don't know how to do that yet.",
                spokenResponse="I don't know how to do that yet.",
                dryRun=dry_run,
            )

        spec = tool.spec
        label = spec.action_label or spec.name

        if not _validate_arguments(spec, call.arguments):
            return ActionResponse(
                status="unhandled",
                action="none",
                message="I didn't catch a command I can run yet.",
                spokenResponse="I didn't catch a command I can run yet.",
                dryRun=dry_run,
            )

        context = _tool_context(
            executor, clock, roots, dry_run, ops, file_search
        )
        prepared = _prepare_tool(tool, call.arguments, context)
        if prepared.outcome is not None:
            return _outcome_response(prepared.outcome, dry_run)

        if spec.requires_confirmation and not dry_run:
            plan_id = pending.create(spec.name, prepared.arguments)
            message = prepared.message or _pending_message(spec.description)
            return ActionResponse(
                status="pending",
                action=label,
                message=message,
                spokenResponse=message,
                planId=plan_id,
                risk=spec.risk,
                requiresConfirmation=True,
                dryRun=dry_run,
                target=prepared.display,
            )

        outcome = _run_tool(
            tool_registry, spec.name, prepared.arguments, context
        )
        plan_id = None
        if outcome.can_undo and not dry_run:
            plan_id = pending.create(spec.name, prepared.arguments)
            pending.mark_done(plan_id, outcome)
        return _outcome_response(outcome, dry_run, plan_id=plan_id)

    @application.post("/act/confirm", response_model=ActionResponse)
    async def confirm(request: ConfirmRequest) -> ActionResponse:
        record = pending.get(request.planId)
        if record is None or record.state == "cancelled":
            raise HTTPException(status_code=404, detail="Unknown or expired plan.")

        if not request.approved:
            pending.cancel(request.planId)
            return ActionResponse(
                status="cancelled",
                action="none",
                message="Cancelled.",
            )

        tool = tool_registry.get(record.tool)
        if tool is None:
            raise HTTPException(status_code=404, detail="Unknown tool for plan.")

        if record.state != "done":
            context = _tool_context(
                executor, clock, roots, False, ops, file_search
            )
            outcome = _run_tool(
                tool_registry, record.tool, record.arguments, context
            )
            pending.mark_done(request.planId, outcome)

        stored = pending.get(request.planId)
        outcome = stored.outcome if stored is not None else None
        if outcome is None:
            raise HTTPException(status_code=409, detail="Plan has no result.")
        return ActionResponse(
            status="ok",
            action=tool.spec.action_label or tool.spec.name,
            message=outcome.message,
            dryRun=False,
            canUndo=bool(tool.spec.undo),
            target=outcome.target,
        )

    @application.post("/act/undo", response_model=ActionResponse)
    async def undo(request: UndoRequest) -> ActionResponse:
        record = pending.get(request.planId)
        if record is None:
            raise HTTPException(status_code=404, detail="Unknown or expired plan.")

        tool = tool_registry.get(record.tool)
        outcome = pending.undo_info(request.planId)
        if (
            tool is None
            or outcome is None
            or tool.spec.undo is None
            or outcome.target is None
        ):
            raise HTTPException(status_code=409, detail="Nothing to undo.")

        _run_undo(tool.spec.undo, outcome.target, ops)
        pending.cancel(request.planId)
        return ActionResponse(status="ok", action="undo", message="Undone.")

    @application.post("/screen/ask", response_model=ScreenAnswerResponse)
    async def screen_ask(request: ScreenAskRequest) -> ScreenAnswerResponse:
        mime_type = _detect_image_type(request.image)
        started = time.perf_counter()

        try:
            vision = vision_client or _default_vision_client()
            answer = await vision.answer(
                question=request.question,
                image_base64=request.image,
                mime_type=mime_type,
                marked=request.marked,
            )
        except VisionNotConfiguredError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except VisionQuotaError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except VisionProviderError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Vision provider failed ({type(exc).__name__}).",
            ) from exc

        if not isinstance(answer, str) or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail="Vision provider returned an empty answer.",
            )

        answer = answer.strip()
        latency_ms = max(0, int((time.perf_counter() - started) * 1000))
        return ScreenAnswerResponse(
            answer=answer,
            model=_vision_model(vision),
            latencyMs=latency_ms,
        )

    @application.get("/mcp/status", response_model=McpStatusResponse)
    async def mcp_status() -> McpStatusResponse:
        if manager is None:
            return McpStatusResponse(enabled=False, servers=[])
        return McpStatusResponse(
            enabled=True,
            servers=[_server_status(status) for status in manager.statuses],
        )

    if manager is not None:
        application.router.add_event_handler("shutdown", manager.close)

    return application


def _provider_name() -> str:
    provider = os.getenv("KESTREL_ASR_PROVIDER", DEFAULT_PROVIDER).strip().lower()
    return provider if provider in SUPPORTED_PROVIDERS else DEFAULT_PROVIDER


def _provider_configured(provider: str) -> bool:
    if provider == "fake":
        return True
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def _default_transcriber(provider: str) -> Transcriber:
    if provider == "fake":
        return FakeTranscriber.from_env()
    return GroqTranscriber.from_env()


def _is_supported_content_type(value: str) -> bool:
    media_type = value.split(";", 1)[0].strip().lower()
    return media_type.startswith("audio/") or media_type == "application/octet-stream"


async def _read_audio(request: Request) -> bytes:
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MAX_AUDIO_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Audio body must be at most 10 MiB.",
                )
        except ValueError:
            pass

    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio body must be at most 10 MiB.",
            )

    if not audio:
        raise HTTPException(status_code=400, detail="Audio body is empty.")
    return bytes(audio)


def _detect_image_type(image: str) -> str:
    """Validate raw base64 and detect PNG/JPEG from magic bytes only."""
    # Base64 expands by 4/3. Reject an obviously oversized payload before
    # allocating the decoded bytes; exact validation still happens below.
    max_encoded_length = 4 * ((MAX_SCREEN_IMAGE_BYTES + 2) // 3)
    if len(image) > max_encoded_length:
        raise HTTPException(
            status_code=413,
            detail="Screenshot must be at most 12 MiB.",
        )

    try:
        decoded = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail="Image must be valid base64."
        ) from exc

    if not decoded:
        raise HTTPException(status_code=422, detail="Image must not be empty.")
    if len(decoded) > MAX_SCREEN_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Screenshot must be at most 12 MiB.",
        )
    if decoded.startswith(PNG_SIGNATURE):
        return "image/png"
    if decoded.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    raise HTTPException(
        status_code=415, detail="Image must be PNG or JPEG."
    )


def _default_vision_client() -> VisionClient:
    return GroqVisionClient.from_env()


def _vision_model(client: VisionClient) -> str:
    model = getattr(client, "model", "")
    if isinstance(model, str) and model.strip():
        return model
    configured = os.getenv("KESTREL_GROQ_VISION_MODEL", "").strip()
    return configured or DEFAULT_VISION_MODEL


def _provider_failure_detail(exc: Exception) -> str:
    if isinstance(exc, TranscriptionProviderError):
        return str(exc)
    return f"Transcription provider failed ({type(exc).__name__})."


def _action_dry_run() -> bool:
    raw = os.getenv("KESTREL_ACTION_DRY_RUN", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _mcp_enabled() -> bool:
    raw = os.getenv("KESTREL_MCP_ENABLED", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _tool_retrieval_enabled() -> bool:
    """Tool retrieval is on by default; only explicit falsy values turn it off."""
    raw = os.getenv("KESTREL_TOOL_RETRIEVAL", "").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _mcp_config_path() -> Path:
    override = os.getenv("KESTREL_MCP_CONFIG", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent / "mcp_servers.json"


def _server_status(status: McpServerStatus) -> McpServerStatusResponse:
    return McpServerStatusResponse(
        name=status.name,
        ok=status.ok,
        toolCount=status.tool_count,
        error=status.error,
    )


def _setup_mcp(
    manager: McpManager | None,
    registry: ToolRegistry,
) -> McpManager | None:
    """Connect MCP servers, register their tools, or skip when disabled.

    An explicitly injected ``manager`` always runs (tests and embedding);
    otherwise MCP is only active when ``KESTREL_MCP_ENABLED`` is set, so a
    plain test run never spawns a server process. A missing config file simply
    yields no servers, and connection failures are reported through
    ``/mcp/status`` rather than raised here.
    """
    if manager is None:
        if not _mcp_enabled():
            return None
        configs = load_server_configs(_mcp_config_path())
        manager = McpManager(configs)
    manager.connect()
    for tool in manager.tools:
        registry.register(tool)
    return manager


def _tool_context(
    executor: ActionExecutor,
    clock: Callable[[], datetime],
    file_roots: tuple[Path, ...],
    dry_run: bool,
    file_ops: FileOps,
    file_search: FileSearch,
) -> ToolContext:
    return ToolContext(
        executor=executor,
        clock=clock,
        file_roots=file_roots,
        dry_run=dry_run,
        file_ops=file_ops,
        file_search=file_search,
    )


def _run_tool(
    registry: ToolRegistry,
    tool_name: str,
    arguments: dict,
    context: ToolContext,
) -> ToolOutcome:
    tool = registry.get(tool_name)
    if tool is None:
        raise HTTPException(status_code=502, detail=f"Unknown tool '{tool_name}'.")
    try:
        return tool.run(arguments, context)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Action '{tool_name}' failed ({type(exc).__name__}).",
        ) from exc


def _prepare_tool(
    tool: object,
    arguments: dict,
    context: ToolContext,
) -> ToolPreparation:
    """Run a tool's optional pre-flight step before confirmation is requested."""
    prepare = getattr(tool, "prepare", None)
    if not callable(prepare):
        return ToolPreparation(dict(arguments))
    return prepare(dict(arguments), context)


def _outcome_response(
    outcome: ToolOutcome, dry_run: bool, plan_id: str | None = None
) -> ActionResponse:
    return ActionResponse(
        status=outcome.status,
        action=outcome.action,
        message=outcome.message,
        text=outcome.text,
        dryRun=dry_run,
        risk=outcome.risk,
        requiresConfirmation=outcome.requires_confirmation or None,
        planId=plan_id,
        results=list(outcome.results) if outcome.results is not None else None,
        canUndo=outcome.can_undo or None,
        target=outcome.target,
        card=outcome.card,
        spokenResponse=outcome.spoken_response or outcome.message,
    )


def _validate_arguments(spec: ToolSpec, arguments: object) -> bool:
    """Reject model-supplied arguments that do not fit the tool's schema.

    Arguments now come from a language model, so treat them as untrusted: a
    missing required key, an unknown key, a wrong type, or a value outside the
    declared enum is a planning miss, not an execution failure.
    """
    if not isinstance(arguments, dict):
        return False

    properties = spec.parameters.get("properties", {})
    for key in spec.parameters.get("required", []):
        if key not in arguments:
            return False

    for key, value in arguments.items():
        prop = properties.get(key)
        if not isinstance(prop, dict):
            return False
        if prop.get("type") == "string" and not isinstance(value, str):
            return False
        allowed = prop.get("enum")
        if isinstance(allowed, list) and value not in allowed:
            return False
    return True


def _pending_message(description: str) -> str:
    trimmed = description.rstrip().rstrip(".")
    if not trimmed:
        return "Approval needed."
    body = trimmed[0].lower() + trimmed[1:]
    return f"Ready to {body}. Approval needed."


def _run_undo(undo_tool: str, target: str, file_ops: FileOps) -> None:
    if undo_tool != "remove_created":
        raise HTTPException(
            status_code=409, detail=f"No undo handler for '{undo_tool}'."
        )
    try:
        file_ops.remove_created(target)
    except OSError as exc:
        raise HTTPException(
            status_code=409, detail=f"Undo failed ({type(exc).__name__})."
        ) from exc


def _build_planner(
    planner: Planner | None,
    registry: ToolRegistry,
    clock: Callable[[], datetime],
) -> Planner:
    if planner is not None:
        return planner
    if _groq_key_present():
        selector = selector_from_env() if _tool_retrieval_enabled() else None
        return FallbackPlanner(
            GroqPlanner(
                registry,
                resilient_from_env(),
                selector=selector,
            ),
            RulePlanner(clock),
        )
    return RulePlanner(clock)


def _planner_provider(planner: Planner) -> str:
    if isinstance(planner, (FallbackPlanner, GroqPlanner)):
        return "groq"
    return "rule"


def _planner_model(provider: str) -> str:
    if provider == "groq":
        return os.getenv("KESTREL_GROQ_MODEL") or DEFAULT_GROQ_MODEL
    return "rules"


def _groq_key_present() -> bool:
    return bool(
        os.getenv("KESTREL_GROQ_API_KEY", "").strip()
        or os.getenv("GROQ_API_KEY", "").strip()
    )


def _default_file_roots() -> tuple[Path, ...]:
    raw = os.getenv("KESTREL_FILE_ROOTS", "").strip()
    if raw:
        return tuple(
            Path(part.strip()) for part in raw.split(",") if part.strip()
        )
    return (Path.home() / "Documents",)


app = create_app()
