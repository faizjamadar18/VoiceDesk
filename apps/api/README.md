# Kestrel API

Minimal FastAPI backend for Day 2 dictation: health check plus in-memory
speech-to-text. Audio is held in memory only — no temp files, database, or
audio bytes in logs.

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
| `GROQ_API_KEY` | unset | Required when the provider is `groq` |
| `KESTREL_FAKE_TRANSCRIPT` | `Fake transcription from Kestrel.` | Text returned by the fake provider |
| `KESTREL_FAKE_DELAY_MS` | `0` | Artificial fake-provider latency in milliseconds |

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

## Tests

```powershell
python -m pytest -q
```

Tests use `fastapi.testclient.TestClient` and never call the real Groq API.

## Privacy

- Audio bytes stay in process memory and are discarded after the request.
- No temp files, database writes, or audio logging.
- With the fake provider, no network request is made.
