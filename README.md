# VoiceOS

A Windows voice agent. Hold **Ctrl+Space**, speak, release. A notch drops from the top of the screen, transcribes you locally, runs the command, shows the answer, and speaks it back without stealing focus from the app you are using.

`Kestrel` is the internal codename. It appears in `KESTREL_*` env vars, `com.kestrel.desktop`, and `kestrel-*.json` files. The product is VoiceOS.

## What it does

- **Open** apps: "open Notepad", "open Calculator"
- **Type** into the focused app: "type hello world"
- **Search** the web or local files: "search the web for ...", "find my files named invoice"
- **Answer** simple questions: time, date, weather
- **See** the screen: ask "what's on my screen", or hold the key and circle something
- **Act** in connected apps: Google Calendar, Gmail, Google Drive, Notion
- **Files**: create folders/files, delete to the Recycle Bin with confirmation

## How it works

1. `globalShortcut` reserves the chord for the app's lifetime. A low-level `uiohook-napi` hook detects press/release and Esc, and ignores auto-repeat.
2. `PushToTalk` waits 300 ms. A shorter tap does nothing; a hold opens the notch and the mic.
3. Audio stays in memory and streams to a local **NVIDIA Nemotron** engine over a loopback WebSocket. Partial transcripts update live. Audio is never uploaded.
4. On release, the final transcript goes to the app's in-process API (`POST /act`). The planner uses Groq when configured, otherwise a deterministic rule set, then runs one tool.
5. Results render in the notch and are spoken with local **Kokoro** TTS. Esc cancels. The notch hides itself.

The notch is a transparent, frameless, always-on-top window shown with `showInactive()`. A second full-screen overlay captures circling/drawing while the key is held.

## Codebase

```text
apps/desktop   Electron app. All live behavior.
  src/main       hotkey, push-to-talk, ASR, TTS, assistant, local API, windows
  src/renderer   dashboard, notch, overlay, sidebar (React)
  src/shared     IPC types and shared constants
apps/api       Optional Express + Postgres service for auth user sync
scripts/       PowerShell end-to-end smoke tests
```

Key files: `src/main/index.ts` (wiring), `notch-controller.ts` (turn flow), `assistant/service.ts` (planner), `assistant/tools.ts` (actions), `src/shared/types.ts` (IPC), `src/renderer/src/App.tsx` (dashboard).

The assistant API (`127.0.0.1:8765`) runs inside Electron. The separate Express API (`:3001`) only mirrors a signed-in user into Postgres.

## Run

Requirements: Windows 10/11, Node 22.17.1 (`.nvmrc`), a microphone, and the local speech model.

```powershell
nvm use 22.17.1
npm install
npm install --prefix apps/desktop
npm run dev:desktop
```

ASR expects `%LOCALAPPDATA%\Kestrel\bin\nemo-speech\` and a Nemotron GGUF under `%LOCALAPPDATA%\Kestrel\models\`. To run the app without the model, set `KESTREL_ASR_MODE=fake`.

Desktop production build: `npm run build:desktop`, then `npm --prefix apps/desktop start`. The API is optional: `npm run dev:api` (needs `DATABASE_URL`).

## Tests

```powershell
npm run test:desktop
npm run test:api
npm run build:desktop
powershell -ExecutionPolicy Bypass -File .\scripts\notch-smoke.ps1   # fake ASR, real mic
```

## Current state

- Only the Ctrl+Space notch flow is live. The Dictation and Agent tabs and most Settings tabs are UI mocks.
- Windows only. No installer or auto-update yet.
- Legacy dictation code remains under `apps/desktop/src/main/dictation/` and `apps/desktop/legacy/`; the notch path does not use it.

See `AGENTS.md` for the TDD and subagent workflow used in this repo.
