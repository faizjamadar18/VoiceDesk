# Kestrel API

FastAPI backend for Kestrel: speech-to-text, action planning, local tools,
and Screen Q&A. Audio and screenshots are held in memory only — no temp files,
database, or content logging.

## Setup

From the repo root:

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

## Run

```powershell
$env:KESTREL_ASR_PROVIDER = "fake"
python -m uvicorn app.main:app --reload --port 8765
```

With the fake provider running, try it:

```powershell
curl.exe http://127.0.0.1:8765/health
curl.exe -X POST http://127.0.0.1:8765/transcribe -H "Content-Type: audio/wav" --data-binary "test-audio"
```

For Groq:

```powershell
$env:KESTREL_ASR_PROVIDER = "groq"
$env:GROQ_API_KEY = "your-key"
python -m uvicorn app.main:app --port 8765
```

When `KESTREL_ASR_PROVIDER=groq`, the audio is sent to Groq's transcription
API. The key stays server-side.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `KESTREL_ASR_PROVIDER` | `groq` | `fake` or `groq` |
| `GROQ_API_KEY` | unset | Enables the Groq planner and vision client (and is required when ASR provider is `groq`) |
| `KESTREL_GROQ_API_KEY` | unset | Alias for `GROQ_API_KEY` |
| `KESTREL_GROQ_MODEL` | `openai/gpt-oss-20b` | Groq model to try first (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b` fallbacks) |
| `KESTREL_GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | Vision model used by `/screen/ask` |
| `KESTREL_GROQ_VISION_TIMEOUT_SECONDS` | `30` | Timeout for one vision request |
| `KESTREL_GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | Override the Groq base URL |
| `KESTREL_FILE_ROOTS` | `~/Documents` | Comma-separated folders for folder creation and the direct-scan test fallback |
| `KESTREL_ACTION_DRY_RUN` | `0` | `1` plans actions without launching apps or URLs |
| `KESTREL_MCP_ENABLED` | `0` | `1` connects the MCP servers in `mcp_servers.json` and exposes their tools |
| `KESTREL_MCP_CONFIG` | `apps/api/mcp_servers.json` | Override the MCP server config path |
| `NOTION_TOKEN` | unset | Notion integration token for the Notion MCP server |
| `KESTREL_TOOL_RETRIEVAL` | `1` | `0` sends every tool; `1` narrows MCP tools to the top-K for each transcript |
| `KESTREL_EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Local model used to rank MCP tools |
| `KESTREL_TOOL_TOP_K` | `10` | Max non-built-in tools kept per planner request |

When a Groq model returns a quota error (`429`), it is skipped for a short
cooldown and the next model in the chain is tried immediately; transient
failures (timeouts, `5xx`) are retried on the same model once.

## API

### `GET /health`

```json
{"status":"ok","provider":"fake","configured":true}
```

`configured` is `true` for the fake provider and for Groq when
`GROQ_API_KEY` is set.

### `POST /transcribe`

Send the raw audio bytes as the request body. Supported `Content-Type` values
are `audio/*` and `application/octet-stream`. Do not use multipart form data.

| Condition | Status |
|---|---|
| Success | `200` |
| Missing/empty body | `400` |
| Body over 10 MiB | `413` |
| Unsupported `Content-Type` | `415` |
| Provider failure | `502` |
| `groq` selected without `GROQ_API_KEY` | `503` |

Success response:

```json
{"text":"Fake transcription from Kestrel.","provider":"fake","latencyMs":12}
```

Errors use FastAPI's shape: `{"detail":"..."}`.

The Groq adapter calls
`https://api.groq.com/openai/v1/audio/transcriptions` with
`whisper-large-v3-turbo`, a 30-second timeout, and a multipart `file` part
containing the raw audio.

### `GET /planner`

Reports which planner is active.

```json
{"provider":"groq","configured":true,"model":"openai/gpt-oss-20b"}
```

`provider` is `groq` when `GROQ_API_KEY` (or `KESTREL_GROQ_API_KEY`) is
set, otherwise `rule`.

### `GET /mcp/status`

Reports whether MCP is enabled and how each configured server connected.

```json
{
  "enabled": true,
  "servers": [
    {"name": "notion", "ok": true, "toolCount": 13, "error": null}
  ]
}
```

`enabled` is `false` and `servers` is empty when `KESTREL_MCP_ENABLED` is not
set. A server that failed to start is reported with `ok: false` and an `error`
message; the rest of Kestrel still works. `ok: true` means the server started
and listed its tools — some servers (Notion) only check a token when a tool is
actually called, so a bad token shows up as a tool error rather than here.

### `POST /act`

Turns a transcript into an action. Read tools run immediately; write tools are
recorded as pending a confirmation.

Request: `{"transcript":"open calculator"}`

Response: `status` (`ok`, `unhandled`, `pending`, `cancelled`, or `error`),
`action`, and `message`, plus optional `spokenResponse`, `risk`,
`requiresConfirmation`, `planId`, `results`, `canUndo`, `target`, and `card`.
`spokenResponse` is the final answer the desktop notch speaks aloud.

Model-supplied arguments are validated against each tool's schema, so an
ill-formed call returns `unhandled` instead of a `5xx`.

`open_app` accepts any installed Windows app, not a fixed list. Kestrel
resolves the spoken name against the App Paths registry, Start menu and
desktop shortcuts, the Start apps list (Microsoft Store apps), and the
executable search path. A name it cannot find returns `status` `error` with
`"<App> is not installed on this PC."` as the message and `spokenResponse`.
Packaged apps are launched through their Start app id rather than their
`WindowsApps` executable.

For screen questions, the Groq planner can choose the planner-only
`look_at_screen` tool. `/act` then returns
`{"status":"ok","action":"look_at_screen","message":"","spokenResponse":null}`.
The desktop captures the screen and calls `/screen/ask`; the model never sees
that tool in its executable registry.

File searches go through Windows Search (`SYSTEMINDEX`); query tokens match
file names and folder paths, and system/app directories such as `Windows`,
`Program Files`, `AppData`, and `node_modules` are excluded. If Windows Search
is unavailable, `/act` returns an `error` status with no file results. Tests
that pass explicit `file_roots` to `create_app` keep using the bounded direct
scan.

### `POST /screen/ask`

Answers one question about one screenshot. The image is raw base64 without a
`data:` prefix; the backend detects PNG or JPEG from magic bytes and ignores
the client's claimed type.

Request:

```json
{
  "question": "What does this error mean?",
  "image": "<raw base64>",
  "marked": true
}
```

`question` is 1–2000 characters and non-blank. `image` must decode to at most
12 MiB and start with a PNG or JPEG signature. `marked` says whether the
image contains a blue freehand mark.

Success response:

```json
{"answer":"The error says ...","model":"qwen/qwen3.8-27b","latencyMs":1234}
```

| Condition | Status |
|---|---|
| Success | `200` |
| Malformed, blank, or invalid base64 input | `422` |
| Decoded image over 12 MiB | `413` |
| Image is not PNG or JPEG | `415` |
| No Groq key, or the key's vision quota is exhausted | `503` |
| Vision provider failure | `502` |

The Groq vision adapter sends one OpenAI-compatible request to
`POST {KESTREL_GROQ_BASE_URL}/chat/completions` with
`qwen/qwen3.8-27b`, `reasoning_effort: "none"`,
`max_completion_tokens: 220`, temperature `0.2`, and top-p `0.8`.
There are no retries, so one screen question makes at most one vision request.
The prompt tells the model that a blue mark is the primary target, the rest of
the screen is context, and visible text is content rather than instructions.

### `POST /act/confirm` and `POST /act/undo`

Both take `{"planId":"..."}`. `/act/confirm` runs a pending write tool;
`/act/undo` reverses a completed write when the tool declares an undo. Pending
state is in memory only and is lost on restart.

## MCP integrations (Notion)

Kestrel can connect to [MCP](https://modelcontextprotocol.io) servers and give
the planner their tools. This is **off by default** and turns on with
`KESTREL_MCP_ENABLED=1`.

Servers are declared in `apps/api/mcp_servers.json` (created from
`mcp_servers.json.example`; the real file is excluded from version control).
Every string in the file may reference an environment variable as `${VAR}`, so
tokens stay in `.env` and never in the committed config.

| Server | Transport | What it needs |
|---|---|---|
| `notion` | stdio (`npx @notionhq/notion-mcp-server`) | `NOTION_TOKEN` |

Any server that fails to start is listed in `GET /mcp/status` with an error and
does not stop the others.

**Safety.** A tool that the server marks read-only (or that is listed under a
server's `read_only` / `auto_approve` options) runs immediately. A tool that
can change something is routed through the normal confirmation gate, the same
as `delete_file`. Because the Notion server ships no annotations at all, its
mutating tools are named explicitly in `write_tools` so they still ask for
approval.

**Tool allowlist.** A server entry may list `tools` to expose only those tools;
omitting `tools` exposes everything the server advertises. Every server in the
shipped example ships a short curated list so the planner request stays small.

**Request size.** The planner sends every tool to Groq in one request, and the
free tier allows 8000 tokens per minute (TPM). If a request is over the limit
Groq returns HTTP 413; if one tool's schema is rejected it returns HTTP 400,
and the client drops just that tool and retries once.

Tool names are exposed as `{server}_{tool}` (for example
`notion_api_post_search`, `notion_api_post_page`). The planner sees the whole
list and can pick any of them from a spoken command.

## Tool retrieval

To keep the planner request small, Kestrel narrows the tools it sends to the
model before every `/act` call:

- **Built-in tools are always sent.** Core behaviour never depends on
  retrieval.
- **MCP tools are narrowed to the top-K most relevant** for the transcript.
- Ranking uses a local embedding model, `BAAI/bge-small-en-v1.5`, through
  [`fastembed`](https://github.com/qdrant/fastembed) (ONNX, CPU, offline — no
  PyTorch). Tool embeddings are cached, so only the transcript is embedded per
  call.
- If the model is unavailable or fails, Kestrel silently falls back to
  deterministic keyword matching, so planning never breaks.

Three environment variables control it: `KESTREL_TOOL_RETRIEVAL` (default `1`;
`0` disables narrowing), `KESTREL_EMBEDDING_MODEL` (default
`BAAI/bge-small-en-v1.5`), and `KESTREL_TOOL_TOP_K` (default `10`, the max
non-built-in tools kept per request).

## Tests

```powershell
python -m pytest -q
```

Tests use `fastapi.testclient.TestClient` and never call the real Groq API.

## Privacy

- Audio bytes stay in process memory and are discarded after the request.
- Screenshots stay in process memory and are discarded after `/screen/ask`.
- No temp files, database writes, or logging of audio, screenshots, base64,
  or question text.
- With the fake provider, no network request is made.
- Screen questions send the image and question to Groq only for the one vision
  request; there is no retry and no storage. Visible text in a screenshot is
  treated as untrusted content by the prompt.
