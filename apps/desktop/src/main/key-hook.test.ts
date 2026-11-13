import { describe, expect, it, vi } from 'vitest'
import { buildKeyBinding, startKeyHook } from './key-hook'
import { parseHotkey } from './hotkey'

const uiohookListeners: Record<string, Array<(...args: unknown[]) => void>> = {}
vi.mock('uiohook-napi', () => ({
  uIOhook: {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!uiohookListeners[event]) uiohookListeners[event] = []
      uiohookListeners[event].push(listener)
    }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (uiohookListeners[event]) {
        uiohookListeners[event] = uiohookListeners[event].filter((l) => l !== listener)
      }
    }),
    start: vi.fn(),
    stop: vi.fn()
  },
  UiohookKey: {
    Ctrl: 29,
    CtrlRight: 3613,
    Alt: 56,
    AltRight: 3640,
    Shift: 42,
    ShiftRight: 54,
    Meta: 3675,
    MetaRight: 3676,
    Escape: 1,
    Space: 57,
    F8: 66,
    K: 37
  }
}))

const keys = {
  Ctrl: 29,
  CtrlRight: 3613,
  Alt: 56,
  AltRight: 3640,
  Shift: 42,
  ShiftRight: 54,
  Meta: 3675,
  MetaRight: 3676,
  Escape: 1,
  Space: 57,
  F8: 66,
  K: 37
}

describe('buildKeyBinding', () => {
  it('maps the default chord and includes both sides of each modifier', () => {
    const binding = buildKeyBinding(parseHotkey('Control+Space')!, keys)

    expect(binding).toEqual({
      modifierGroups: [[29, 3613]],
      mainCode: 57,
      escapeCode: 1
    })
  })

  it('maps every requested modifier and the main key', () => {
    const binding = buildKeyBinding(parseHotkey('Ctrl+Alt+Shift+Win+K')!, keys)

    expect(binding?.modifierGroups).toEqual([
      [29, 3613],
      [56, 3640],
      [42, 54],
      [3675, 3676]
    ])
    expect(binding?.mainCode).toBe(37)
  })

  it('supports a bare function key', () => {
    const binding = buildKeyBinding(parseHotkey('F8')!, keys)

    expect(binding?.modifierGroups).toEqual([])
    expect(binding?.mainCode).toBe(66)
  })

  it('returns null when the key is unknown to the hook', () => {
    const chord = parseHotkey('Control+Space')!
    expect(buildKeyBinding({ ...chord, key: 'F13' }, keys)).toBeNull()
  })
})

describe('startKeyHook mousedown forwarding', () => {
  it('registers onMouseDown and forwards global mouse click coordinates', async () => {
    const onMouseDown = vi.fn()
    const handle = await startKeyHook(parseHotkey('Control+Space')!, {
      onPress: () => {},
      onRelease: () => {},
      onCancel: () => {},
      onMouseDown
    })

    const mousedownListeners = uiohookListeners['mousedown'] ?? []
    expect(mousedownListeners.length).toBeGreaterThan(0)

    mousedownListeners[0]({ x: 350, y: 420 })
    expect(onMouseDown).toHaveBeenCalledWith({ x: 350, y: 420 })

    handle.stop()
    expect(uiohookListeners['mousedown'] ?? []).toHaveLength(0)
  })
})
