import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import {
  IPC,
  type PillMode,
  type PillStatePayload,
  type PillTargetApp
} from '../../shared/types'

export type { PillMode, PillStatePayload, PillTargetApp }

export const PILL_WIDTH = 380
export const PILL_HEIGHT = 72
export const SUCCESS_AUTO_HIDE_MS = 1200
export const ERROR_AUTO_HIDE_MS = 1500

// Renderer console levels that are pure dev noise in the happy path; these are
// not forwarded. Anything unrecognised is forwarded so diagnostics are safe.
const QUIET_CONSOLE_LEVELS = new Set(['debug', 'info', 'log'])

export interface PillWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export function computePillPosition(
  display: Electron.Display,
  width: number = PILL_WIDTH,
  height: number = PILL_HEIGHT
): PillWindowBounds {
  const scale = display.scaleFactor || 1
  const roundToDeviceDip = (v: number): number => Math.round(Math.round(v * scale) / scale)
  const x = roundToDeviceDip(display.workArea.x + (display.workArea.width - width) / 2)
  const y = roundToDeviceDip(display.workArea.y + display.workArea.height - height - 12)
  return { x, y, width, height }
}

export function getActiveDisplay(): Electron.Display {
  try {
    const point = screen.getCursorScreenPoint()
    return screen.getDisplayNearestPoint(point)
  } catch {
    return screen.getPrimaryDisplay()
  }
}

export function createPillWindow(): BrowserWindow {
  const bounds = computePillPosition(getActiveDisplay())
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    acceptFirstMouse: true,
    hiddenInMissionControl: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  if (process.platform === 'win32') {
    win.setIgnoreMouseEvents(true)
  } else {
    win.setIgnoreMouseEvents(true, { forward: true })
  }

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setSkipTaskbar(true)

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl.replace(/\/+$/, '')}/pill.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/pill.html'))
  }

  return win
}

export interface PillWindowPresenter {
  show(): void
  hide(): void
  update(payload: PillStatePayload): void
  setAudioLevel(level: number): void
  reposition(targetDisplay?: Electron.Display): void
  handleReady(): void
  dispose(): void
}

export class ElectronPillWindowPresenter implements PillWindowPresenter {
  private readonly win: BrowserWindow
  private ready = false
  private lastState: PillStatePayload | null = null
  private disposed = false
  private lastConsoleSignature: string | null = null
  private readonly onDisplayMetricsChanged: () => void

  constructor(win: BrowserWindow) {
    this.win = win
    this.onDisplayMetricsChanged = () => this.reposition(getActiveDisplay())

    screen.on?.('display-metrics-changed', this.onDisplayMetricsChanged)
    screen.on?.('display-added', this.onDisplayMetricsChanged)
    screen.on?.('display-removed', this.onDisplayMetricsChanged)

    win.webContents.on('did-start-loading', () => {
      this.ready = false
    })
    win.webContents.on('did-fail-load', (...args: unknown[]) => {
      const [, errorCode, errorDescription, validatedURL] = args
      console.error(
        `[pill] did-fail-load code=${String(errorCode)} desc=${String(errorDescription)} url=${String(validatedURL)}`
      )
    })
    win.webContents.on('preload-error', (...args: unknown[]) => {
      const [, preloadPath, error] = args
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[pill] preload-error path=${String(preloadPath)} error=${message}`)
    })
    win.webContents.on('render-process-gone', (...args: unknown[]) => {
      this.ready = false
      const details = args[1] as { reason?: unknown } | undefined
      console.error(`[pill] render-process-gone reason=${String(details?.reason ?? 'unknown')}`)
    })
    win.webContents.on('console-message', (...args: unknown[]) => {
      try {
        const details = args.find(
          (arg): arg is { level?: unknown; message?: unknown } =>
            typeof arg === 'object' && arg !== null && 'message' in arg
        )
        if (details) {
          this.logRendererConsole(details.level, details.message)
          return
        }
        // Legacy signature: (event, level, message, line, sourceId)
        const [, level, message] = args
        this.logRendererConsole(level, message)
      } catch {
        // Diagnostics must never break the pill
      }
    })
    win.on('closed', () => {
      this.disposed = true
    })
  }

  handleReady(): void {
    this.ready = true
    if (this.lastState) {
      this.send(IPC.pillState, this.lastState)
    }
  }

  show(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.reposition(getActiveDisplay())
    this.send(IPC.pillShow)
    this.win.showInactive()
    if (typeof this.win.moveTop === 'function') {
      this.win.moveTop()
    }
    if (typeof this.win.setAlwaysOnTop === 'function') {
      this.win.setAlwaysOnTop(true, 'screen-saver')
    }
  }

  reposition(targetDisplay?: Electron.Display): void {
    if (this.disposed || this.win.isDestroyed()) return
    const display = targetDisplay ?? getActiveDisplay()
    const bounds = computePillPosition(display)
    this.win.setBounds(bounds)
    if (this.win.isVisible()) {
      if (typeof this.win.moveTop === 'function') {
        this.win.moveTop()
      }
      if (typeof this.win.setAlwaysOnTop === 'function') {
        this.win.setAlwaysOnTop(true, 'screen-saver')
      }
    }
  }

  hide(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.send(IPC.pillHide)
    this.win.hide()
  }

  update(payload: PillStatePayload): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.lastState = payload
    if (this.ready) {
      this.send(IPC.pillState, payload)
    }
  }

  setAudioLevel(level: number): void {
    if (this.disposed || this.win.isDestroyed()) return
    if (this.ready) {
      this.send(IPC.pillAudioWave, level)
    }
  }

  dispose(): void {
    this.disposed = true
    screen.removeListener?.('display-metrics-changed', this.onDisplayMetricsChanged)
    screen.removeListener?.('display-added', this.onDisplayMetricsChanged)
    screen.removeListener?.('display-removed', this.onDisplayMetricsChanged)
  }

  /**
   * Forward a renderer console message, skipping quiet dev-noise levels and
   * collapsing an immediately repeated identical message into one line. An
   * unknown or missing level is always forwarded so unexpected payloads are
   * never silently lost.
   */
  private logRendererConsole(level: unknown, message: unknown): void {
    if (typeof level === 'string' && QUIET_CONSOLE_LEVELS.has(level.trim().toLowerCase())) {
      return
    }
    const text = String(message ?? '')
    const signature = `${String(level ?? '')}\u0000${text}`
    if (signature === this.lastConsoleSignature) return
    this.lastConsoleSignature = signature
    console.error(`[pill] console level=${String(level ?? 'log')} ${text}`)
  }

  private send(channel: string, ...args: unknown[]): void {
    if (this.disposed || this.win.isDestroyed()) return
    try {
      this.win.webContents.send(channel, ...args)
    } catch {
      // Renderer destroyed or detached
    }
  }
}

export interface StartRecordingOptions {
  targetApp?: PillTargetApp | null
}

export class PillWindowController {
  private readonly presenter: PillWindowPresenter
  private state: PillStatePayload = { mode: 'idle' }
  private autoHideTimer: NodeJS.Timeout | null = null

  constructor(presenter: PillWindowPresenter) {
    this.presenter = presenter
  }

  getState(): PillStatePayload {
    return this.state
  }

  startRecording(options?: StartRecordingOptions): void {
    this.clearAutoHide()
    this.state = {
      mode: 'recording',
      targetApp: options?.targetApp ?? null,
      error: null
    }
    this.presenter.show()
    this.presenter.update(this.state)
  }

  setAudioLevel(level: number): void {
    if (this.state.mode === 'recording') {
      this.presenter.setAudioLevel(level)
    }
  }

  /** Push a late-resolved target app to the pill without changing its look. */
  updateTargetApp(targetApp: PillTargetApp | null): void {
    if (this.state.mode === 'idle') return
    this.state = {
      ...this.state,
      targetApp
    }
    this.presenter.update(this.state)
  }

  startTranscribing(): void {
    this.clearAutoHide()
    this.state = {
      ...this.state,
      mode: 'transcribing'
    }
    this.presenter.update(this.state)
  }

  showSuccess(): void {
    this.clearAutoHide()
    this.state = {
      ...this.state,
      mode: 'success'
    }
    this.presenter.update(this.state)
    this.autoHideTimer = setTimeout(() => {
      this.cancel()
    }, SUCCESS_AUTO_HIDE_MS)
  }

  showError(message: string): void {
    this.clearAutoHide()
    this.state = {
      ...this.state,
      mode: 'error',
      error: message
    }
    this.presenter.update(this.state)
    this.autoHideTimer = setTimeout(() => {
      this.cancel()
    }, ERROR_AUTO_HIDE_MS)
  }

  cancel(): void {
    this.clearAutoHide()
    this.state = { mode: 'idle' }
    this.presenter.hide()
    this.presenter.update(this.state)
  }

  private clearAutoHide(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer)
      this.autoHideTimer = null
    }
  }

  dispose(): void {
    this.clearAutoHide()
    this.presenter.dispose()
  }
}
