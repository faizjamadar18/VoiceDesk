import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC, type NotchStatePayload } from '../shared/types'

const electronState = vi.hoisted(() => ({
  workArea: { x: 0, y: 0, width: 1_920, height: 1_080 },
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
    loadURL = vi.fn()
    loadFile = vi.fn().mockResolvedValue(undefined)
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: electronState.workArea }),
    getCursorScreenPoint: () => electronState.cursor
  }
}))

import {
  NOTCH_CONTENT_MARGIN,
  NOTCH_HEIGHT,
  NOTCH_RESULTS_HEIGHT,
  NotchWindowPresenter,
  createNotchWindow
} from './notch-window'

interface FakeWindow {
  win: BrowserWindow
  height: () => number
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  blur: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function fakeWindow(options: { focused?: boolean } = {}): FakeWindow {
  let bounds = { x: 630, y: 0, width: 660, height: NOTCH_HEIGHT }
  const setIgnoreMouseEvents = vi.fn()
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
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setIgnoreMouseEvents,
    showInactive: vi.fn(),
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

describe('createNotchWindow', () => {
  afterEach(() => {
    electronState.lastWindowOptions = null
    vi.clearAllMocks()
  })

  it('creates a focusable window with acceptFirstMouse enabled', () => {
    createNotchWindow()

    expect(electronState.lastWindowOptions).toMatchObject({
      focusable: true,
      acceptFirstMouse: true
    })
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
})
