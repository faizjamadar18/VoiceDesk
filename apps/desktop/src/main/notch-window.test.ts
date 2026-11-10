import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { NotchStatePayload } from '../shared/types'

const electronState = vi.hoisted(() => ({
  workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getPrimaryDisplay: () => ({ workArea: electronState.workArea }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 })
  }
}))

import {
  NOTCH_CONTENT_MARGIN,
  NOTCH_HEIGHT,
  NOTCH_RESULTS_HEIGHT,
  NotchWindowPresenter
} from './notch-window'

interface FakeWindow {
  win: BrowserWindow
  height: () => number
}

function fakeWindow(): FakeWindow {
  let bounds = { x: 630, y: 0, width: 660, height: NOTCH_HEIGHT }
  const win = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    getContentBounds: () => ({ ...bounds }),
    setBounds: (next: typeof bounds) => {
      bounds = { ...next }
    },
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    webContents: {
      on: vi.fn(),
      removeListener: vi.fn(),
      isDestroyed: () => false,
      send: vi.fn()
    },
    on: vi.fn(),
    removeListener: vi.fn()
  }
  return { win: win as unknown as BrowserWindow, height: () => bounds.height }
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
