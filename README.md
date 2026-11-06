# Kestrel

Windows voice agent. Working codename; final brand TBD.

This repository is currently at **Day 1** of the walking skeleton in [`SKELETON.md`](./SKELETON.md): a minimal Electron app that proves the riskiest integration first — a **global hotkey that summons and focuses the window**.

No microphone, no backend, no AI. Those come only after this passes on the real Windows machine.

## What is in the Day 1 build

- Electron + React + TypeScript shell (`apps/desktop`)
- Global hotkey: **`Ctrl + Alt + Space`**
- Summons the window from the background, including when it is hidden to the tray
- System tray icon: open Kestrel, or quit
- Visible hotkey-registration status
- Focus-check input and a local proof log (window focus is measured in the main process)
- Closing the window hides it to the tray instead of quitting

## Requirements

- Windows 10/11
- Node.js **22.12+** (`nvm use` reads `.nvmrc`, which pins 22.17.1)

## Run it

```powershell
nvm use
npm install
npm run dev
```

For the production preview:

```powershell
npm run build
npm start
```

Typecheck:

```powershell
npm run typecheck
```

## Automated verification

The smoke test launches the production build, hides it to the tray, opens a separate window, forces that window to the foreground, presses the global hotkey, verifies that Kestrel takes focus, types into the input, and checks the typed value through the clipboard.

```powershell
npm run smoke:day1
```

It saves a screenshot of the passing state to `logs/day1-window.png`. This is how Day 1 was verified on this machine; the detailed proof log is also visible in the app.

## Day 1 pass/fail test

Do this on the Windows machine, not in a VM if possible:

1. Launch the app. It should open with the **Focus check** input already focused.
2. Click **Hide to tray**. Kestrel disappears; the tray icon remains.
3. Open another app (Chrome, Notepad, Word) and click into it.
4. Press **`Ctrl + Alt + Space`**.
5. Pass criteria:
   - Kestrel comes to the foreground.
   - The **Focus check** input has the caret.
   - The proof log says **“Focus verified … ms after the hotkey”** with a green check.
   - Typing goes into the input, not the app behind it.
6. Also try it with the window visible but behind another app, and with the window minimized.
7. Quit from the tray icon's context menu.

The proof log and focus verification are deliberately in the UI so the result is evidence, not a feeling.

**Day 1 result (2026-11-06): PASS.** Hotkey registered, hidden window summoned, foreground taken from another app, window focus verified roughly 450 ms after the hotkey, and keyboard input landed in the focus-check field. Evidence: `logs/day1-window.png`.

## If the hotkey does not register

The status card turns red and reports the error. Another app may already own the shortcut.

The hotkey is defined in one place:

```text
apps/desktop/src/shared/types.ts
```

Change `HOTKEY`, then restart. The display label and the smoke test both derive from it. Common conflicts are `Alt+Space` (window menu / PowerToys Run) and `Ctrl+Space` (IME / IDE completion), which is why Day 1 uses `Ctrl+Alt+Space`.

## Notes / limits

- This is a spike, not the production shell: no installer, auto-update, auth, or persistence.
- The window uses Electron's standard frame; no custom title bar yet.
- `summonWindow()` in `apps/desktop/src/main/index.ts` uses a short always-on-top pulse plus a second focus attempt. That is the deliberate Windows foreground workaround being tested.
- If an elevated app is in front, Windows may still refuse to hand focus to a non-elevated Kestrel. Normal Chrome/Notion/Word usage is the Day 1 target.
- No data leaves the machine; the app makes no external network requests.
- `package-lock.json` is generated with npm workspaces. The implementation plan calls for pnpm + Turborepo later; npm is used for this spike because pnpm is not installed here.

## If `npm install` cannot download Electron

The Electron postinstall downloads a ~158 MB runtime from GitHub. If that download is interrupted, install the runtime from a mirror:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

Then verify:

```powershell
node_modules\electron\dist\electron.exe --version
```

## Next milestone

Day 2 in `SKELETON.md`: dictation pastes into three real apps. Do not start it until Day 1 passes.
