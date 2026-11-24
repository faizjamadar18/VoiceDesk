/**
 * Hotkey parsing and the edge-triggered chord tracker.
 *
 * Electron's globalShortcut can reserve a chord but cannot report key release.
 * The low-level uiohook event stream supplies keydown/keyup; this tracker turns
 * that stream into exactly one press and one release per physical hold, while
 * ignoring auto-repeat and handling Escape as a cancel.
 */

export interface HotkeyChord {
  /** The non-modifier key, or an empty string for a modifier-only chord. */
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
const PLAIN_KEY = /^(?:[A-Z0-9]|Space|Shift)$/

/**
 * Canonicalizes a key token into its normalized representation (e.g. 'Space', 'Shift', 'F1'-'F12', or single uppercase characters),
 * returning null if the token does not match a supported key pattern.
 *
 * @param value - Raw key token string.
 * @returns Normalized key string, or null if unrecognized.
 */
function normalizeMainKey(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (upper === 'SPACE') return 'Space'
  if (upper === 'SHIFT') return 'Shift'
  if (PLAIN_KEY.test(upper)) return upper
  if (FUNCTION_KEY.test(upper)) return upper
  return null
}


/**
 * Parse an Electron-style accelerator such as `Control+Space`, or a
 * modifier-only chord such as `Control+Alt`. A modifier-only chord has no main
 * key and needs at least two distinct modifiers.
 */
export function parseHotkey(value: string): HotkeyChord | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length < 1) return null

  const chord: HotkeyChord = { key: '', ctrl: false, alt: false, shift: false, meta: false }
  const modifiers: (keyof Pick<HotkeyChord, 'ctrl' | 'alt' | 'shift' | 'meta'>)[] = []
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()]
    if (modifier) modifiers.push(modifier)
  }

  // Every part is a modifier: this is a hook-only chord with no main key.
  if (modifiers.length === parts.length) {
    if (parts.length < 2) return null
    for (const modifier of modifiers) {
      if (chord[modifier]) return null
      chord[modifier] = true
    }
    return chord
  }

  const main = normalizeMainKey(parts[parts.length - 1])
  if (main === null) return null

  chord.key = main
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
  if (chord.key) parts.push(chord.key)
  return parts.join('+')
}

/**
 * Electron's globalShortcut only supports accelerators that have at least one
 * non-modifier key (e.g. `Control+Space` or `Alt+F8`). Modifier-only chords
 * (like `Control+Alt` or `Control+Shift`) have no main key, cannot be registered
 * with `globalShortcut`, and are handled solely by the low-level keyboard hook.
 */
export function isElectronAccelerator(hotkey: string): boolean {
  const chord = parseHotkey(hotkey)
  if (!chord || !chord.key) return false
  const upper = chord.key.toUpperCase()
  return upper !== 'SHIFT' && upper !== 'CONTROL' && upper !== 'ALT' && upper !== 'META'
}

export function hotkeyLabel(hotkey: string): string[] {
  return hotkey.split('+').map((key) => (key === 'Control' ? 'Ctrl' : key))
}

export interface HotkeyBinding {
  /** Each group is one logical modifier; any code in the group satisfies it. */
  modifierGroups: readonly (readonly number[])[]
  /** The non-modifier key, or null for a modifier-only chord. */
  mainCode: number | null
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
      if (this.canStartHold()) {
        this.active = true
        this.callbacks.onPress()
      }
      return
    }

    if (keycode === this.binding.mainCode) {
      // Auto-repeat must never restart a hold.
      if (this.mainDown) return
      this.mainDown = true
      if (this.canStartHold()) {
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

  /**
   * A modifier-only chord has no main key, so every required modifier being
   * held is the whole chord. Otherwise the main key must be down too.
   */
  private canStartHold(): boolean {
    if (this.active || this.cancelledUntilRelease) return false
    if (!this.hasRequiredModifiers()) return false
    return this.binding.mainCode === null || this.mainDown
  }
}
