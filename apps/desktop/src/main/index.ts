import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  Tray
} from 'electron'
import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  IPC,
  type KestrelRuntimeState,
  type KestrelSettings,
  type NotchActivity,
  type NotchAudioPayload,
  type NotchOpenResult,
  type SaveSettingsResult
} from '../shared/types'
import { HttpActionClient } from './action-client'
import { formatHotkey, hotkeyLabel, parseHotkey } from './hotkey'
import { normalizeInteractiveRegion } from './interactive-region'
import { startKeyHook, type KeyHookHandle } from './key-hook'
import {
  FakeLiveTranscriber,
  NemoStreamingTranscriber,
  type LiveTranscriber
} from './live-asr'
import { NativePasteService } from './native-paste'
import { NotchController } from './notch-controller'
import { NotchWindowPresenter, createNotchWindow } from './notch-window'
import { OverlayWindowPresenter, createOverlayWindow } from './overlay-window'
import { PushToTalk } from './push-to-talk'
import { captureDisplay, cursorScreenPoint, displayUnderCursor } from './screen-capture'
import { OverlayScreenService } from './screen-service'
import { DEFAULT_SETTINGS, SettingsStore, type AsrMode } from './settings-store'
import { NemoServer, resolveNemoPaths } from './nemo-server'

const APP_ID = 'com.kestrel.desktop'
const DEFAULT_API_URL = 'http://127.0.0.1:8765'
const DEFAULT_FAKE_TRANSCRIPT = 'open notepad'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let notchPresenter: NotchWindowPresenter | null = null
let notchController: NotchController | null = null
let overlayPresenter: OverlayWindowPresenter | null = null
let screenService: OverlayScreenService | null = null
let keyHook: KeyHookHandle | null = null
let pushToTalk: PushToTalk | null = null
let settingsStore: SettingsStore | null = null
let settings: KestrelSettings = { ...DEFAULT_SETTINGS }
let isQuitting = false
let hotkeyRegistered = false
let hotkeyError: string | null = null
let hookError: string | null = null
let triggerCount = 0
let lastTriggeredAt: number | null = null
let hotkeyChanging = false
let asrReady = false
let asrError: string | null = null
let asrGeneration = 0
let nemoServer: NemoServer | null = null
let transcriber: LiveTranscriber | null = null

const apiUrl = (process.env.KESTREL_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '')

function apiBaseUrl(): string {
  return apiUrl
}

function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

function resourcePath(...parts: string[]): string {
  return join(resourcesRoot(), ...parts)
}

function shellErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The controller's filesystem seam. Paths stay in this process; the renderer
 * only ever sees row ids.
 */
const notchFileService = {
  isRegularFile(path: string): boolean {
    if (!isAbsolute(path)) return false
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  },
  async open(path: string): Promise<NotchOpenResult> {
    try {
      const error = await shell.openPath(path)
      return error ? { ok: false, message: error } : { ok: true }
    } catch (error) {
      return { ok: false, message: shellErrorMessage(error) }
    }
  },
  async reveal(path: string): Promise<NotchOpenResult> {
    try {
      shell.showItemInFolder(path)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: shellErrorMessage(error) }
    }
  }
}

function sendToMain(channel: string, payload?: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  if (payload === undefined) {
    mainWindow.webContents.send(channel)
  } else {
    mainWindow.webContents.send(channel, payload)
  }
}

function runtimeState(): KestrelRuntimeState {
  return {
    hotkey: settings.hotkey,
    hotkeyLabel: hotkeyLabel(settings.hotkey),
    hotkeyRegistered,
    hotkeyError,
    triggerCount,
    lastTriggeredAt,
    windowFocused: mainWindow?.isFocused() ?? false,
    appVersion: app.getVersion(),
    hookRunning: keyHook !== null,
    hookError,
    settings,
    asrMode: effectiveAsrMode(),
    asrReady,
    asrError,
    apiUrl: apiBaseUrl()
  }
}

function broadcastState(): void {
  sendToMain(IPC.state, runtimeState())
}

function broadcastSettings(): void {
  sendToMain(IPC.settingsChanged, settings)
}

function effectiveAsrMode(): AsrMode {
  const override = process.env.KESTREL_ASR_MODE?.trim().toLowerCase()
  if (override === 'fake') return 'fake'
  if (override === 'nemo' || override === 'whisper') return 'nemo'
  return settings.asrMode
}

function showMainWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  broadcastState()
}

function hideMainWindow(): void {
  mainWindow?.hide()
  broadcastState()
}

function updateTray(): void {
  if (!tray) return
  const label = hotkeyLabel(settings.hotkey).join('+')
  tray.setToolTip(`Kestrel — ${label}: hold to talk or circle`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Kestrel', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Quit Kestrel',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 640,
    height: 860,
    minWidth: 560,
    minHeight: 720,
    show: false,
    title: 'Kestrel',
    backgroundColor: '#0b0f14',
    icon: resourcePath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  mainWindow = win

  win.on('focus', broadcastState)
  win.on('blur', broadcastState)

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      broadcastState()
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('did-finish-load', broadcastState)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    const icon = nativeImage.createFromPath(resourcePath('tray.png'))
    tray = new Tray(icon)
    updateTray()
    tray.on('click', showMainWindow)
    tray.on('double-click', showMainWindow)
  } catch (error) {
    console.error('[tray] could not create tray icon', error)
  }
}

function registerChord(hotkey: string): boolean {
  try {
    if (globalShortcut.isRegistered(hotkey)) globalShortcut.unregister(hotkey)
    // The callback exists only to reserve/consume the chord. Hold detection and
    // release detection come from the low-level keyboard hook.
    return globalShortcut.register(hotkey, () => undefined)
  } catch {
    return false
  }
}

function stopKeyHook(): void {
  keyHook?.stop()
  keyHook = null
}

async function ensureKeyHook(): Promise<boolean> {
  stopKeyHook()
  hookError = null

  const chord = parseHotkey(settings.hotkey)
  if (!chord) {
    hookError = `The shortcut "${settings.hotkey}" is not valid.`
    broadcastState()
    return false
  }

  try {
    keyHook = await startKeyHook(chord, {
      onPress: () => pushToTalk?.press(),
      onRelease: () => pushToTalk?.release(),
      onCancel: () => pushToTalk?.cancel()
    })
    hookError = null
    console.log(`[hotkey] hook started for ${formatHotkey(chord)}`)
  } catch (error) {
    keyHook = null
    hookError = error instanceof Error ? error.message : String(error)
    console.error('[hotkey] hook failed', hookError)
  }

  broadcastState()
  return keyHook !== null
}

/**
 * Register and apply a shortcut. Registration is attempted before the old
 * chord is released, so a conflict leaves the current shortcut intact.
 * Returns a user-facing error when Windows refuses the chord.
 */
async function applyHotkey(nextHotkey: string): Promise<{ ok: boolean; error: string | null }> {
  if (hotkeyChanging) return { ok: false, error: 'The shortcut is already being changed.' }

  const chord = parseHotkey(nextHotkey)
  if (!chord) {
    return {
      ok: false,
      error: 'Use a modifier plus a key, for example Control+Space or Alt+F8.'
    }
  }

  const canonical = formatHotkey(chord)
  const previous = settings.hotkey
  const changing = canonical !== previous
  hotkeyChanging = true

  try {
    if (changing || !globalShortcut.isRegistered(canonical)) {
      if (!registerChord(canonical)) {
        hotkeyRegistered = false
        hotkeyError = `Windows would not reserve ${hotkeyLabel(canonical).join('+')}. Another app may be using it. Choose a different shortcut.`
        broadcastState()
        return { ok: false, error: hotkeyError }
      }
    }

    if (changing) globalShortcut.unregister(previous)
    settings = { ...settings, hotkey: canonical }
    hotkeyRegistered = globalShortcut.isRegistered(canonical)
    hotkeyError = null

    const hookOk = await ensureKeyHook()
    if (!hookOk && changing) {
      // Keep the working shortcut rather than leaving the user with no hook.
      globalShortcut.unregister(canonical)
      settings = { ...settings, hotkey: previous }
      registerChord(previous)
      hotkeyRegistered = globalShortcut.isRegistered(previous)
      await ensureKeyHook()
      return { ok: false, error: hookError ?? 'The keyboard hook could not start.' }
    }

    updateTray()
    broadcastState()
    return { ok: hookOk, error: hookOk ? null : hookError }
  } finally {
    hotkeyChanging = false
  }
}

async function restartAsr(): Promise<void> {
  const generation = ++asrGeneration
  asrReady = false
  asrError = null
  transcriber = null
  broadcastState()

  const oldServer = nemoServer
  nemoServer = null
  if (oldServer) await oldServer.stop()

  if (effectiveAsrMode() === 'fake') {
    transcriber = new FakeLiveTranscriber(
      process.env.KESTREL_FAKE_TRANSCRIPT?.trim() || DEFAULT_FAKE_TRANSCRIPT
    )
    asrReady = true
    console.log('[asr] fake transcriber ready')
    broadcastState()
    return
  }

  const paths = resolveNemoPaths()
  const server = new NemoServer(paths)
  nemoServer = server

  try {
    const baseUrl = await server.start()
    if (generation !== asrGeneration) {
      await server.stop()
      return
    }
    transcriber = new NemoStreamingTranscriber({ baseUrl, language: 'en' })
    asrReady = true
    asrError = null
    console.log(`[asr] NVIDIA Nemotron ready at ${baseUrl}`)
  } catch (error) {
    if (generation !== asrGeneration) return
    asrReady = false
    asrError = error instanceof Error ? error.message : String(error)
    console.error('[asr] NVIDIA Nemotron failed to start', asrError)
    if (nemoServer === server) nemoServer = null
  }

  broadcastState()
}

async function saveSettings(patch: Partial<KestrelSettings>): Promise<SaveSettingsResult> {
  if (!settingsStore) throw new Error('Settings are not ready yet.')
  if (patch.hotkey !== undefined && typeof patch.hotkey !== 'string') {
    throw new Error('The shortcut must be a string.')
  }
  if (patch.asrMode !== undefined && patch.asrMode !== 'nemo' && patch.asrMode !== 'fake') {
    throw new Error('Unknown speech recognition mode.')
  }

  const nextHotkey = patch.hotkey?.trim() || settings.hotkey
  const nextAsrMode = patch.asrMode ?? settings.asrMode

  if (nextHotkey !== settings.hotkey) {
    const result = await applyHotkey(nextHotkey)
    if (!result.ok) throw new Error(result.error ?? 'The shortcut could not be changed.')
  }

  if (nextAsrMode !== settings.asrMode) {
    settings = { ...settings, asrMode: nextAsrMode }
    await restartAsr()
  }

  settingsStore.save(settings)
  updateTray()
  broadcastSettings()
  broadcastState()
  return { state: runtimeState(), settings }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => runtimeState())
  ipcMain.handle(IPC.getSettings, () => settings)
  ipcMain.handle(IPC.saveSettings, (_event, patch: Partial<KestrelSettings>) =>
    saveSettings(patch ?? {})
  )
  ipcMain.handle(IPC.retryHotkey, async () => {
    await applyHotkey(settings.hotkey)
    return runtimeState()
  })

  ipcMain.on(IPC.hideWindow, hideMainWindow)
  ipcMain.on(IPC.quit, () => {
    isQuitting = true
    app.quit()
  })

  ipcMain.on(IPC.notchReady, () => {
    notchPresenter?.handleReady()
  })
  ipcMain.on(IPC.notchAudio, (_event, payload: NotchAudioPayload) => {
    if (!payload || !(payload.samples instanceof Float32Array)) return
    notchController?.pushAudio(payload.samples, payload.sampleRate)
  })
  ipcMain.on(IPC.notchAudioEnd, () => {
    notchController?.audioEnded()
  })
  ipcMain.on(IPC.notchAudioError, (_event, payload: { message?: unknown }) => {
    const message =
      typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message
        : 'Microphone capture failed.'
    notchController?.audioError(message)
  })
  ipcMain.on(IPC.notchSpeech, (_event, speaking: unknown) => {
    notchController?.setSpeechActive(speaking === true)
  })
  ipcMain.handle(IPC.openNotchResult, (_event, id: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return { ok: false, message: 'That file is no longer available.' } satisfies NotchOpenResult
    }
    return (
      notchController?.openResult(id) ??
      ({ ok: false, message: 'That file is no longer available.' } satisfies NotchOpenResult)
    )
  })
  ipcMain.on(IPC.dismissNotchResult, () => {
    notchController?.dismissResults()
  })
  ipcMain.on(IPC.notchDecide, (_event, action: unknown) => {
    if (action !== 'confirm' && action !== 'cancel' && action !== 'undo') return
    void notchController?.decide(action)
  })
  ipcMain.on(IPC.notchRegion, (_event, region: unknown) => {
    notchPresenter?.setRegion(normalizeInteractiveRegion(region))
  })
}

function createPushToTalk(): void {
  pushToTalk = new PushToTalk({
    onListeningStart: () => {
      triggerCount += 1
      lastTriggeredAt = Date.now()
      broadcastState()
      console.log('[ptt] listening')
      notchController?.start()
    },
    onListeningStop: (holdMs) => {
      console.log(`[ptt] stop holdMs=${holdMs}`)
      notchController?.stop()
    },
    onCancel: () => {
      notchController?.cancel()
    }
  })
}

function createNotch(): void {
  const win = createNotchWindow()
  notchPresenter = new NotchWindowPresenter(win)

  // The overlay is warm from startup: its renderer is loaded and ready before
  // the first hold, so the blue trail appears without a load delay.
  overlayPresenter = new OverlayWindowPresenter(createOverlayWindow())
  screenService = new OverlayScreenService({
    overlay: overlayPresenter,
    cursorPoint: cursorScreenPoint,
    displayUnderCursor,
    captureDisplay
  })

  notchController = new NotchController({
    presenter: notchPresenter,
    getTranscriber: () => transcriber,
    actionClient: new HttpActionClient({ baseUrl: apiBaseUrl() }),
    paste: new NativePasteService(),
    fileService: notchFileService,
    screen: screenService,
    onActivity: (activity: NotchActivity) => sendToMain(IPC.notchActivity, activity),
    onTurnComplete: () => pushToTalk?.reset()
  })

  // The main window should also learn about turns even while hidden; the log is
  // replayed the next time it opens.
  win.webContents.on('did-finish-load', () => {
    console.log('[notch] renderer loaded')
  })
}

async function initialize(): Promise<void> {
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'dark'

  const settingsPath =
    process.env.KESTREL_SETTINGS_PATH?.trim() ||
    join(app.getPath('userData'), 'kestrel-settings.json')
  settingsStore = new SettingsStore(settingsPath)
  const firstRun = !settingsStore.exists()
  settings = settingsStore.load()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  createPushToTalk()
  registerIpc()
  createMainWindow()
  createTray()
  createNotch()

  const registered = registerChord(settings.hotkey)
  hotkeyRegistered = registered
  hotkeyError = registered
    ? null
    : `Windows would not reserve ${hotkeyLabel(settings.hotkey).join('+')}. Another app may be using it. Choose a different shortcut in settings.`

  console.log(
    `[hotkey] ${settings.hotkey} registered=${registered}${registered ? '' : ` (${hotkeyError ?? 'unknown error'})`}`
  )
  if (!registered) {
    globalShortcut.unregister(settings.hotkey)
  }

  await ensureKeyHook()
  void restartAsr()

  updateTray()
  broadcastState()

  if (firstRun || !registered || keyHook === null) {
    showMainWindow()
  }

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow()
    }
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)
  // The notch captures after a global keyboard event, not a page click, so the
  // AudioContext must be allowed to start without a user gesture.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
  app.commandLine.appendSwitch('enable-unsafe-webgpu')

  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    stopKeyHook()
    pushToTalk?.dispose()
    globalShortcut.unregisterAll()
    screenService?.dispose()
    screenService = null
    overlayPresenter?.dispose()
    overlayPresenter = null
    notchPresenter?.dispose()
    notchPresenter = null
    notchController = null
    void nemoServer?.stop()
    nemoServer = null
    tray?.destroy()
    tray = null
  })

  // Tray app: closing every window should not quit Kestrel.
  app.on('window-all-closed', () => undefined)

  void app.whenReady().then(initialize).catch((error: unknown) => {
    console.error('[main] failed to initialize', error)
    showMainWindow()
  })
}
