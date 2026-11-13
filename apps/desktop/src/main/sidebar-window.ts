import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC, type SidebarInteractiveRegion } from '../shared/types'
import { pointInInteractiveRegion, type ScreenBounds } from './interactive-region'

export const SIDEBAR_WIDTH = 260
export const INTERACTION_POLL_MS = 50

export function sidebarBounds(): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: SIDEBAR_WIDTH,
    height: display.bounds.height
  }
}

export function createSidebarBrowserWindow(): BrowserWindow {
  const bounds = sidebarBounds()
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
    focusable: process.platform === 'win32',
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

  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setFullScreenable(false)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else if (process.platform === 'win32') {
    win.setAlwaysOnTop(true, 'screen-saver')
  } else {
    win.setAlwaysOnTop(true, 'screen-saver')
  }
  win.setSkipTaskbar(true)

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl.replace(/\/+$/, '')}/sidebar.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/sidebar.html'))
  }

  return win
}

export class SidebarWindow {
  readonly win: BrowserWindow
  private disposed = false
  private isSliverRevealed = false
  private interactiveRegion: SidebarInteractiveRegion | null = null
  private interactionTimer: NodeJS.Timeout | null = null
  private readonly onDisplayMetricsChanged: () => void

  constructor(win?: BrowserWindow) {
    this.win = win ?? createSidebarBrowserWindow()
    this.onDisplayMetricsChanged = () => this.applyBounds()

    screen.on('display-metrics-changed', this.onDisplayMetricsChanged)
    screen.on('display-added', this.onDisplayMetricsChanged)
    screen.on('display-removed', this.onDisplayMetricsChanged)

    this.win.on('blur', () => {
      this.isSliverRevealed = false
      this.send(IPC.sidebarCollapse)
    })

    this.win.on('closed', () => {
      this.dispose()
    })
  }

  get webContents(): BrowserWindow['webContents'] {
    return this.win.webContents
  }

  get window(): BrowserWindow {
    return this.win
  }

  show(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.applyBounds()
    this.win.showInactive()
    if (typeof this.win.moveTop === 'function') {
      this.win.moveTop()
    }
    if (typeof this.win.setAlwaysOnTop === 'function') {
      this.win.setAlwaysOnTop(true, 'screen-saver')
    }
    this.startInteractionPolling()
    this.syncPointer()
  }

  hide(): void {
    if (this.disposed || this.win.isDestroyed()) return
    this.stopInteractionPolling()
    this.win.hide()
  }

  setRegion(region: SidebarInteractiveRegion | null): void {
    const wasExpanded = this.isExpanded()
    this.interactiveRegion = region
    if (region === null) {
      this.isSliverRevealed = false
    }
    if (this.isExpanded() && !wasExpanded) {
      if (typeof this.win.moveTop === 'function') {
        this.win.moveTop()
      }
      if (typeof this.win.setAlwaysOnTop === 'function') {
        this.win.setAlwaysOnTop(true, 'screen-saver')
      }
    }
    if (this.win.isVisible()) {
      this.startInteractionPolling()
      this.syncPointer()
    }
  }

  setSliverRevealed(revealed: boolean): void {
    this.isSliverRevealed = revealed
  }

  getSliverRevealed(): boolean {
    return this.isSliverRevealed
  }

  getRegion(): SidebarInteractiveRegion | null {
    return this.interactiveRegion
  }

  isPointInside(screenX: number, screenY: number): boolean {
    if (
      this.disposed ||
      this.win.isDestroyed() ||
      !this.win.isVisible() ||
      this.interactiveRegion === null
    ) {
      return false
    }
    const content: ScreenBounds =
      typeof this.win.getContentBounds === 'function'
        ? this.win.getContentBounds()
        : this.win.getBounds()
    return pointInInteractiveRegion(
      { x: screenX, y: screenY },
      content,
      this.interactiveRegion
    )
  }

  isExpanded(): boolean {
    return (
      !this.disposed &&
      !this.win.isDestroyed() &&
      this.interactiveRegion !== null &&
      this.interactiveRegion.height >= 500
    )
  }

  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void {
    if (this.disposed || this.win.isDestroyed()) return
    if (process.platform === 'win32') {
      this.win.setIgnoreMouseEvents(ignore)
    } else {
      if (ignore) {
        this.win.setIgnoreMouseEvents(true, { forward: options?.forward ?? true })
      } else {
        this.win.setIgnoreMouseEvents(false)
      }
    }
  }

  syncPointer(): void {
    if (
      this.disposed ||
      this.win.isDestroyed() ||
      !this.win.isVisible()
    ) {
      this.setIgnoreMouseEvents(true, { forward: true })
      return
    }
    const content: ScreenBounds =
      typeof this.win.getContentBounds === 'function'
        ? this.win.getContentBounds()
        : this.win.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const localX = cursor.x - content.x
    const localY = cursor.y - content.y
    const atLeftEdge = localX <= 1 && localY >= 0 && localY <= content.height
    const insideInteractiveRegion =
      this.interactiveRegion !== null &&
      pointInInteractiveRegion(cursor, content, this.interactiveRegion)

    if (insideInteractiveRegion || atLeftEdge) {
      if (typeof this.win.moveTop === 'function') {
        this.win.moveTop()
      }
      if (typeof this.win.setAlwaysOnTop === 'function') {
        this.win.setAlwaysOnTop(true, 'screen-saver')
      }
      this.setIgnoreMouseEvents(false)
      this.send(IPC.sidebarPointer, { atLeftEdge, x: localX, y: localY })
    } else {
      if (this.isExpanded()) {
        if (typeof this.win.moveTop === 'function') {
          this.win.moveTop()
        }
        if (typeof this.win.setAlwaysOnTop === 'function') {
          this.win.setAlwaysOnTop(true, 'screen-saver')
        }
      }
      this.setIgnoreMouseEvents(true, { forward: true })
      this.send(IPC.sidebarPointer, { atLeftEdge: false, x: localX, y: localY })
    }
  }

  private startInteractionPolling(): void {
    if (this.interactionTimer !== null) return
    this.interactionTimer = setInterval(() => this.syncPointer(), INTERACTION_POLL_MS)
  }

  private stopInteractionPolling(): void {
    if (this.interactionTimer !== null) {
      clearInterval(this.interactionTimer)
      this.interactionTimer = null
    }
  }

  applyBounds(): void {
    if (this.disposed || this.win.isDestroyed()) return
    const next = sidebarBounds()
    const current = this.win.getBounds()
    if (
      current.x !== next.x ||
      current.y !== next.y ||
      current.width !== next.width ||
      current.height !== next.height
    ) {
      this.win.setBounds(next)
    }
    if (this.win.isVisible()) {
      if (typeof this.win.moveTop === 'function') {
        this.win.moveTop()
      }
      if (typeof this.win.setAlwaysOnTop === 'function') {
        this.win.setAlwaysOnTop(true, 'screen-saver')
      }
    }
  }

  send(channel: string, payload?: unknown): void {
    if (this.disposed || this.win.isDestroyed()) return
    if (this.win.webContents.isDestroyed()) return
    if (payload === undefined) {
      this.win.webContents.send(channel)
    } else {
      this.win.webContents.send(channel, payload)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopInteractionPolling()
    screen.removeListener('display-metrics-changed', this.onDisplayMetricsChanged)
    screen.removeListener('display-added', this.onDisplayMetricsChanged)
    screen.removeListener('display-removed', this.onDisplayMetricsChanged)
    if (!this.win.isDestroyed()) {
      this.win.destroy()
    }
  }
}

export function createSidebarWindow(win?: BrowserWindow): SidebarWindow {
  return new SidebarWindow(win)
}
