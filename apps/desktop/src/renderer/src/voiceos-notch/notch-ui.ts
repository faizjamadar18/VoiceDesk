import type { NotchPhase } from '../../../shared/types'
import type { VoiceOsNotchMode } from './VoiceOsNotch'

/**
 * Duration of the renderer dismiss collapse animation. Gives VoiceOS's 200ms
 * `CLOSING_TIMING` transition room to finish before hiding the BrowserWindow.
 */
export const NOTCH_DISMISS_ANIMATION_MS = 220

export interface NotchCancelVisibilityInput {
  phase: NotchPhase
  isSynthesizing: boolean
  isSpeaking: boolean
  isDismissing?: boolean
}

export interface NotchPresentationInput extends NotchCancelVisibilityInput {
  hasExpandedContent: boolean
}

export interface NotchPresentation {
  mode: VoiceOsNotchMode
  expanded: boolean
  showCancel: boolean
}

/**
 * The stop/esc button is visible strictly while the backend turn is actively
 * generating or the voice reply is synthesizing/speaking — never while
 * listening or once a turn has settled, and never during collapse.
 */
export function shouldShowNotchCancel({
  phase,
  isSynthesizing,
  isSpeaking,
  isDismissing = false
}: NotchCancelVisibilityInput): boolean {
  if (isDismissing || phase === 'listening') return false
  return phase === 'processing' || phase === 'acting' || isSynthesizing || isSpeaking
}

/** Map Kestrel's turn state + dismiss transition onto `VoiceOsNotch` props. */
export function deriveNotchPresentation({
  phase,
  isSynthesizing,
  isSpeaking,
  hasExpandedContent,
  isDismissing = false
}: NotchPresentationInput): NotchPresentation {
  if (isDismissing) {
    return {
      mode: 'idle',
      expanded: false,
      showCancel: false
    }
  }

  const isWorking = phase === 'processing' || phase === 'acting' || isSynthesizing
  const mode: VoiceOsNotchMode =
    phase === 'listening'
      ? 'listening'
      : isWorking
        ? 'thinking'
        : phase === 'error'
          ? 'error'
          : 'responding'

  return {
    mode,
    expanded: hasExpandedContent,
    showCancel: shouldShowNotchCancel({
      phase,
      isSynthesizing,
      isSpeaking,
      isDismissing
    })
  }
}

export interface DismissAnimatorCallbacks {
  onStart: () => void
  onFinish: () => void
  delayMs?: number
}

export interface DismissAnimator {
  start: () => boolean
  cancel: () => void
  isActive: () => boolean
}

/**
 * Coordinates the idempotent 220ms VoiceOS notch collapse animation timer so
 * active sessions/timeouts can be cancelled cleanly if a new turn starts.
 */
export function createDismissAnimator(callbacks: DismissAnimatorCallbacks): DismissAnimator {
  let active = false
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    start(): boolean {
      if (active) return false
      active = true
      callbacks.onStart()
      if (!active) return false
      const delayMs = callbacks.delayMs ?? NOTCH_DISMISS_ANIMATION_MS
      timer = setTimeout(() => {
        timer = null
        active = false
        callbacks.onFinish()
      }, delayMs)
      return true
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      active = false
    },
    isActive(): boolean {
      return active
    }
  }
}

