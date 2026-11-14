import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'node:path'
import {
  SCREEN_OVERLAY_IPC,
  type ScreenOverlayPoint,
  type ScreenOverlayStart
} from '../shared/types'
import type { ScreenOverlayController, ScreenRect } from './screen-service'

interface FinishWaiter {
  resolve: () => void
  reject: (error: Error) => void
}

interface ComposeWaiter {
  resolve: (image: Uint8Array) => void
  reject: (error: Error) => void
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return null
}

function errorText(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null) {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
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
      preload: join(__dirname, '../preload/overlay.js'),
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
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setSkipTaskbar(true)

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl.replace(/\/+$/, '')}/overlay.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}

/**
 * Adapts the overlay BrowserWindow to the pure screen service. The window is
 * created warm at startup and only shown while a hold is live. Finish and
 * compose calls stay pending until the renderer has processed all points, with
 * the service applying the hard timeouts.
 */
export class OverlayWindowPresenter implements ScreenOverlayController {
  private readonly win: BrowserWindow
  private ready = false
  private disposed = false
  private pendingStart: ScreenOverlayStart | null = null
  private pendingPoints: ScreenOverlayPoint[] = []
  private finishWaiter: FinishWaiter | null = null
  private composeWaiter: ComposeWaiter | null = null

  private readonly handleReady = (): void => {
    if (this.disposed) return
    this.ready = true
    const start = this.pendingStart
    if (!start) return
    this.pendingStart = null
    this.send(SCREEN_OVERLAY_IPC.start, start)
    for (const point of this.pendingPoints) {
      this.send(SCREEN_OVERLAY_IPC.point, point)
    }
    this.pendingPoints = []
  }

  /**
   * The renderer also reports readiness, but a fast cached load can finish
   * before that message is observed. The load event is the authoritative
   * fallback: module scripts and their subscriptions have run by then.
   */
  private readonly handleDidFinishLoad = (): void => {
    this.handleReady()
  }

  private readonly handleFinishAck = (): void => {
    const waiter = this.finishWaiter
    this.finishWaiter = null
    waiter?.resolve()
  }

  private readonly handleComposed = (_event: IpcMainEvent, payload: unknown): void => {
    const image = toBytes(payload)
    if (!image || image.length === 0) {
      this.rejectCompose(new Error('The overlay returned an empty annotated image.'))
      return
    }
    const waiter = this.composeWaiter
    this.composeWaiter = null
    waiter?.resolve(image)
  }

  private readonly handleComposeError = (_event: IpcMainEvent, payload: unknown): void => {
    this.rejectCompose(
      new Error(errorText(payload, 'The overlay could not annotate the screenshot.'))
    )
  }

  private readonly handleLoadStart = (): void => {
    this.ready = false
    this.pendingStart = null
    this.pendingPoints = []
    this.rejectFinish(new Error('The screen overlay reloaded.'))
    this.rejectCompose(new Error('The screen overlay reloaded.'))
  }

  private readonly handleGone = (): void => {
    this.ready = false
    this.pendingStart = null
    this.pendingPoints = []
    this.rejectFinish(new Error('The screen overlay stopped unexpectedly.'))
    this.rejectCompose(new Error('The screen overlay stopped unexpectedly.'))
  }

  private readonly handleClosed = (): void => {
    this.disposed = true
    this.rejectFinish(new Error('The screen overlay was closed.'))
    this.rejectCompose(new Error('The screen overlay was closed.'))
  }

  constructor(win: BrowserWindow) {
    this.win = win

    ipcMain.on(SCREEN_OVERLAY_IPC.ready, this.handleReady)
    ipcMain.on(SCREEN_OVERLAY_IPC.finishAck, this.handleFinishAck)
    ipcMain.on(SCREEN_OVERLAY_IPC.composed, this.handleComposed)
    ipcMain.on(SCREEN_OVERLAY_IPC.composeError, this.handleComposeError)
    win.webContents.on('did-start-loading', this.handleLoadStart)
    win.webContents.on('did-finish-load', this.handleDidFinishLoad)
    win.webContents.on('render-process-gone', this.handleGone)
    win.on('closed', this.handleClosed)
  }

  show(bounds: ScreenRect, initialCursor?: ScreenOverlayPoint): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.applyBounds(bounds)
    this.pendingPoints = []
    const start: ScreenOverlayStart = {
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      cursor: initialCursor,
      tagText: 'Point to show VoiceOS'
    }
    this.pendingStart = start
    if (this.ready) {
      this.pendingStart = null
      this.send(SCREEN_OVERLAY_IPC.start, start)
    }
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.showInactive()
  }

  hide(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.win.hide()
  }

  point(point: ScreenOverlayPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    const payload = { x: point.x, y: point.y }
    if (!this.ready) {
      if (this.pendingStart) {
        this.pendingPoints.push(payload)
        if (this.pendingPoints.length > 2_400) this.pendingPoints.shift()
      }
      return
    }
    this.send(SCREEN_OVERLAY_IPC.point, payload)
  }

  finish(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed || this.win.isDestroyed()) {
        reject(new Error('The screen overlay is not available.'))
        return
      }
      if (!this.ready) {
        reject(new Error('The screen overlay is still loading. Try again.'))
        return
      }
      this.rejectFinish(new Error('The screen overlay was asked to finish again.'))
      this.finishWaiter = { resolve, reject }
      this.send(SCREEN_OVERLAY_IPC.finish)
    })
  }

  compose(image: Uint8Array): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      if (this.disposed || this.win.isDestroyed()) {
        reject(new Error('The screen overlay is not available.'))
        return
      }
      if (!this.ready) {
        reject(new Error('The screen overlay is still loading. Try again.'))
        return
      }
      this.rejectCompose(new Error('The screen overlay was asked to compose again.'))
      this.composeWaiter = { resolve, reject }
      this.send(SCREEN_OVERLAY_IPC.compose, { image })
    })
  }

  cancel(): void {
    this.pendingStart = null
    this.pendingPoints = []
    this.rejectFinish(new Error('The screen capture was cancelled.'))
    this.rejectCompose(new Error('The screen capture was cancelled.'))
    if (this.disposed || this.win.isDestroyed()) return
    this.send(SCREEN_OVERLAY_IPC.cancel)
    this.win.hide()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    ipcMain.removeListener(SCREEN_OVERLAY_IPC.ready, this.handleReady)
    ipcMain.removeListener(SCREEN_OVERLAY_IPC.finishAck, this.handleFinishAck)
    ipcMain.removeListener(SCREEN_OVERLAY_IPC.composed, this.handleComposed)
    ipcMain.removeListener(SCREEN_OVERLAY_IPC.composeError, this.handleComposeError)
    if (!this.win.isDestroyed()) {
      this.win.webContents.removeListener('did-start-loading', this.handleLoadStart)
      this.win.webContents.removeListener('did-finish-load', this.handleDidFinishLoad)
      this.win.webContents.removeListener('render-process-gone', this.handleGone)
      this.win.removeListener('closed', this.handleClosed)
    }
    this.rejectFinish(new Error('The screen overlay was disposed.'))
    this.rejectCompose(new Error('The screen overlay was disposed.'))
    if (!this.win.isDestroyed()) this.win.destroy()
  }

  private rejectFinish(error: Error): void {
    const waiter = this.finishWaiter
    this.finishWaiter = null
    waiter?.reject(error)
  }

  private rejectCompose(error: Error): void {
    const waiter = this.composeWaiter
    this.composeWaiter = null
    waiter?.reject(error)
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

  private applyBounds(bounds: ScreenRect): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height))
    })
  }
}
