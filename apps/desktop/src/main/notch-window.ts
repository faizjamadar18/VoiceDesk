import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import {
  IPC,
  type NotchInteractiveRegion,
  type NotchStatePayload
} from '../shared/types'
import { pointInInteractiveRegion, type ScreenBounds } from './interactive-region'
import type { NotchPresenter } from './notch-controller'

export const NOTCH_WIDTH = 660
export const NOTCH_HEIGHT = 300
export const NOTCH_RESULTS_HEIGHT = 620
/** Breathing room below the measured content before the window edge. */
export const NOTCH_CONTENT_MARGIN = 12

/**
 * Click-through overlays cannot trust forwarded mouse events alone: Electron
 * stops forwarding while an elevated window has focus. A small cursor poll is
 * the standard fallback and keeps the window inert everywhere except the card.
 */
const INTERACTION_POLL_MS = 80

export function notchBounds(
  height: number = NOTCH_HEIGHT
): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height: workHeight } = display.workArea
  return {
    x: Math.round(x + (width - NOTCH_WIDTH) / 2),
    y,
    width: NOTCH_WIDTH,
    height: Math.min(height, workHeight)
  }
}

export function createNotchWindow(): BrowserWindow {
  const bounds = notchBounds()
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setSkipTaskbar(true)

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl.replace(/\/+$/, '')}/notch.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/notch.html'))
  }

  return win
}

/**
 * Adapts the notch BrowserWindow to the controller. The window is created at
 * startup and kept hidden so the microphone and renderer are already warm on
 * the first hold. It is only ever shown with `showInactive()`.
 */
export class NotchWindowPresenter implements NotchPresenter {
  private readonly win: BrowserWindow
  private ready = false
  private pendingStart: number | null = null
  private lastState: NotchStatePayload | null = null
  private lastPartial = ''
  private inputEnabled = false
  private contentHeight = NOTCH_HEIGHT
  private disposed = false
  private interactive = false
  private interactiveRegion: NotchInteractiveRegion | null = null
  private interactionTimer: NodeJS.Timeout | null = null

  constructor(win: BrowserWindow) {
    this.win = win

    win.webContents.on('did-start-loading', () => {
      this.ready = false
      this.clearInteraction()
    })
    win.webContents.on('render-process-gone', () => {
      this.ready = false
      this.clearInteraction()
    })
    win.on('closed', () => {
      this.disposed = true
    })
  }

  handleReady(): void {
    this.ready = true
    if (this.pendingStart !== null) {
      this.send(IPC.notchStart, { sessionId: this.pendingStart })
      this.pendingStart = null
    }
    if (this.lastState) this.send(IPC.notchState, this.lastState)
    if (this.lastPartial) this.send(IPC.notchPartial, this.lastPartial)
  }

  show(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.contentHeight = NOTCH_HEIGHT
    this.applyBounds()
    this.clearInteraction()
    this.send(IPC.notchShow)
    this.win.showInactive()
  }

  hide(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.clearInteraction()
    this.inputEnabled = false
    this.contentHeight = NOTCH_HEIGHT
    this.applyBounds()
    this.lastState = null
    this.lastPartial = ''
    this.send(IPC.notchHide)
    this.win.hide()
  }

  /**
   * The notch is click-through by default. This is the only place that hands
   * mouse input to the window, and it does so only for the visible card.
   */
  setInteractive(interactive: boolean): void {
    if (this.disposed || this.win.isDestroyed()) return
    const next = interactive && this.win.isVisible()
    if (next === this.interactive) return
    this.interactive = next
    if (next) {
      this.win.setIgnoreMouseEvents(false)
    } else {
      this.win.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  /**
   * The renderer reports the visible content rectangle after layout. The
   * window grows to fit readable answer text (clamped to the results height)
   * instead of assuming every result needs the full tall card.
   */
  setRegion(region: NotchInteractiveRegion | null): void {
    this.interactiveRegion = region
    if (region === null) {
      // Keep the current height: the renderer briefly clears its region while
      // re-laying out, and resetting here would make the window flicker.
      // show(), hide(), startSession(), and cancelSession() own the reset.
      this.stopInteractionPolling()
      this.setInteractive(false)
      return
    }

    const next = Math.max(
      NOTCH_HEIGHT,
      Math.min(
        NOTCH_RESULTS_HEIGHT,
        Math.ceil(region.top + region.height + NOTCH_CONTENT_MARGIN)
      )
    )
    if (next !== this.contentHeight) {
      this.contentHeight = next
      this.applyBounds()
    }

    if (this.inputEnabled && this.win.isVisible()) {
      this.startInteractionPolling()
      this.syncPointer()
    }
  }

  startSession(sessionId: number): void {
    this.lastPartial = ''
    this.lastState = null
    this.inputEnabled = false
    this.contentHeight = NOTCH_HEIGHT
    this.clearInteraction()
    this.applyBounds()
    this.pendingStart = sessionId
    if (this.ready) {
      this.send(IPC.notchStart, { sessionId })
      this.pendingStart = null
    }
  }

  stopSession(): void {
    this.send(IPC.notchStop)
  }

  cancelSession(): void {
    this.lastPartial = ''
    this.lastState = null
    this.inputEnabled = false
    this.contentHeight = NOTCH_HEIGHT
    this.clearInteraction()
    this.applyBounds()
    this.pendingStart = null
    this.send(IPC.notchCancel)
  }

  update(state: NotchStatePayload): void {
    this.lastState = state
    if (state.transcript) this.lastPartial = state.transcript

    // Answers are selectable and scrollable, so they need the same pointer
    // handoff as cards. The height still comes from the measured content.
    const inputEnabled =
      Array.isArray(state.results) ||
      state.decision != null ||
      ((state.phase === 'result' || state.phase === 'error') && !!state.message)

    this.send(IPC.notchState, state)
    if (inputEnabled !== this.inputEnabled) {
      this.inputEnabled = inputEnabled
      if (inputEnabled) {
        this.startInteractionPolling()
      } else {
        this.clearInteraction()
      }
    }
  }

  partial(text: string): void {
    this.lastPartial = text
    this.send(IPC.notchPartial, text)
  }

  dispose(): void {
    this.disposed = true
    this.stopInteractionPolling()
    if (!this.win.isDestroyed()) this.win.destroy()
  }

  private clearInteraction(): void {
    this.stopInteractionPolling()
    this.interactiveRegion = null
    this.setInteractive(false)
  }

  private startInteractionPolling(): void {
    if (this.interactionTimer !== null) return
    this.interactionTimer = setInterval(() => this.syncPointer(), INTERACTION_POLL_MS)
    this.syncPointer()
  }

  private stopInteractionPolling(): void {
    if (this.interactionTimer !== null) clearInterval(this.interactionTimer)
    this.interactionTimer = null
  }

  private syncPointer(): void {
    if (
      this.disposed ||
      this.win.isDestroyed() ||
      !this.win.isVisible() ||
      !this.inputEnabled ||
      this.interactiveRegion === null
    ) {
      this.setInteractive(false)
      return
    }
    const content: ScreenBounds = this.win.getContentBounds()
    this.setInteractive(
      pointInInteractiveRegion(
        screen.getCursorScreenPoint(),
        content,
        this.interactiveRegion
      )
    )
  }

  private send(channel: string, payload?: unknown): void {
    if (!this.ready || this.disposed || this.win.isDestroyed()) return
    if (this.win.webContents.isDestroyed()) return
    if (payload === undefined) {
      this.win.webContents.send(channel)
    } else {
      this.win.webContents.send(channel, payload)
    }
  }

  private applyBounds(): void {
    if (this.disposed || this.win.isDestroyed()) return
    const next = notchBounds(this.contentHeight)
    const current = this.win.getBounds()
    if (
      current.x !== next.x ||
      current.y !== next.y ||
      current.width !== next.width ||
      current.height !== next.height
    ) {
      this.win.setBounds(next)
    }
  }
}
