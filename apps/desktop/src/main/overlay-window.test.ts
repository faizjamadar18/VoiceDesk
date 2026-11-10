import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { SCREEN_OVERLAY_IPC } from '../shared/types'

const state = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => void>(),
  sent: [] as Array<{ channel: string; payload?: unknown }>
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: {
    on: (channel: string, handler: (...args: unknown[]) => void) => {
      state.ipcHandlers.set(channel, handler)
    },
    removeListener: (channel: string) => {
      state.ipcHandlers.delete(channel)
    }
  }
}))

import { OverlayWindowPresenter } from './overlay-window'

function fakeWindow(): {
  win: BrowserWindow
  listeners: Map<string, (...args: unknown[]) => void>
} {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const win = {
    isDestroyed: () => false,
    webContents: {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        listeners.set(`web:${event}`, handler)
      },
      removeListener: (event: string) => {
        listeners.delete(`web:${event}`)
      },
      isDestroyed: () => false,
      send: (channel: string, payload?: unknown) => {
        state.sent.push({ channel, payload })
      }
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(`win:${event}`, handler)
    },
    removeListener: (event: string) => {
      listeners.delete(`win:${event}`)
    },
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    showInactive: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn()
  }
  return { win: win as unknown as BrowserWindow, listeners }
}

describe('OverlayWindowPresenter', () => {
  afterEach(() => {
    state.ipcHandlers.clear()
    state.sent.length = 0
  })

  it('flushes a pending start when the page loads without a ready message', () => {
    const { win, listeners } = fakeWindow()
    const presenter = new OverlayWindowPresenter(win)

    presenter.show({ x: 10, y: 20, width: 800, height: 600 })
    expect(state.sent).toEqual([])

    listeners.get('web:did-finish-load')?.()

    expect(state.sent).toEqual([
      {
        channel: SCREEN_OVERLAY_IPC.start,
        payload: { width: 800, height: 600 }
      }
    ])
    presenter.dispose()
  })

  it('flushes queued points after the ready handshake', () => {
    const { win } = fakeWindow()
    const presenter = new OverlayWindowPresenter(win)

    presenter.show({ x: 0, y: 0, width: 640, height: 480 })
    presenter.point({ x: 12, y: 24 })
    state.ipcHandlers.get(SCREEN_OVERLAY_IPC.ready)?.()

    expect(state.sent).toEqual([
      {
        channel: SCREEN_OVERLAY_IPC.start,
        payload: { width: 640, height: 480 }
      },
      {
        channel: SCREEN_OVERLAY_IPC.point,
        payload: { x: 12, y: 24 }
      }
    ])
    presenter.dispose()
  })
})
