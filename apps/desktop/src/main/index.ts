import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
  Tray
} from 'electron'
import { statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import {
  IPC,
  isIntegrationId,
  type AuthState,
  type AuthTokens,
  type AuthUser,
  type IntegrationConnectResult,
  type KestrelRuntimeState,
  type KestrelSettings,
  type NotchActivity,
  type NotchAudioPayload,
  type NotchOpenResult,
  type SaveSettingsResult
} from '../shared/types'
import { HttpActionClient } from './action-client'
import { loadOrCreateUserId } from './assistant/composio/identity'
import {
  ComposioIntegration,
  DEFAULT_CALLBACK_URL
} from './assistant/composio/integration'
import { ComposioKeyStore } from './assistant/composio/key'
import { loadEnvFiles } from './assistant/env'
import { AssistantServer, parseApiAddress } from './assistant/server'
import { AssistantService, emptyIntegrationsStatus } from './assistant/service'
import { AuthService, syncUserToBackend } from './auth/auth-service'
import { FileAuthStore } from './auth/file-store'
import { HistoryStore } from './history/store'
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
import { SidebarWindow, createSidebarWindow } from './sidebar-window'
import { PushToTalk } from './push-to-talk'
import { captureDisplay, cursorScreenPoint, displayUnderCursor } from './screen-capture'
import { OverlayScreenService } from './screen-service'
import { DEFAULT_SETTINGS, SettingsStore, type AsrMode } from './settings-store'
import { NemoServer, resolveNemoPaths } from './nemo-server'
import {
  KokoroSynthesizerEngine,
  SpeechSynthesizer,
  type SpeechChunk
} from './speech-synthesizer'
import { WorkerSpeechEngine } from './speech-worker-engine'
import { SpeechStreamBridge } from './speech-stream'

const APP_ID = 'com.kestrel.desktop'
const DEFAULT_API_URL = 'http://127.0.0.1:8765'
const DEFAULT_FAKE_TRANSCRIPT = 'open notepad'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let notchWindow: BrowserWindow | null = null
let notchPresenter: NotchWindowPresenter | null = null
let notchController: NotchController | null = null
let overlayPresenter: OverlayWindowPresenter | null = null
let sidebarWindow: SidebarWindow | null = null
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
let authService: AuthService | null = null
let assistantService: AssistantService | null = null
let historyStore: HistoryStore | null = null
let composioIntegration: ComposioIntegration | null = null
let assistantServer: AssistantServer | null = null
let speechSynthesizer: SpeechSynthesizer | null = null
let speechEngine: WorkerSpeechEngine | null = null
let speechStreamBridge: SpeechStreamBridge | null = null

const PROTOCOL_SCHEME = 'voicedesk'

function apiBaseUrl(): string {
  return (process.env.KESTREL_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '')
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

/** Used when a stream request arrives before the synthesizer is ready. */
async function* emptySpeechChunks(): AsyncIterable<SpeechChunk> {}

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
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Kestrel',
    frame: false,
    backgroundColor: '#16171a',
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
  win.webContents.on('did-finish-load', () => {
    broadcastState()
    if (authService) {
      sendToMain(IPC.authStateChanged, authService.getState())
    }
  })

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
      onCancel: () => pushToTalk?.cancel(),
      onEscape: () => notchController?.requestEscapeDismiss(),
      onMouseDown: () => {
        const cursor = screen.getCursorScreenPoint()
        const insideNotch = notchPresenter?.isPointInside(cursor.x, cursor.y) ?? false
        const insideSidebar = sidebarWindow?.isPointInside(cursor.x, cursor.y) ?? false
        if (!insideNotch && !insideSidebar) {
          if (!notchController?.hasActiveWork() && !notchController?.isBusy()) {
            notchController?.dismissResults()
          }
          if (sidebarWindow?.isExpanded()) {
            sidebarWindow.send(IPC.sidebarCollapse)
          }
        }
      }
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
  ipcMain.on(IPC.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(IPC.windowMaximizeToggle, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })
  ipcMain.on(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
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
  ipcMain.on(IPC.notchCancelActive, () => {
    notchController?.cancelActiveWork()
  })
  ipcMain.on(IPC.notchDecide, (_event, action: unknown) => {
    if (action !== 'confirm' && action !== 'cancel' && action !== 'undo') return
    void notchController?.decide(action)
  })
  ipcMain.on(IPC.notchSubmitText, (_event, text: unknown) => {
    if (typeof text !== 'string') return
    void notchController?.submitText(text)
  })
  ipcMain.on(IPC.notchStartTyping, () => {
    notchController?.startTyping()
  })
  ipcMain.on(IPC.notchSetFocusable, (_event, focusable: unknown) => {
    notchPresenter?.setKeyboardFocusable(focusable === true)
  })
  ipcMain.on(IPC.copyToClipboard, (_event, text: unknown) => {
    if (typeof text !== 'string') return
    clipboard.writeText(text)
  })
  ipcMain.on(IPC.notchRegion, (_event, region: unknown) => {
    notchPresenter?.setRegion(normalizeInteractiveRegion(region))
  })
  ipcMain.handle(IPC.authGetState, () => authService?.getState() ?? { status: 'unauthenticated' })
  ipcMain.handle(IPC.authSignOut, async () => {
    await authService?.signOut()
  })
  ipcMain.handle(IPC.authOpenOAuthUrl, async (_event, url: unknown) => {
    if (typeof url === 'string') {
      authService?.startLogin()
      await shell.openExternal(url)
    }
  })
  ipcMain.handle(IPC.authSetSession, async (_event, tokens: AuthTokens, user: AuthUser) => {
    await authService?.setSession(tokens, user)
  })
  ipcMain.handle(IPC.integrationsGetStatus, () =>
    assistantService?.integrationsStatus() ?? emptyIntegrationsStatus()
  )
  ipcMain.handle(IPC.integrationsRefresh, () =>
    assistantService?.refreshIntegrations() ?? Promise.resolve(emptyIntegrationsStatus())
  )
  ipcMain.handle(IPC.integrationsSetKey, (_event, key: unknown) => {
    if (typeof key !== 'string') return emptyIntegrationsStatus()
    return assistantService?.setIntegrationsKey(key) ?? Promise.resolve(emptyIntegrationsStatus())
  })
  ipcMain.handle(IPC.integrationsClearKey, () =>
    assistantService?.clearIntegrationsKey() ?? Promise.resolve(emptyIntegrationsStatus())
  )
  ipcMain.handle(IPC.integrationsConnect, async (_event, id: unknown) => {
    if (!isIntegrationId(id)) {
      return { ok: false, url: null, message: 'That app is not supported yet.' } satisfies IntegrationConnectResult
    }
    const result =
      (await assistantService?.connectIntegration(id)) ??
      ({ ok: false, url: null, message: 'Integrations are not available.' } satisfies IntegrationConnectResult)
    if (result.ok && result.url) {
      // Open the provider's consent page in the system browser, then wait in the
      // background for the connection to appear so the UI updates by itself.
      await shell.openExternal(result.url)
      void assistantService?.awaitIntegration(id)
    }
    return result
  })
  ipcMain.handle(IPC.historyList, () => historyStore?.list() ?? [])
  ipcMain.handle(IPC.historyDelete, (_event, id: unknown) => {
    if (typeof id === 'string') historyStore?.delete(id)
    sendToMain(IPC.historyChanged)
    sidebarWindow?.send(IPC.historyChanged)
    return historyStore?.list() ?? []
  })
  ipcMain.on(IPC.sidebarRestoreHistory, (_event, payload: unknown) => {
    if (payload && typeof payload === 'object') {
      const { prompt, reply } = payload as { prompt?: unknown; reply?: unknown }
      const promptStr = typeof prompt === 'string' ? prompt : ''
      const replyStr = typeof reply === 'string' ? reply : ''
      if (notchWindow && !notchWindow.isDestroyed() && !notchWindow.webContents.isDestroyed()) {
        notchWindow.webContents.send(IPC.notchRestoreHistory, { prompt: promptStr, reply: replyStr })
      }
      notchController?.restoreHistory(promptStr, replyStr)
    }
  })
  ipcMain.on(IPC.sidebarSetInteractive, (_event, interactive: unknown) => {
    sidebarWindow?.setIgnoreMouseEvents(interactive !== true, { forward: true })
  })
  ipcMain.on(IPC.sidebarRegion, (_event, region: unknown) => {
    sidebarWindow?.setRegion(normalizeInteractiveRegion(region))
  })
  ipcMain.handle(IPC.speechSynthesize, async (_event, text: unknown) => {
    if (typeof text !== 'string') return null
    return speechSynthesizer?.synthesize(text) ?? null
  })

  speechStreamBridge = new SpeechStreamBridge({
    synthesizeStream: (text) => speechSynthesizer?.synthesizeStream(text) ?? emptySpeechChunks(),
    send: (channel, payload) => notchPresenter?.sendToRenderer(channel, payload)
  })

  ipcMain.on(IPC.speechStreamStart, (_event, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) return
    const { requestId, text } = payload as { requestId?: unknown; text?: unknown }
    if (typeof requestId !== 'string' || typeof text !== 'string') return
    speechStreamBridge?.start(requestId, text)
  })
  ipcMain.on(IPC.speechStreamCancel, (_event, requestId: unknown) => {
    if (typeof requestId !== 'string') return
    speechStreamBridge?.cancel(requestId)
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
  notchWindow = win
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

function handleDeepLink(url: string): void {
  if (url.startsWith(`${PROTOCOL_SCHEME}://composio`)) {
    showMainWindow()
    // The browser flow just finished; re-check the connections now instead of
    // waiting for the poll. `refreshIntegrations` never rejects.
    void assistantService?.refreshIntegrations()
    return
  }
  void authService?.handleDeepLink(url)
}

function registerProtocolClient(): void {
  try {
    if (!app.isPackaged) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
          resolve(process.argv[1])
        ])
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
    }
  } catch (error) {
    console.error('[protocol] failed to set as default protocol client', error)
  }
}

async function initialize(): Promise<void> {
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'dark'

  // The main process does not use Vite's env loading, so load the app's env
  // files (`apps/desktop/.env.local`, then `.env`) before any code reads
  // `process.env`.
  loadEnvFiles([
    join(app.getAppPath(), '.env.local'),
    join(app.getAppPath(), '.env')
  ])

  // The assistant runs in-process, but the Supabase OAuth redirect and the
  // notch both need a real localhost URL, so host the same HTTP surface the
  // Python backend provided.
  // The Composio API key is bring-your-own-key: it stays on this machine, and
  // the user id is generated once and kept stable for this install.
  const composioKeyPath =
    process.env.KESTREL_COMPOSIO_KEY_PATH?.trim() ||
    join(app.getPath('userData'), 'kestrel-composio.json')
  const composioUserIdPath = join(app.getPath('userData'), 'kestrel-composio-user.json')
  composioIntegration = new ComposioIntegration({
    keyStore: new ComposioKeyStore(composioKeyPath),
    userId: loadOrCreateUserId(composioUserIdPath),
    callbackUrl: DEFAULT_CALLBACK_URL,
    onStatus: (status) => sendToMain(IPC.integrationsChanged, status)
  })

  const historyPath =
    process.env.KESTREL_HISTORY_PATH?.trim() ||
    join(app.getPath('userData'), 'kestrel-history.json')
  historyStore = new HistoryStore(historyPath)

  assistantService = new AssistantService({
    mcpConfigPath: join(app.getAppPath(), 'mcp_servers.json'),
    integrations: composioIntegration,
    history: historyStore,
    onHistoryRecorded: () => {
      sendToMain(IPC.historyChanged)
      sidebarWindow?.send(IPC.historyChanged)
    }
  })
  await assistantService.initialize()

  const bind = parseApiAddress(process.env.KESTREL_API_URL)
  assistantServer = new AssistantServer({
    service: assistantService,
    host: bind.host,
    port: bind.port
  })
  try {
    await assistantServer.listen()
    console.log(`[assistant] local API listening on ${assistantServer.url()}`)
  } catch (error) {
    console.error('[assistant] failed to start the local API', error)
  }

  const settingsPath =
    process.env.KESTREL_SETTINGS_PATH?.trim() ||
    join(app.getPath('userData'), 'kestrel-settings.json')
  settingsStore = new SettingsStore(settingsPath)
  settings = settingsStore.load()

  const authStorePath =
    process.env.KESTREL_AUTH_PATH?.trim() ||
    join(app.getPath('userData'), 'kestrel-auth.json')
  authService = new AuthService({
    store: new FileAuthStore(authStorePath),
    onStateChanged: (state: AuthState) => {
      sendToMain(IPC.authStateChanged, state)
    },
    userSyncCallback: (user) => {
      void syncUserToBackend(user)
    }
  })

  registerProtocolClient()

  speechEngine = new WorkerSpeechEngine({ fallback: new KokoroSynthesizerEngine() })
  speechSynthesizer = new SpeechSynthesizer({ engine: speechEngine })
  speechSynthesizer.warmup()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  createPushToTalk()
  registerIpc()
  createMainWindow()
  createTray()
  createNotch()
  sidebarWindow = createSidebarWindow()
  sidebarWindow.show()

  const initialDeepLink = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`))
  if (initialDeepLink) {
    handleDeepLink(initialDeepLink)
  }

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
  showMainWindow()

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

  app.on('second-instance', (_event, commandLine) => {
    showMainWindow()
    const deepLink = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`))
    if (deepLink) {
      handleDeepLink(deepLink)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    showMainWindow()
    handleDeepLink(url)
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
    notchWindow = null
    sidebarWindow?.dispose()
    sidebarWindow = null
    notchController = null
    void assistantServer?.close()
    assistantServer = null
    void assistantService?.close()
    assistantService = null
    void composioIntegration?.close()
    composioIntegration = null
    void nemoServer?.stop()
    nemoServer = null
    speechStreamBridge?.cancelAll()
    speechStreamBridge = null
    void speechEngine?.terminate()
    speechEngine = null
    speechSynthesizer = null
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
