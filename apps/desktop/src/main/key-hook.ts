import type { UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi'
import type { HotkeyBinding, HotkeyChord } from './hotkey'
import { HotkeyChordTracker } from './hotkey'

export interface KeyHookCallbacks {
  onPress: () => void
  onRelease: () => void
  onCancel: () => void
  onEscape?: () => void
  onMouseDown?: (event: { x: number; y: number }) => void
}

export interface KeyHookHandle {
  stop: () => void
}

export interface KeyHookOptions {
  /**
   * Polled for every keyboard event. When it returns true the event belongs to
   * an input we synthesised ourselves (a clipboard capture) and is dropped.
   */
  isEventSuppressed?: () => boolean
}

export type KeyCodeMap = Record<string, number>

const MODIFIER_CODES = {
  ctrl: ['Ctrl', 'CtrlRight'],
  alt: ['Alt', 'AltRight'],
  shift: ['Shift', 'ShiftRight'],
  meta: ['Meta', 'MetaRight']
} as const

/**
 * Translate a parsed chord into the raw keycodes the low-level hook reports.
 * Exported separately so the mapping can be tested without loading native code.
 */
export function buildKeyBinding(
  chord: HotkeyChord,
  keys: KeyCodeMap
): HotkeyBinding | null {
  const mainCode = chord.key ? keys[chord.key] : null
  const escapeCode = keys.Escape
  if (
    (mainCode !== null && typeof mainCode !== 'number') ||
    typeof escapeCode !== 'number'
  ) {
    return null
  }

  const modifierGroups: number[][] = []
  for (const modifier of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (!chord[modifier]) continue
    const codes = MODIFIER_CODES[modifier]
      .map((name) => keys[name])
      .filter((code): code is number => typeof code === 'number')
    if (codes.length === 0) return null
    modifierGroups.push(codes)
  }

  if (mainCode === null && modifierGroups.length === 0) return null

  return { modifierGroups, mainCode, escapeCode }
}

function safe(callback: () => void, label: string): () => void {
  return () => {
    try {
      callback()
    } catch (error) {
      console.error(`[hotkey] ${label} handler failed`, error)
    }
  }
}

/**
 * Starts the global low-level keyboard hook for a configurable chord.
 *
 * The tracker is edge-triggered: Windows auto-repeat cannot restart a hold,
 * Escape cancels the active hold, and releasing either the modifier or the main
 * key ends the recording. `globalShortcut` is registered separately by the main
 * process so the chord is also consumed before it reaches other apps.
 */
export async function startKeyHook(
  chord: HotkeyChord,
  callbacks: KeyHookCallbacks,
  options: KeyHookOptions = {}
): Promise<KeyHookHandle> {
  const { uIOhook, UiohookKey } = await import('uiohook-napi')

  const binding = buildKeyBinding(chord, UiohookKey as unknown as KeyCodeMap)
  if (!binding) {
    throw new Error(`The hotkey "${chord.key}" is not supported by the keyboard hook.`)
  }

  const tracker = new HotkeyChordTracker(binding, {
    onPress: safe(callbacks.onPress, 'press'),
    onRelease: safe(callbacks.onRelease, 'release'),
    onCancel: safe(callbacks.onCancel, 'cancel'),
    onEscape: callbacks.onEscape ? safe(callbacks.onEscape, 'escape') : undefined
  })

  const onKeyDown = (event: UiohookKeyboardEvent): void => {
    if (options.isEventSuppressed?.()) return
    tracker.keyDown(event.keycode)
  }
  const onKeyUp = (event: UiohookKeyboardEvent): void => {
    if (options.isEventSuppressed?.()) return
    tracker.keyUp(event.keycode)
  }
  const onMouseDown = callbacks.onMouseDown
    ? (event: UiohookMouseEvent): void => {
        try {
          callbacks.onMouseDown?.({ x: event.x, y: event.y })
        } catch (error) {
          console.error('[hotkey] mousedown handler failed', error)
        }
      }
    : null

  uIOhook.on('keydown', onKeyDown)
  uIOhook.on('keyup', onKeyUp)
  if (onMouseDown) {
    uIOhook.on('mousedown', onMouseDown)
  }

  try {
    uIOhook.start()
  } catch (error) {
    uIOhook.off('keydown', onKeyDown)
    uIOhook.off('keyup', onKeyUp)
    if (onMouseDown) {
      uIOhook.off('mousedown', onMouseDown)
    }
    try {
      uIOhook.stop()
    } catch {
      // The hook never started far enough to need cleanup.
    }
    throw error
  }

  return {
    stop: () => {
      uIOhook.off('keydown', onKeyDown)
      uIOhook.off('keyup', onKeyUp)
      if (onMouseDown) {
        uIOhook.off('mousedown', onMouseDown)
      }
      try {
        uIOhook.stop()
      } catch (error) {
        console.error('[hotkey] key-hook stop failed', error)
      }
    }
  }
}
