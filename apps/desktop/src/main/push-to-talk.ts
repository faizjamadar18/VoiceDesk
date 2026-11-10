/**
 * The 300 ms hold gate for push-to-talk.
 *
 * A press does not start listening immediately. It arms a short timer; only a
 * hold that survives the threshold becomes a real listening session. A quick
 * tap produces no callbacks at all, so no notch, microphone stream, transcript,
 * or action is created.
 */

export type PushToTalkPhase =
  | 'idle'
  | 'armed'
  | 'listening'
  | 'processing'
  | 'acting'
  | 'result'
  | 'error'

export interface PushToTalkCallbacks {
  onListeningStart: () => void
  onListeningStop: (holdMs: number) => void
  onCancel: () => void
}

export interface PushToTalkOptions {
  thresholdMs?: number
  now?: () => number
}

export const DEFAULT_HOLD_THRESHOLD_MS = 300

export class PushToTalk {
  private readonly callbacks: PushToTalkCallbacks
  private readonly thresholdMs: number
  private readonly now: () => number
  private currentPhase: PushToTalkPhase = 'idle'
  private pressedAt: number | null = null
  private thresholdTimer: NodeJS.Timeout | null = null

  constructor(callbacks: PushToTalkCallbacks, options: PushToTalkOptions = {}) {
    this.callbacks = callbacks
    this.thresholdMs = options.thresholdMs ?? DEFAULT_HOLD_THRESHOLD_MS
    this.now = options.now ?? Date.now
  }

  get phase(): PushToTalkPhase {
    return this.currentPhase
  }

  /** Keydown. Auto-repeat is ignored because only `idle` can arm a session. */
  press(): void {
    if (this.currentPhase !== 'idle') return

    this.currentPhase = 'armed'
    this.pressedAt = this.now()
    this.clearThresholdTimer()
    this.thresholdTimer = setTimeout(() => {
      this.thresholdTimer = null
      if (this.currentPhase !== 'armed') return
      this.currentPhase = 'listening'
      this.callbacks.onListeningStart()
    }, this.thresholdMs)
  }

  /** Keyup. Releasing before the threshold is a tap and does nothing. */
  release(): void {
    if (this.currentPhase === 'armed') {
      this.clearThresholdTimer()
      this.currentPhase = 'idle'
      this.pressedAt = null
      return
    }

    if (this.currentPhase !== 'listening') return

    const holdMs = this.pressedAt === null ? 0 : this.now() - this.pressedAt
    this.currentPhase = 'processing'
    this.callbacks.onListeningStop(holdMs)
  }

  /** Escape. Only an armed or live hold can be cancelled. */
  cancel(): void {
    if (this.currentPhase === 'armed') {
      this.clearThresholdTimer()
      this.currentPhase = 'idle'
      this.pressedAt = null
      return
    }

    if (this.currentPhase !== 'listening' && this.currentPhase !== 'processing') return

    this.clearThresholdTimer()
    this.currentPhase = 'idle'
    this.pressedAt = null
    this.callbacks.onCancel()
  }

  markActing(): void {
    if (this.currentPhase === 'processing') this.currentPhase = 'acting'
  }

  markResult(): void {
    if (this.currentPhase === 'processing' || this.currentPhase === 'acting') {
      this.currentPhase = 'result'
    }
  }

  markError(): void {
    this.currentPhase = 'error'
  }

  reset(): void {
    this.clearThresholdTimer()
    this.currentPhase = 'idle'
    this.pressedAt = null
  }

  dispose(): void {
    this.clearThresholdTimer()
    this.currentPhase = 'idle'
    this.pressedAt = null
  }

  private clearThresholdTimer(): void {
    if (this.thresholdTimer) clearTimeout(this.thresholdTimer)
    this.thresholdTimer = null
  }
}
