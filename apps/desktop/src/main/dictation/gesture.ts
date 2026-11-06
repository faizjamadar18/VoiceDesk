export const HOLD_THRESHOLD_MS = 250

export type GestureState = 'idle' | 'recording'

export type HotkeyGestureEvent =
  | { type: 'start'; at: number }
  | { type: 'cancel'; at: number; holdMs: number }
  | { type: 'summon'; at: number }
  | { type: 'stop'; at: number; holdMs: number }

export interface HotkeyGestureOptions {
  now?: () => number
}

export class HotkeyGesture {
  private readonly now: () => number
  private currentState: GestureState = 'idle'
  private pressedAt: number | null = null

  constructor(options: HotkeyGestureOptions = {}) {
    this.now = options.now ?? Date.now
  }

  get state(): GestureState {
    return this.currentState
  }

  press(): HotkeyGestureEvent[] {
    if (this.currentState === 'recording') return []

    const at = this.now()
    this.currentState = 'recording'
    this.pressedAt = at
    return [{ type: 'start', at }]
  }

  release(): HotkeyGestureEvent[] {
    if (this.currentState !== 'recording' || this.pressedAt === null) return []

    const at = this.now()
    const holdMs = at - this.pressedAt
    this.currentState = 'idle'
    this.pressedAt = null

    if (holdMs < HOLD_THRESHOLD_MS) {
      return [
        { type: 'cancel', at, holdMs },
        { type: 'summon', at }
      ]
    }

    return [{ type: 'stop', at, holdMs }]
  }

  holdElapsed(): number | null {
    if (this.currentState !== 'recording' || this.pressedAt === null) return null
    return this.now() - this.pressedAt
  }
}
