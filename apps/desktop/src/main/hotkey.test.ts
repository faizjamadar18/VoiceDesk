import { describe, expect, it } from 'vitest'
import { HotkeyChordTracker, formatHotkey, hotkeyLabel, parseHotkey } from './hotkey'

const CTRL = 1
const CTRL_RIGHT = 2
const ALT = 3
const SHIFT = 4
const SPACE = 5
const ESC = 6
const F8 = 7

function tracker(
  overrides: Partial<ConstructorParameters<typeof HotkeyChordTracker>[0]> = {},
  callbackOverrides: Partial<ConstructorParameters<typeof HotkeyChordTracker>[1]> = {}
) {
  const calls: string[] = []
  const instance = new HotkeyChordTracker(
    {
      modifierGroups: [[CTRL, CTRL_RIGHT]],
      mainCode: SPACE,
      escapeCode: ESC,
      ...overrides
    },
    {
      onPress: () => calls.push('press'),
      onRelease: () => calls.push('release'),
      onCancel: () => calls.push('cancel'),
      ...callbackOverrides
    }
  )
  return { instance, calls }
}

describe('parseHotkey', () => {
  it('parses the default chord', () => {
    expect(parseHotkey('Control+Space')).toEqual({
      key: 'Space',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false
    })
  })

  it('normalizes aliases and ordering', () => {
    expect(formatHotkey(parseHotkey('alt+ctrl+shift+space')!)).toBe('Control+Alt+Shift+Space')
    expect(parseHotkey('ctrl+f8')?.key).toBe('F8')
    expect(parseHotkey('CommandOrControl+Space')?.ctrl).toBe(true)
    expect(parseHotkey('Win+Space')?.meta).toBe(true)
  })

  it('allows a function key without a modifier', () => {
    expect(parseHotkey('F8')?.key).toBe('F8')
  })

  it('rejects plain keys, modifiers alone, and duplicates', () => {
    expect(parseHotkey('Space')).toBeNull()
    expect(parseHotkey('A')).toBeNull()
    expect(parseHotkey('Control')).toBeNull()
    expect(parseHotkey('Control+Control+Space')).toBeNull()
    expect(parseHotkey('Control+NotAKey')).toBeNull()
    expect(parseHotkey('')).toBeNull()
  })

  it('formats UI labels', () => {
    expect(hotkeyLabel('Control+Alt+Space')).toEqual(['Ctrl', 'Alt', 'Space'])
  })
})

describe('HotkeyChordTracker', () => {
  it('fires one press for a held chord and ignores auto-repeat', () => {
    const { instance, calls } = tracker()

    instance.keyDown(CTRL)
    instance.keyDown(SPACE)
    instance.keyDown(SPACE)
    instance.keyDown(SPACE)

    expect(calls).toEqual(['press'])

    instance.keyUp(SPACE)
    instance.keyUp(SPACE)

    expect(calls).toEqual(['press', 'release'])
  })

  it('supports pressing the main key before the modifier', () => {
    const { instance, calls } = tracker()

    instance.keyDown(SPACE)
    expect(calls).toEqual([])
    instance.keyDown(CTRL)

    expect(calls).toEqual(['press'])
  })

  it('ends the hold when either chord key is released', () => {
    for (const released of [SPACE, CTRL]) {
      const { instance, calls } = tracker()
      instance.keyDown(CTRL)
      instance.keyDown(SPACE)
      instance.keyUp(released)
      expect(calls).toEqual(['press', 'release'])
    }
  })

  it('ignores unrelated keys and does not end on extra modifiers', () => {
    const { instance, calls } = tracker()

    instance.keyDown(SHIFT)
    instance.keyUp(SHIFT)
    instance.keyDown(CTRL)
    instance.keyDown(SPACE)
    instance.keyDown(ALT)
    instance.keyUp(ALT)

    expect(calls).toEqual(['press'])
  })

  it('cancels with Escape while active and ignores the later release', () => {
    const { instance, calls } = tracker()

    instance.keyDown(CTRL)
    instance.keyDown(SPACE)
    instance.keyDown(ESC)
    instance.keyDown(ESC)
    instance.keyUp(ESC)
    instance.keyUp(SPACE)
    instance.keyUp(CTRL)

    expect(calls).toEqual(['press', 'cancel'])
    expect(instance.isActive).toBe(false)
  })

  it('does not restart the hold when a modifier repeats after Escape', () => {
    const { instance, calls } = tracker()

    instance.keyDown(CTRL)
    instance.keyDown(SPACE)
    instance.keyDown(ESC)
    instance.keyUp(ESC)
    // Windows auto-repeat while the user is still holding the chord.
    instance.keyDown(CTRL)
    instance.keyDown(CTRL)

    expect(calls).toEqual(['press', 'cancel'])

    // A genuine release and press is a new turn.
    instance.keyUp(SPACE)
    instance.keyUp(CTRL)
    instance.keyDown(CTRL)
    instance.keyDown(SPACE)

    expect(calls).toEqual(['press', 'cancel', 'press'])
  })

  it('does nothing when Escape is pressed while idle', () => {
    const { instance, calls } = tracker()

    instance.keyDown(ESC)
    instance.keyUp(ESC)

    expect(calls).toEqual([])
  })

  it('calls onEscape when Escape is pressed while idle and ignores auto-repeat', () => {
    const { instance, calls } = tracker({}, { onEscape: () => calls.push('escape') })

    instance.keyDown(ESC)
    instance.keyDown(ESC)
    instance.keyUp(ESC)
    instance.keyDown(ESC)
    instance.keyUp(ESC)

    expect(calls).toEqual(['escape', 'escape'])
  })

  it('calls onCancel rather than onEscape when Escape is pressed while active', () => {
    const { instance, calls } = tracker({}, { onEscape: () => calls.push('escape') })

    instance.keyDown(CTRL)
    instance.keyDown(SPACE)
    instance.keyDown(ESC)
    instance.keyUp(ESC)

    expect(calls).toEqual(['press', 'cancel'])
  })

  it('works with a function-key binding without modifiers', () => {
    const { instance, calls } = tracker({
      modifierGroups: [],
      mainCode: F8,
      escapeCode: ESC
    })

    instance.keyDown(F8)
    instance.keyDown(F8)
    instance.keyUp(F8)

    expect(calls).toEqual(['press', 'release'])
  })

  it('accepts either side of a modifier', () => {
    const { instance, calls } = tracker()

    instance.keyDown(CTRL_RIGHT)
    instance.keyDown(SPACE)

    expect(calls).toEqual(['press'])
  })
})
