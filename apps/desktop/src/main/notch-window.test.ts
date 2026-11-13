import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC, type NotchStatePayload } from '../shared/types'

const electronState = vi.hoisted(() => ({
  workArea: { x: 0, y: 0, width: 1_920, height: 1_080 },
  bounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
  cursor: { x: 0, y: 0 },
  lastWindowOptions: null as Record<string, unknown> | null
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
    getPrimaryDisplay: () => ({
      workArea: electronState.workArea,
      bounds: electronState.bounds
    }),
    getDisplayNearestPoint: () => ({
      workArea: electronState.workArea,
      bounds: electronState.bounds
    }),
    getCursorScreenPoint: () => electronState.cursor,
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

import {
  NOTCH_CONTENT_MARGIN,
  NOTCH_HEIGHT,
  NOTCH_RESULTS_HEIGHT,
  NotchWindowPresenter,
  createNotchWindow,
  notchBounds
} from './notch-window'

interface FakeWindow {
  win: BrowserWindow
  height: () => number
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  setAlwaysOnTop: ReturnType<typeof vi.fn>
  moveTop: ReturnType<typeof vi.fn>
  blur: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function fakeWindow(options: { focused?: boolean } = {}): FakeWindow {
  let bounds = { x: 630, y: 0, width: 660, height: NOTCH_HEIGHT }
  const setIgnoreMouseEvents = vi.fn()
  const setAlwaysOnTop = vi.fn()
  const moveTop = vi.fn()
  const blur = vi.fn()
  const hide = vi.fn()
  const send = vi.fn()
  const focused = options.focused ?? false
  const win = {
    isDestroyed: () => false,
    isVisible: () => true,
    isFocused: () => focused,
    getBounds: () => ({ ...bounds }),
    getContentBounds: () => ({ ...bounds }),
    setBounds: (next: typeof bounds) => {
      bounds = { ...next }
    },
    setAlwaysOnTop,
    setVisibleOnAllWorkspaces: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setFullScreenable: vi.fn(),
    setFocusable: vi.fn(),
    focus: vi.fn(),
    moveTop,
    setIgnoreMouseEvents,
    showInactive: vi.fn(),
    show: vi.fn(),
    blur,
    hide,
    destroy: vi.fn(),
    webContents: {
      on: vi.fn(),
      removeListener: vi.fn(),
      isDestroyed: () => false,
      send
    },
    on: vi.fn(),
    removeListener: vi.fn()
  }
  return {
    win: win as unknown as BrowserWindow,
    height: () => bounds.height,
    setIgnoreMouseEvents,
    setAlwaysOnTop,
    moveTop,
    blur,
    hide,
    send
  }
}

function result(message: string): NotchStatePayload {
  return {
    phase: 'result',
    status: 'ok',
    transcript: 'what is this?',
    message,
    spoken: message,
    at: 1
  }
}

describe('NotchWindowPresenter sizing', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('grows the window to the measured answer height', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)

    presenter.update(result('The file could not be found.'))
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 360 })

    expect(target.height()).toBe(360 + NOTCH_CONTENT_MARGIN)
    presenter.dispose()
  })

  it('keeps short answers at the compact height', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)

    presenter.update(result('Yes.'))
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 120 })

    expect(target.height()).toBe(NOTCH_HEIGHT)
    presenter.dispose()
  })

  it('caps very long answers at the results height', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)

    presenter.update(result('long'))
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 900 })

    expect(target.height()).toBe(NOTCH_RESULTS_HEIGHT)
    presenter.dispose()
  })

  it('returns to the compact height after hiding', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)

    presenter.update(result('A longer answer.'))
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 360 })
    presenter.hide()

    expect(target.height()).toBe(NOTCH_HEIGHT)
    presenter.dispose()
  })
})

describe('notchBounds', () => {
  afterEach(() => {
    electronState.bounds = { x: 0, y: 0, width: 1_920, height: 1_080 }
  })

  it('pins to physical top center of display based on display.bounds', () => {
    electronState.bounds = { x: 100, y: 50, width: 1_920, height: 1_080 }
    const bounds = notchBounds(300)
    expect(bounds).toEqual({
      x: 100 + Math.round((1_920 - 660) / 2),
      y: 50,
      width: 660,
      height: 300
    })
  })
})

describe('createNotchWindow', () => {
  afterEach(() => {
    electronState.lastWindowOptions = null
    vi.clearAllMocks()
  })

  it('creates a focusable window with acceptFirstMouse enabled', () => {
    const win = createNotchWindow()

    expect(electronState.lastWindowOptions).toMatchObject({
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      movable: false,
      focusable: true,
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

describe('NotchWindowPresenter interaction & dismissal', () => {
  afterEach(() => {
    electronState.cursor = { x: 0, y: 0 }
    vi.clearAllMocks()
  })

  it('keeps listening click-through and enables interaction during processing, acting, and spoken', () => {
    electronState.cursor = { x: 700, y: 20 }
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)
    presenter.handleReady()
    presenter.show()
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 80 })

    presenter.update({
      phase: 'listening',
      transcript: null,
      message: null,
      at: 1
    })
    expect(target.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false)

    presenter.update({
      phase: 'processing',
      transcript: 'hi',
      message: 'Transcribing locally…',
      at: 2
    })
    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    presenter.dispose()

    const actingTarget = fakeWindow()
    const actingPresenter = new NotchWindowPresenter(actingTarget.win)
    actingPresenter.handleReady()
    actingPresenter.show()
    actingPresenter.setRegion({ left: 20, top: 0, width: 520, height: 80 })
    actingPresenter.update({
      phase: 'acting',
      transcript: 'hi',
      message: 'Working on it…',
      at: 3
    })
    expect(actingTarget.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    actingPresenter.dispose()

    const spokenTarget = fakeWindow()
    const spokenPresenter = new NotchWindowPresenter(spokenTarget.win)
    spokenPresenter.handleReady()
    spokenPresenter.show()
    spokenPresenter.setRegion({ left: 20, top: 0, width: 520, height: 80 })
    spokenPresenter.update({
      phase: 'listening',
      transcript: null,
      message: null,
      spoken: 'Hello',
      at: 4
    })
    expect(spokenTarget.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    spokenPresenter.dispose()
  })

  it('enables interaction immediately when speech becomes active', () => {
    electronState.cursor = { x: 700, y: 20 }
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)
    presenter.handleReady()
    presenter.show()
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 80 })

    presenter.setSpeechActive(true)

    expect(target.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    presenter.dispose()
  })

  it('blurs before hiding when focused and skips blur when unfocused', () => {
    const focusedTarget = fakeWindow({ focused: true })
    const focusedPresenter = new NotchWindowPresenter(focusedTarget.win)
    focusedPresenter.hide()

    expect(focusedTarget.blur).toHaveBeenCalledTimes(1)
    expect(focusedTarget.hide).toHaveBeenCalledTimes(1)
    expect(focusedTarget.blur.mock.invocationCallOrder[0]).toBeLessThan(
      focusedTarget.hide.mock.invocationCallOrder[0]
    )
    focusedPresenter.dispose()

    const unfocusedTarget = fakeWindow({ focused: false })
    const unfocusedPresenter = new NotchWindowPresenter(unfocusedTarget.win)
    unfocusedPresenter.hide()

    expect(unfocusedTarget.blur).not.toHaveBeenCalled()
    expect(unfocusedTarget.hide).toHaveBeenCalledTimes(1)
    unfocusedPresenter.dispose()
  })

  it('sends notchDismiss to the renderer on dismissWithAnimation', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)
    presenter.handleReady()

    presenter.dismissWithAnimation()

    expect(target.send).toHaveBeenCalledWith(IPC.notchDismiss)
    presenter.dispose()
  })

  it('determines whether a screen coordinate is inside the interactive region', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)
    presenter.handleReady()
    presenter.show()

    // When region is null, isPointInside returns false
    expect(presenter.isPointInside(650, 50)).toBe(false)

    // Notch window bounds in fakeWindow: x: 630, y: 0, width: 660, height: 300
    // Set interactive region at left: 20, top: 0, width: 520, height: 100
    // Screen bounds of interactive region: x: 630 + 20 = 650 to 1170, y: 0 to 100
    presenter.setRegion({ left: 20, top: 0, width: 520, height: 100 })

    expect(presenter.isPointInside(700, 50)).toBe(true)
    expect(presenter.isPointInside(640, 50)).toBe(false)
    expect(presenter.isPointInside(700, 150)).toBe(false)

    // When hidden, returns false
    presenter.hide()
    expect(presenter.isPointInside(700, 50)).toBe(false)

    presenter.dispose()
  })

  it('re-asserts moveTop and setAlwaysOnTop on show and reposition', () => {
    const target = fakeWindow()
    const presenter = new NotchWindowPresenter(target.win)

    presenter.show()
    expect(target.moveTop).toHaveBeenCalled()
    expect(target.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    target.moveTop.mockClear()
    target.setAlwaysOnTop.mockClear()

    presenter.reposition()
    expect(target.moveTop).toHaveBeenCalled()
    expect(target.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    presenter.dispose()
  })
})
