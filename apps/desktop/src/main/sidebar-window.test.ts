import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/types'

const electronState = vi.hoisted(() => ({
  displayBounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
  cursor: { x: 0, y: 0 },
  lastWindowOptions: null as Record<string, unknown> | null,
  displayMetricsListeners: [] as Array<() => void>,
  displayAddedListeners: [] as Array<() => void>,
  displayRemovedListeners: [] as Array<() => void>
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: Record<string, unknown>) {
      electronState.lastWindowOptions = options
    }
    setIgnoreMouseEvents = vi.fn()
    setAlwaysOnTop = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setSkipTaskbar = vi.fn()
    setFullScreenable = vi.fn()
    moveTop = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn().mockResolvedValue(undefined)
  },
  screen: {
    getPrimaryDisplay: () => ({ bounds: electronState.displayBounds }),
    getCursorScreenPoint: () => electronState.cursor,
    on: (event: string, listener: () => void) => {
      if (event === 'display-metrics-changed') electronState.displayMetricsListeners.push(listener)
      if (event === 'display-added') electronState.displayAddedListeners.push(listener)
      if (event === 'display-removed') electronState.displayRemovedListeners.push(listener)
    },
    removeListener: (event: string, listener: () => void) => {
      if (event === 'display-metrics-changed') {
        electronState.displayMetricsListeners = electronState.displayMetricsListeners.filter(
          (l) => l !== listener
        )
      }
      if (event === 'display-added') {
        electronState.displayAddedListeners = electronState.displayAddedListeners.filter(
          (l) => l !== listener
        )
      }
      if (event === 'display-removed') {
        electronState.displayRemovedListeners = electronState.displayRemovedListeners.filter(
          (l) => l !== listener
        )
      }
    }
  }
}))

import {
  INTERACTION_POLL_MS,
  SIDEBAR_WIDTH,
  SidebarWindow,
  createSidebarBrowserWindow,
  sidebarBounds
} from './sidebar-window'

const expectedIgnoreArgs =
  process.platform === 'win32' ? ([true] as const) : ([true, { forward: true }] as const)

interface FakeWindow {
  win: BrowserWindow
  setBounds: ReturnType<typeof vi.fn>
  getBounds: () => { x: number; y: number; width: number; height: number }
  getContentBounds: () => { x: number; y: number; width: number; height: number }
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  setAlwaysOnTop: ReturnType<typeof vi.fn>
  moveTop: ReturnType<typeof vi.fn>
  showInactive: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
}

function fakeSidebarWindow(): FakeWindow {
  let bounds = { x: 0, y: 0, width: SIDEBAR_WIDTH, height: 1_080 }
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  const setBounds = vi.fn((next: typeof bounds) => {
    bounds = { ...next }
  })
  const setIgnoreMouseEvents = vi.fn()
  const setAlwaysOnTop = vi.fn()
  const moveTop = vi.fn()
  const showInactive = vi.fn()
  const hide = vi.fn()
  const send = vi.fn()
  const destroy = vi.fn()

  const on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(listener)
  })

  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners[event] ?? []) {
      listener(...args)
    }
  }

  const win = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    getContentBounds: () => ({ ...bounds }),
    setBounds,
    setIgnoreMouseEvents,
    setAlwaysOnTop,
    setVisibleOnAllWorkspaces: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setFullScreenable: vi.fn(),
    moveTop,
    showInactive,
    hide,
    destroy,
    webContents: {
      isDestroyed: () => false,
      send
    },
    on,
    removeListener: vi.fn()
  }

  return {
    win: win as unknown as BrowserWindow,
    setBounds,
    getBounds: () => bounds,
    getContentBounds: () => bounds,
    setIgnoreMouseEvents,
    setAlwaysOnTop,
    moveTop,
    showInactive,
    hide,
    send,
    destroy,
    emit
  }
}

describe('sidebarBounds', () => {
  it('docks to the left edge with width 260 and display height', () => {
    electronState.displayBounds = { x: 100, y: 50, width: 2_560, height: 1_440 }
    const bounds = sidebarBounds()
    expect(bounds).toEqual({
      x: 100,
      y: 50,
      width: 260,
      height: 1_440
    })
  })
})

describe('createSidebarBrowserWindow', () => {
  afterEach(() => {
    electronState.lastWindowOptions = null
    vi.clearAllMocks()
  })

  it('configures window flags correctly', () => {
    electronState.displayBounds = { x: 0, y: 0, width: 1_920, height: 1_080 }
    const win = createSidebarBrowserWindow()

    expect(electronState.lastWindowOptions).toMatchObject({
      x: 0,
      y: 0,
      width: 260,
      height: 1_080,
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
      hiddenInMissionControl: true
    })

    if (process.platform === 'darwin') {
      expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    } else {
      expect(win.setVisibleOnAllWorkspaces).not.toHaveBeenCalled()
    }
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })
})

describe('SidebarWindow', () => {
  afterEach(() => {
    electronState.displayBounds = { x: 0, y: 0, width: 1_920, height: 1_080 }
    electronState.cursor = { x: 0, y: 0 }
    vi.clearAllMocks()
  })

  it('show and hide control window visibility without stealing focus', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    sidebar.show()
    expect(target.showInactive).toHaveBeenCalled()

    sidebar.hide()
    expect(target.hide).toHaveBeenCalled()

    sidebar.dispose()
  })

  it('setIgnoreMouseEvents toggles mouse pass-through', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    sidebar.setIgnoreMouseEvents(true)
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(...expectedIgnoreArgs)

    sidebar.setIgnoreMouseEvents(false)
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)

    sidebar.dispose()
  })

  it('reinforces moveTop and setAlwaysOnTop on show, syncPointer, and expansion', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    sidebar.show()
    expect(target.moveTop).toHaveBeenCalled()
    expect(target.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    target.moveTop.mockClear()
    target.setAlwaysOnTop.mockClear()

    // Hover inside sliver
    electronState.cursor = { x: 0, y: 300 }
    sidebar.syncPointer()
    expect(target.moveTop).toHaveBeenCalled()
    expect(target.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    target.moveTop.mockClear()
    target.setAlwaysOnTop.mockClear()

    // Expand sidebar (height >= 500)
    sidebar.setRegion({ left: 0, top: 100, width: 232, height: 580 })
    expect(target.moveTop).toHaveBeenCalled()
    expect(target.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    sidebar.dispose()
  })

  it('updates bounds when display metrics change', () => {
    electronState.displayBounds = { x: 0, y: 0, width: 1_920, height: 1_080 }
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    electronState.displayBounds = { x: 0, y: 0, width: 2_560, height: 1_440 }
    for (const listener of electronState.displayMetricsListeners) {
      listener()
    }

    expect(target.setBounds).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 260,
      height: 1_440
    })

    sidebar.dispose()
  })

  it('sends IPC messages to renderer webContents', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    sidebar.send('kestrel:history-changed')
    expect(target.send).toHaveBeenCalledWith('kestrel:history-changed')

    sidebar.send('custom:channel', { foo: 'bar' })
    expect(target.send).toHaveBeenCalledWith('custom:channel', { foo: 'bar' })

    sidebar.dispose()
  })

  it('tracks interactive region and synchronizes pointer for mouse pass-through', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    // Cursor inside interactive sliver
    electronState.cursor = { x: 10, y: 300 }
    sidebar.setRegion({ left: 0, top: 250, width: 24, height: 100 })
    expect(sidebar.getRegion()).toEqual({ left: 0, top: 250, width: 24, height: 100 })
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)

    // Cursor moves outside interactive region
    electronState.cursor = { x: 100, y: 300 }
    sidebar.syncPointer()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(...expectedIgnoreArgs)

    // Clearing region stops interaction and enables pass-through
    sidebar.setRegion(null)
    expect(sidebar.getRegion()).toBeNull()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(...expectedIgnoreArgs)

    sidebar.dispose()
  })

  it('sends IPC.sidebarCollapse on window blur', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    target.emit('blur')
    expect(target.send).toHaveBeenCalledWith(IPC.sidebarCollapse)

    sidebar.dispose()
  })

  it('detects cursor at leftmost edge and broadcasts IPC.sidebarPointer', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    // Cursor at extreme left edge (x=1 <= 1)
    electronState.cursor = { x: 1, y: 400 }
    sidebar.syncPointer()

    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(target.send).toHaveBeenCalledWith(IPC.sidebarPointer, {
      atLeftEdge: true,
      x: 1,
      y: 400
    })

    // Cursor at extreme left edge (x=0)
    electronState.cursor = { x: 0, y: 400 }
    sidebar.syncPointer()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(target.send).toHaveBeenCalledWith(IPC.sidebarPointer, {
      atLeftEdge: true,
      x: 0,
      y: 400
    })

    // Cursor at negative coordinate x=-2 (slammed against left edge)
    electronState.cursor = { x: -2, y: 400 }
    sidebar.syncPointer()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)

    // Cursor outside left edge and outside region (x=5)
    electronState.cursor = { x: 5, y: 400 }
    sidebar.syncPointer()

    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(...expectedIgnoreArgs)
    expect(target.send).toHaveBeenCalledWith(IPC.sidebarPointer, {
      atLeftEdge: false,
      x: 5,
      y: 400
    })

    // Interaction is enabled when cursor is inside interactive region
    sidebar.setRegion({ left: 0, top: 350, width: 24, height: 100 })
    electronState.cursor = { x: 10, y: 400 }
    sidebar.syncPointer()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)

    // Outside interactive region and not at left edge, click-through is enabled (no 40px corridor)
    electronState.cursor = { x: 30, y: 400 }
    sidebar.syncPointer()
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(...expectedIgnoreArgs)

    sidebar.dispose()
  })

  it('evaluates isPointInside based on the interactive region', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    expect(sidebar.isPointInside(10, 300)).toBe(false)

    sidebar.setRegion({ left: 0, top: 200, width: 232, height: 580 })
    expect(sidebar.isPointInside(100, 300)).toBe(true)
    expect(sidebar.isPointInside(240, 300)).toBe(false)
    expect(sidebar.isPointInside(100, 100)).toBe(false)

    sidebar.dispose()
  })

  it('evaluates isExpanded based on region height', () => {
    const target = fakeSidebarWindow()
    const sidebar = new SidebarWindow(target.win)

    expect(sidebar.isExpanded()).toBe(false)

    sidebar.setRegion({ left: 0, top: 200, width: 26, height: 48 })
    expect(sidebar.isExpanded()).toBe(false)

    sidebar.setRegion({ left: 0, top: 100, width: 232, height: 580 })
    expect(sidebar.isExpanded()).toBe(true)

    sidebar.dispose()
  })

  it('exposes correct interaction poll interval', () => {
    expect(INTERACTION_POLL_MS).toBe(50)
  })
})
