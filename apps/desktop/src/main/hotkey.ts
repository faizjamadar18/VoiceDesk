/**
 * Hotkey parsing and the edge-triggered chord tracker.
 *
 * Electron's globalShortcut can reserve a chord but cannot report key release.
 * The low-level uiohook event stream supplies keydown/keyup; this tracker turns
 * that stream into exactly one press and one release per physical hold, while
 * ignoring auto-repeat and handling Escape as a cancel.
 */

export interface HotkeyChord {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

const MODIFIER_ALIASES: Record<string, keyof Pick<HotkeyChord, 'ctrl' | 'alt' | 'shift' | 'meta'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  commandorcontrol: 'ctrl',
  cmdorctrl: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  super: 'meta',
  win: 'meta',
  windows: 'meta'
}

const FUNCTION_KEY = /^F(?:[1-9]|1[0-2])$/
const PLAIN_KEY = /^(?:[A-Z0-9]|Space)$/

function normalizeMainKey(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (upper === 'SPACE') return 'Space'
  if (PLAIN_KEY.test(upper)) return upper
  if (FUNCTION_KEY.test(upper)) return upper
  return null
}

/** Parse an Electron-style accelerator such as `Control+Space`. */
export function parseHotkey(value: string): HotkeyChord | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 1) return null

  const main = normalizeMainKey(parts[parts.length - 1])
  if (main === null) return null

  const chord: HotkeyChord = { key: main, ctrl: false, alt: false, shift: false, meta: false }
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()]
    if (!modifier || chord[modifier]) return null
    chord[modifier] = true
  }

  if (!chord.ctrl && !chord.alt && !chord.shift && !chord.meta && !FUNCTION_KEY.test(main)) {
    return null
  }

  return chord
}

export function formatHotkey(chord: HotkeyChord): string {
  const parts: string[] = []
  if (chord.ctrl) parts.push('Control')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  if (chord.meta) parts.push('Meta')
  parts.push(chord.key)
  return parts.join('+')
}

export function hotkeyLabel(hotkey: string): string[] {
  return hotkey.split('+').map((key) => (key === 'Control' ? 'Ctrl' : key))
}

export interface HotkeyBinding {
  /** Each group is one logical modifier; any code in the group satisfies it. */
  modifierGroups: readonly (readonly number[])[]
  mainCode: number
  escapeCode: number
}

export interface HotkeyTrackerCallbacks {
  onPress: () => void
  onRelease: () => void
  onCancel: () => void
  onEscape?: () => void
}

/**
 * Pure chord state machine. It is intentionally independent of uiohook so the
 * repeat/cancel/release behavior can be tested without a native hook.
 */
export class HotkeyChordTracker {
  private readonly binding: HotkeyBinding
  private readonly callbacks: HotkeyTrackerCallbacks
  private readonly held = new Set<number>()
  private mainDown = false
  private active = false
  private escapeDown = false
  private cancelledUntilRelease = false

  constructor(binding: HotkeyBinding, callbacks: HotkeyTrackerCallbacks) {
    this.binding = binding
    this.callbacks = callbacks
  }

  get isActive(): boolean {
    return this.active
  }

  keyDown(keycode: number): void {
    if (keycode === this.binding.escapeCode) {
      if (this.escapeDown) return
      this.escapeDown = true
      if (this.active) {
        this.active = false
        this.cancelledUntilRelease = true
        this.callbacks.onCancel()
      } else {
        this.callbacks.onEscape?.()
      }
      return
    }

    if (this.isModifier(keycode)) {
      if (this.held.has(keycode)) return
      this.held.add(keycode)
      if (this.mainDown && !this.active && !this.cancelledUntilRelease && this.hasRequiredModifiers()) {
        this.active = true
        this.callbacks.onPress()
      }
      return
    }

    if (keycode === this.binding.mainCode) {
      // Auto-repeat must never restart a hold.
      if (this.mainDown) return
      this.mainDown = true
      if (!this.active && !this.cancelledUntilRelease && this.hasRequiredModifiers()) {
        this.active = true
        this.callbacks.onPress()
      }
    }
  }

  keyUp(keycode: number): void {
    if (keycode === this.binding.escapeCode) {
      this.escapeDown = false
      return
    }

    if (this.isModifier(keycode)) {
      this.held.delete(keycode)
      if (this.active) {
        this.active = false
        this.callbacks.onRelease()
      }
      if (!this.mainDown && this.held.size === 0) {
        this.cancelledUntilRelease = false
      }
      return
    }

    if (keycode === this.binding.mainCode) {
      this.mainDown = false
      if (this.active) {
        this.active = false
        this.callbacks.onRelease()
      }
      if (!this.mainDown && this.held.size === 0) {
        this.cancelledUntilRelease = false
      }
    }
  }

  private isModifier(keycode: number): boolean {
    return this.binding.modifierGroups.some((group) => group.includes(keycode))
  }

  private hasRequiredModifiers(): boolean {
    return this.binding.modifierGroups.every((group) =>
      group.some((keycode) => this.held.has(keycode))
    )
  }
}
