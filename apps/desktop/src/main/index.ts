import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Tray
} from 'electron'
import { join } from 'node:path'
import {
  HOTKEY,
  HOTKEY_LABEL,
  IPC,
  type KestrelRuntimeState,
  type SummonEvent,
  type SummonResult
} from '../shared/types'

const APP_ID = 'com.kestrel.desktop'
const FOCUS_PROBE_DELAY_MS = 400

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let hotkeyError: string | null = null
let triggerCount = 0
let lastTriggeredAt: number | null = null
const focusProbeTimers = new Set<NodeJS.Timeout>()
let focusRetryTimer: NodeJS.Timeout | null = null
let alwaysOnTopResetTimer: NodeJS.Timeout | null = null

function resourcePath(...parts: string[]): string {
  return join(__dirname, '../../resources', ...parts)
}

function runtimeState(): KestrelRuntimeState {
  return {
    hotkey: HOTKEY,
    hotkeyLabel: [...HOTKEY_LABEL],
    hotkeyRegistered: globalShortcut.isRegistered(HOTKEY),
    hotkeyError,
    triggerCount,
    lastTriggeredAt,
    windowFocused: mainWindow?.isFocused() ?? false,
    appVersion: app.getVersion()
  }
}

function broadcastState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.state, runtimeState())
}

function clearSummonTimers(): void {
  for (const timer of focusProbeTimers) clearTimeout(timer)
  focusProbeTimers.clear()
  if (focusRetryTimer) clearTimeout(focusRetryTimer)
  if (alwaysOnTopResetTimer) clearTimeout(alwaysOnTopResetTimer)
  focusRetryTimer = null
  alwaysOnTopResetTimer = null
}

/**
 * Windows can refuse focus changes from a background process. Registering a
 * global hotkey should grant us the foreground, but we also nudge the window
 * with a short always-on-top pulse and a second focus attempt before
 * reporting whether focus actually landed.
 */
function summonWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  const startedAt = performance.now()

  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true)
  win.show()
  win.moveTop()
  win.focus()

  if (focusRetryTimer) clearTimeout(focusRetryTimer)
  focusRetryTimer = setTimeout(() => {
    if (!win.isDestroyed() && !win.isFocused()) win.focus()
  }, 120)

  if (alwaysOnTopResetTimer) clearTimeout(alwaysOnTopResetTimer)
  alwaysOnTopResetTimer = setTimeout(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false)
  }, 300)

  // Keep one probe per press: rapid hotkey presses should each leave evidence
  // instead of the latest probe cancelling the previous one.
  const probeTimer = setTimeout(() => {
    focusProbeTimers.delete(probeTimer)
    if (win.isDestroyed()) return

    const result: SummonResult = {
      at: Date.now(),
      focused: win.isFocused(),
      verifiedAfterMs: Math.round(performance.now() - startedAt)
    }

    win.webContents.send(IPC.summonResult, result)
    broadcastState()
    console.log(
      `[hotkey] focus=${result.focused} verified ${result.verifiedAfterMs}ms after summon visible=${win.isVisible()}`
    )
  }, FOCUS_PROBE_DELAY_MS)
  focusProbeTimers.add(probeTimer)
}

function handleHotkey(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  triggerCount += 1
  lastTriggeredAt = Date.now()

  summonWindow()
  broadcastState()
  mainWindow.webContents.send(IPC.summon, {
    at: lastTriggeredAt,
    count: triggerCount
  } satisfies SummonEvent)

  console.log(`[hotkey] fired #${triggerCount}`)
}

function registerHotkey(): void {
  globalShortcut.unregister(HOTKEY)
  hotkeyError = null

  try {
    const registered = globalShortcut.register(HOTKEY, handleHotkey)
    if (!registered) {
      hotkeyError = 'Windows refused the shortcut. Another app may already be using it.'
    }
  } catch (error) {
    hotkeyError = error instanceof Error ? error.message : String(error)
  }

  const registered = globalShortcut.isRegistered(HOTKEY)
  console.log(
    `[hotkey] ${HOTKEY} registered=${registered}${hotkeyError ? ` (${hotkeyError})` : ''}`
  )
  broadcastState()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 600,
    height: 690,
    minWidth: 540,
    minHeight: 620,
    show: false,
    title: 'Kestrel',
    backgroundColor: '#0b0f14',
    icon: resourcePath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.on('focus', () => {
    console.log('[window] focus')
    broadcastState()
  })
  win.on('blur', () => {
    console.log('[window] blur')
    broadcastState()
  })

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      broadcastState()
      console.log('[window] hidden to tray')
    }
  })

  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.on('did-finish-load', broadcastState)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(icon)
  tray.setToolTip(`Kestrel — ${HOTKEY_LABEL.join('+')} to summon`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Kestrel',
        click: summonWindow
      },
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
  tray.on('click', summonWindow)
  tray.on('double-click', summonWindow)
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => runtimeState())
  ipcMain.handle(IPC.retryHotkey, () => {
    registerHotkey()
    return runtimeState()
  })
  ipcMain.on(IPC.hideWindow, () => {
    mainWindow?.hide()
    broadcastState()
  })
  ipcMain.on(IPC.quit, () => {
    isQuitting = true
    app.quit()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)
  nativeTheme.themeSource = 'dark'
  registerIpc()

  app.on('second-instance', () => summonWindow())

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    clearSummonTimers()
    globalShortcut.unregisterAll()
    tray?.destroy()
    tray = null
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    createWindow()
    createTray()
    registerHotkey()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else {
        summonWindow()
      }
    })
  })
}
