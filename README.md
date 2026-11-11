# Kestrel

Windows voice agent. Working codename; final brand TBD.

Hold **`Ctrl + Space`** and speak. A notch slides down from the top center of the screen with a live transcript. Release, and the final words are transcribed locally and sent to the app's local API, which performs the action. A tap shorter than **0.3 s** does nothing. **Esc** cancels. The notch never takes focus.

## How it works

1. `globalShortcut` reserves the chord for the app's lifetime, so the focused app never receives it.
2. A low-level `uiohook` hook detects press and release, ignores keyboard auto-repeat, and handles Esc.
3. `PushToTalk` waits 300 ms before starting. A shorter tap shows no notch, opens no microphone, and starts no turn.
4. The notch window is transparent, frameless, `focusable: false`, always on top, and shown with `showInactive()`. It listens for PCM only while the turn is active.
5. Partial transcripts stream from a local NVIDIA Nemotron engine over a loopback WebSocket. Releasing commits the turn; the final transcript is produced locally in a few hundred milliseconds.
6. The transcript is posted to the app's local API (`POST /act` by default at `http://127.0.0.1:8765`).
7. A rule-based planner opens apps, searches the web, answers time/date, or returns text to type. For `type`, the desktop pastes the text into the app that still has focus.
8. The result or error appears in the notch, which then hides itself.

## Status

The automated **fake-ASR notch smoke passes** on this machine. It verifies:

- the app reserves `Ctrl + Space` and starts its low-level hook;
- a tap under 0.3 s shows no notch and starts no session;
- a hold shows the notch without stealing focus, then produces live partials and a final transcript;
- `Space` never reaches the focused target app while the chord is held;
- `/act` returns a dry-run `type` action and the exact text lands in the target;
- Esc cancels a live hold with no transcript and no action;
- the notch hides after the result;
- no audio file or audio payload is written anywhere the smoke inspects.

The local **NVIDIA Nemotron** streaming engine was benchmarked with synthesized speech: partials arrive roughly 200 ms behind the audio, and the final transcript lands about 300 ms after release. A 3-second clip fed at full speed finalized in about 1 second including model work. Real-microphone accuracy and latency across apps are not yet measured formally.

Not done yet:

- A packaged installer. The current build runs from the repo; bundling the engine and its ~700 MB model would need an `extraResources` rule or a first-run downloader.
- A wider action set. The planner is deliberately small and deterministic.
- Real-ASR manual matrix numbers (accuracy, p95 keyup-to-action).

## Requirements

- Windows 10/11
- Node.js **22.12+**. `.nvmrc` pins 22.17.1; nvm-windows needs the version passed explicitly (`nvm use 22.17.1`).
- A microphone
- About 1 GB free for the local engine and speech model

## Setup

Install desktop dependencies from the repository root:

```powershell
nvm use 22.17.1
npm install
```

### Local speech recognition

Kestrel uses NVIDIA's Nemotron streaming ASR through
[NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp). Both the engine
and the model live under one per-user root:

```text
%LOCALAPPDATA%\Kestrel\
├─ bin\nemo-speech\bin\nemo-speech.exe   (plus DLLs, lib\, share\)
└─ models\nemotron-speech-streaming-en-0.6b.q8_0.gguf   (~700 MB)
```

On this machine `%LOCALAPPDATA%\Kestrel` is a junction to `D:\Kestrel`, so the
model stays off the system drive while the default app paths keep working.

Install or repair it with:

```powershell
$home = Join-Path $env:LOCALAPPDATA 'Kestrel'
New-Item -ItemType Directory -Force "$home\bin", "$home\models" | Out-Null

curl.exe -L --fail -o "$home\bin\nemo-speech.zip" `
  https://github.com/NVIDIA/NeMo-Speech.cpp/releases/download/v0.3.0/nemo-speech-0.3.0-windows-x86_64-cpu.zip
Expand-Archive "$home\bin\nemo-speech.zip" -DestinationPath "$home\bin\nemo-temp" -Force
New-Item -ItemType Directory -Force "$home\bin\nemo-speech" | Out-Null
Move-Item "$home\bin\nemo-temp\nemo-speech-0.3.0-windows-x86_64-cpu\*" "$home\bin\nemo-speech" -Force
Remove-Item "$home\bin\nemo-temp" -Recurse -Force

curl.exe -L --fail -o "$home\models\nemotron-speech-streaming-en-0.6b.q8_0.gguf" `
  https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b/resolve/main/nemotron-speech-streaming-en-0.6b.q8_0.gguf
```

Verify the downloads:

```powershell
Get-FileHash "$home\bin\nemo-speech.zip" -Algorithm SHA256
# 4ed9740e361e4653f56c3dce7d1e81883a1c8b831c1bd7d01567fff1130b5b05

Get-FileHash "$home\models\nemotron-speech-streaming-en-0.6b.q8_0.gguf" -Algorithm SHA256
# d9a01898d2a611c8764e23a1c2f45e70bbd5a425dc4de93692ac951dd603812d

& "$home\bin\nemo-speech\bin\nemo-speech.exe" doctor
```

At startup the app launches `nemo-speech serve` on a free loopback port and
keeps the model loaded between turns. Audio is streamed as raw PCM16 over
`127.0.0.1` only; the engine resamples to its 16 kHz input rate. Nothing is
written to disk, and the process stops when Kestrel quits. No cloud service,
API key, or per-token cost is involved in the notch path.

### Local API

The app hosts the action API in-process on `127.0.0.1:8765` (override the base
URL with `KESTREL_API_URL`). There is no separate backend to start: the server
binds to localhost only, and it stops when the app quits. It serves `/health`,
`/act`, `/act/confirm`, `/act/undo`, `/screen/ask`, the OAuth `/callback`, and
the legacy `/transcribe` endpoint.

The legacy `/transcribe` endpoint still supports a deterministic `fake` provider and a Groq provider, but the notch flow now transcribes locally and does not call it.

### Run the desktop app

```powershell
npm run dev
```

Or a production build:

```powershell
npm run build
npm start
```

On first run Kestrel opens its main window. Afterwards it starts hidden in the tray. Closing the window hides it; quit from the tray menu to release the hotkey and stop the speech server.

## Usage

| Gesture | Result |
|---|---|
| Tap `Ctrl + Space` (< 0.3 s) | Nothing: no notch, no microphone, no action |
| Hold `Ctrl + Space` (>= 0.3 s) | Notch appears, live transcript updates, microphone records in memory |
| Release either key | Final local transcript is sent to `/act`; the action runs |
| Esc while holding | Cancels the turn immediately; no transcript, no action |

The notch never takes focus, so typing and window focus stay where they were. Results hide after about 2 s; errors after about 3.5 s.

## Configuration

Open the main window from the tray and use the **Settings** card.

- **Shortcut**: modifiers (`Control`, `Ctrl`, `Alt`, `Shift`, `Meta`/`Win`) plus `A-Z`, `0-9`, or `Space`, or a bare `F1-F12`. Examples: `Control+Space`, `Alt+F8`, `Ctrl+Shift+K`. A plain unmodified letter or digit is rejected.
- **Speech engine**: `NVIDIA Nemotron` (local, default) or `Fake transcript` (smoke tests).

Windows sometimes refuses a chord because an IME, IDE, or launcher already owns it. Kestrel then shows the main window with the error and a **Retry** button. Changing the shortcut attempts to reserve the new chord first; if that fails, the previous working chord stays active.

Settings are stored at `%APPDATA%\@kestrel\desktop\kestrel-settings.json` for repo runs (override with `KESTREL_SETTINGS_PATH`). Only configuration is written; audio and transcripts are never persisted.

### Environment variables

| Variable | Read by | Default | Purpose |
|---|---|---|---|
| `KESTREL_API_URL` | desktop | `http://127.0.0.1:8765` | Base URL of the app's local action API |
| `KESTREL_ASR_MODE` | desktop | settings | Force `nemo` or `fake` for the notch path (legacy `whisper` maps to `nemo`) |
| `KESTREL_HOME` | desktop | `%LOCALAPPDATA%\Kestrel` | Install root for the engine and model |
| `KESTREL_NEMO_EXECUTABLE` | desktop | `<home>\bin\nemo-speech\bin\nemo-speech.exe` | Override the engine executable |
| `KESTREL_NEMO_MODEL` | desktop | `<home>\models\nemotron-speech-streaming-en-0.6b.q8_0.gguf` | Override the model file |
| `KESTREL_FAKE_TRANSCRIPT` | desktop | `open notepad` | Text the fake transcriber returns (the legacy `/transcribe` fake default is `Fake transcription from Kestrel.`) |
| `KESTREL_SETTINGS_PATH` | desktop | userData path | Alternate settings file, used by the smoke |
| `KESTREL_ACTION_DRY_RUN` | desktop | `0` | `1` plans actions without launching apps or URLs |
| `KESTREL_ASR_PROVIDER` | desktop | `groq` | Legacy `/transcribe` provider: `fake` or `groq` |
| `GROQ_API_KEY` | desktop | unset | Enables the Groq planner (natural-language commands) and optional cloud ASR |
| `KESTREL_GROQ_API_KEY` | desktop | unset | Alias for `GROQ_API_KEY` |
| `KESTREL_GROQ_MODEL` | desktop | `openai/gpt-oss-20b` | Groq model to try first (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b` fallbacks) |
| `KESTREL_GROQ_BASE_URL` | desktop | `https://api.groq.com/openai/v1` | Override the Groq base URL (tests or a proxy) |
| `KESTREL_FILE_ROOTS` | desktop | `~/Documents` | Comma-separated folders the file tools may search |
| `KESTREL_MCP_ENABLED` | desktop | `0` | `1` connects the MCP integrations in `apps/desktop/mcp_servers.json` |
| `KESTREL_MCP_CONFIG` | desktop | `apps/desktop/mcp_servers.json` | Override the MCP server config path |
| `KESTREL_GIT_REPO` | desktop | unset | Local repository the Git tools operate on |
| `GITHUB_MCP_TOKEN` | desktop | unset | GitHub token for the GitHub integration |
| `NOTION_TOKEN` | desktop | unset | Notion integration token |

The Groq key is optional. With no key, Kestrel uses the deterministic
rule planner; with a key, natural phrasing ("could you please open the
calculator for me") is handled by Groq via LPU inference. Only the transcript and the tool
list are sent — never audio or file contents. If a model is overloaded or out
of quota, Kestrel tries the next in a short chain (with a cooldown on the
exhausted one) so a single bad response never drops the command.

### Git, GitHub, and Notion (MCP)

Set `KESTREL_MCP_ENABLED=1` to let Kestrel drive three services through MCP
servers declared in `apps/desktop/mcp_servers.json` (copy
`apps/desktop/mcp_servers.json.example`). Tokens sit in `apps/desktop/.env.local`
(`GITHUB_MCP_TOKEN`, `NOTION_TOKEN`) and the Git tools point at the repository
in `KESTREL_GIT_REPO`. Read-only tools run immediately; anything that changes
state asks for confirmation first. `GET /mcp/status` shows each server's
connection. A server with a missing or invalid token simply reports an error
and the others keep working. Each server lists a short `tools` allowlist so the
planner's one-shot request fits Groq's free-tier 8000 tokens-per-minute cap. See
`apps/desktop/mcp_servers.json.example` for the full setup.

## Actions

| Say | Action |
|---|---|
| "open Notepad" / Calculator / Chrome / any installed app | Opens it. Kestrel resolves the name against Windows' App Paths, Start menu, Store apps, and PATH; if it is not installed it says so |
| "search the web for Kestrel" (or "google ...") | Opens a Google search in the default browser |
| "type hello world" / "write ..." / "insert ..." | Pastes the remainder into the focused app |
| "what time is it" / "what's today's date" | Shows the answer in the notch |
| "find my files named invoice" / "search my files for budget" | Lists matching files from the allowed folders (Groq planner) |
| "create a folder called Invoices" | Records a write action awaiting confirmation (approval UI still to come) |
| Anything else | Returns a clear "I didn't catch a command" message in the notch |

## Tests

```powershell
npm test            # desktop Vitest suite
npm run smoke:notch # production build + end-to-end notch smoke
```

### `npm run smoke:notch`

This is the automated proof for the notch flow. It uses the **fake** ASR provider, the **real microphone**, a test-only API port (`8791`), and `KESTREL_ACTION_DRY_RUN=1`.

It launches Kestrel with an isolated settings file plus a separate WinForms target, then checks:

- API health reports `provider=fake` and `configured=true`;
- the configured chord is registered and the low-level hook is running;
- the main window hides to the tray;
- a tap under 0.3 s creates no notch, no session, and no focus change;
- a hold shows the notch while the target keeps the foreground;
- partial and final transcripts are produced in memory;
- `/act` returns a dry-run `type` action and the exact text is pasted into the target;
- Space keydown never reaches the target during the hold;
- Esc cancels without a final transcript or action;
- the notch hides after the result;
- no audio file, base64 payload, or audio data URL appears in the checked locations or the app log.

Artifacts:

- `logs/notch-smoke.log` - app process log
- `logs/notch-smoke-console.log` - smoke console transcript
- `logs/notch-window.png` - screenshot of the live notch

A microphone is required. No model or network request is used by the smoke.

## Privacy

- The microphone is opened when a turn starts and its tracks are stopped when the turn ends. A one-time device check at launch opens and immediately releases it. Kestrel does not hold the mic open while idle.
- PCM lives in renderer and main-process memory. It is streamed to the local NVIDIA engine over a loopback WebSocket and is never written to disk.
- In Nemotron mode no audio or transcript leaves the machine.
- The app's local API receives only the final text on `/act`. There is no transcript database.
- The main window keeps the recent notch activity in memory for display; it is not persisted.
- A `type` action copies the text to the clipboard before pasting. The clipboard keeps it until something else replaces it, as with any paste.

## Troubleshooting

**The shortcut does not register.** The chord may be claimed by an IME, IDE completion, or a launcher. Kestrel warns you and offers Retry. Pick a different chord in Settings. While the chord cannot be reserved, the low-level hook can still detect holds, but the focused app may also see the keypress.

**"Speech recognition is not ready yet" or ASR offline.** Confirm `nemo-speech.exe` and the model exist at the paths above, then run `nemo-speech.exe doctor`. Check the app log for `[nemo]` or `[asr]` errors. For pipeline testing without the engine, set `KESTREL_ASR_MODE=fake`.

**Action fails with `fetch failed`.** The app hosts the local API in-process. Check `http://127.0.0.1:8765/health` while the app runs; if the action still fails, look for `[assistant]` errors in the app log.

**No microphone.** Allow desktop apps to use the microphone in Windows Settings -> Privacy & security -> Microphone. A capture failure appears in the notch.

**Paste lands in the wrong place or does nothing.** Windows blocks synthetic input into elevated apps from a non-elevated process. Keep Kestrel and the target at the same integrity level; running Kestrel elevated is not recommended.

**The app must stay running.** Closing the window hides it to the tray. Quitting from the tray stops the hotkey, the key hook, and the speech server.

## Notes and limits

- No installer, auto-update, auth, or transcript history yet.
- The planner is a small rule set, not a language model. Unknown commands return an unhandled message.
- The notch uses Electron's transparent, non-focusable window with `showInactive()`. It is deliberately not clickable.
- The old batch dictation modules remain under `apps/desktop/src/main/dictation/` and `apps/desktop/legacy/` for reference. The notch path does not use them.
- The legacy Groq `/transcribe` endpoint remains in the API but is unused by the notch path.
