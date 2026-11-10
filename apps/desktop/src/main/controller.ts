import { IPC, type DictationAudioPayload, type DictationRuntimeState, type DictationStatus } from '../shared/types'
import { HotkeyGesture, type HotkeyGestureEvent } from './dictation/gesture'
import type { PasteService } from './dictation/paste'
import { polishTranscript } from './dictation/polish'
import { DictationSession, type DictationCommand, type DictationState } from './dictation/session'
import type { TranscriptionClient } from './dictation/transcription'

const AUDIO_WAIT_TIMEOUT_MS = 8_000
const ERROR_VISIBLE_MS = 2_500

export interface DictationControllerOptions {
  transcription: TranscriptionClient
  paste: PasteService
  isRendererReady: () => boolean
  sendToRenderer: (channel: string, payload?: unknown) => boolean
  onSummon: () => void
  onStateChange?: (state: DictationRuntimeState) => void
  now?: () => number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function statusForSession(state: DictationState): DictationStatus {
  switch (state) {
    case 'recording':
      return 'listening'
    case 'transcribing':
      return 'transcribing'
    case 'pasting':
      return 'pasting'
    case 'error':
      return 'error'
    case 'idle':
      return 'idle'
  }
}

/**
 * Coordinates the hold-to-talk gesture, the dictation state machine, the
 * transcription backend, and text insertion. Electron/native modules are
 * injected so the decision logic stays testable on its own.
 */
export class DictationController {
  private readonly options: DictationControllerOptions
  private readonly gesture = new HotkeyGesture()
  private readonly session = new DictationSession()

  private status: DictationStatus = 'idle'
  private lastTranscript: string | null = null
  private provider: string | null = null
  private latencyMs: number | null = null
  private lastError: string | null = null
  private lastCompletedAt: number | null = null

  private audioTimer: NodeJS.Timeout | null = null
  private errorTimer: NodeJS.Timeout | null = null
  private errorToken = 0
  private disposed = false

  constructor(options: DictationControllerOptions) {
    this.options = options
  }

  get state(): DictationRuntimeState {
    return this.snapshot()
  }

  /** Called by the low-level key hook on Ctrl+Space keydown. */
  handlePress(): void {
    for (const event of this.gesture.pressed()) this.applyGestureEvent(event)
  }

  /** Called by the low-level key hook when Space or Ctrl is released. */
  handleRelease(): void {
    for (const event of this.gesture.released()) this.applyGestureEvent(event)
  }

  /** Renderer -> main: raw audio captured while the keys were held. */
  handleAudio(payload: DictationAudioPayload | { audio: Uint8Array; mimeType: string }): void {
    const audio =
      payload.audio instanceof Uint8Array ? payload.audio : new Uint8Array(payload.audio)
    const mimeType = payload.mimeType || 'audio/webm'

    console.log(`[dictation] audio bytes=${audio.byteLength} mime=${mimeType}`)
    this.clearAudioTimer()

    if (audio.byteLength === 0) {
      this.fail('No audio captured.', true)
      return
    }

    const commands = this.session.dispatch({ type: 'audio-ready', audio, mimeType })
    if (commands.length === 0) return

    this.runCommands(commands)
    this.publish()
  }

  /** Renderer -> main: microphone acquisition or recording failed. */
  handleAudioError(message: string): void {
    if (this.session.state !== 'recording' && this.session.state !== 'transcribing') {
      // A late error from a finished gesture must not clobber the next one.
      console.log(`[dictation] mic-error ${message}`)
      return
    }

    this.fail(message, true)
  }

  /** Renderer reloaded or crashed while a gesture was in flight. */
  handleRendererUnavailable(): void {
    if (this.session.state === 'recording' || this.session.state === 'transcribing') {
      this.fail('Kestrel reloaded before the microphone audio arrived.', true)
    }
  }

  dispose(): void {
    this.disposed = true
    this.clearAudioTimer()
    this.clearErrorTimer()
  }

  private applyGestureEvent(event: HotkeyGestureEvent): void {
    switch (event.type) {
      case 'start':
        this.begin()
        break
      case 'cancel':
        console.log(`[dictation] cancel holdMs=${event.holdMs} (tap)`)
        this.runCommands(this.session.dispatch({ type: 'cancel' }))
        this.publish()
        break
      case 'stop': {
        const wasRecording = this.session.state === 'recording'
        this.runCommands(this.session.dispatch({ type: 'stop' }))
        if (wasRecording) {
          console.log(`[dictation] stop holdMs=${event.holdMs}`)
          this.armAudioTimeout()
        }
        this.publish()
        break
      }
      case 'summon':
        this.options.onSummon()
        break
    }
  }

  private begin(): void {
    if (this.session.state === 'transcribing' || this.session.state === 'pasting') {
      // Ignore a new hold while the previous dictation is still finishing.
      return
    }

    console.log('[dictation] start')
    this.clearErrorTimer()

    if (this.session.state === 'error') {
      this.session.dispatch({ type: 'reset' })
    }

    if (!this.options.isRendererReady()) {
      this.fail('Microphone is not ready — the Kestrel window is still loading.', true)
      return
    }

    this.runCommands(this.session.dispatch({ type: 'start' }))
    this.publish()
  }

  private runCommands(commands: DictationCommand[]): void {
    for (const command of commands) {
      switch (command.type) {
        case 'start-capture':
          this.options.sendToRenderer(IPC.dictationStart)
          this.status = 'listening'
          break
        case 'cancel-capture':
          this.options.sendToRenderer(IPC.dictationCancel)
          this.status = 'idle'
          break
        case 'stop-capture':
          this.options.sendToRenderer(IPC.dictationStop)
          this.status = 'transcribing'
          break
        case 'transcribe':
          this.status = 'transcribing'
          void this.transcribe(command.audio, command.mimeType)
          break
        case 'paste':
          this.status = 'pasting'
          void this.paste(command.text)
          break
        case 'notify-error':
          this.status = 'error'
          break
        case 'reset':
          this.status = 'idle'
          break
      }
    }
  }

  private async transcribe(audio: Uint8Array, mimeType: string): Promise<void> {
    try {
      const result = await this.options.transcription.transcribe({ audio, mimeType })
      if (this.disposed || this.session.state !== 'transcribing') return

      const polished = polishTranscript(result.text ?? '')
      const provider = result.provider ?? 'unknown'

      console.log(
        `[dictation] transcript provider=${provider} latencyMs=${result.latencyMs} chars=${polished.length}`
      )

      if (!polished) {
        this.fail('No speech detected.')
        return
      }

      this.provider = provider
      this.latencyMs = result.latencyMs
      this.lastTranscript = polished
      this.runCommands(this.session.dispatch({ type: 'transcript', text: polished }))
      this.publish()
    } catch (error) {
      if (this.disposed) return
      this.fail(errorMessage(error))
    }
  }

  private async paste(text: string): Promise<void> {
    const startedAt = performance.now()

    try {
      await this.options.paste.paste(text)
      if (this.disposed || this.session.state !== 'pasting') return

      console.log(`[dictation] pasted in ${Math.round(performance.now() - startedAt)}ms`)
      this.lastCompletedAt = this.options.now?.() ?? Date.now()
      this.lastError = null
      this.session.dispatch({ type: 'paste-success' })
      this.status = 'idle'
      this.publish()
    } catch (error) {
      if (this.disposed) return
      this.fail(errorMessage(error))
    }
  }

  private fail(message: string, mic = false): void {
    console.log(`[dictation] ${mic ? 'mic-error' : 'error'} ${message}`)

    this.clearAudioTimer()
    this.lastError = message
    this.runCommands(this.session.dispatch({ type: 'failure', error: message }))
    this.status = 'error'
    this.publish()
    this.scheduleErrorReset()
  }

  private armAudioTimeout(): void {
    this.clearAudioTimer()
    this.audioTimer = setTimeout(() => {
      this.audioTimer = null
      if (this.session.state === 'transcribing') {
        this.fail('The microphone produced no audio in time.', true)
      }
    }, AUDIO_WAIT_TIMEOUT_MS)
  }

  private clearAudioTimer(): void {
    if (this.audioTimer) clearTimeout(this.audioTimer)
    this.audioTimer = null
  }

  private scheduleErrorReset(): void {
    this.clearErrorTimer()
    const token = ++this.errorToken
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null
      if (token !== this.errorToken || this.status !== 'error') return

      this.session.dispatch({ type: 'reset' })
      this.status = statusForSession(this.session.state)
      this.publish()
    }, ERROR_VISIBLE_MS)
  }

  private clearErrorTimer(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer)
    this.errorTimer = null
    this.errorToken += 1
  }

  private snapshot(): DictationRuntimeState {
    return {
      status: this.status,
      lastTranscript: this.lastTranscript,
      provider: this.provider,
      latencyMs: this.latencyMs,
      lastError: this.lastError,
      lastCompletedAt: this.lastCompletedAt,
      updatedAt: this.options.now?.() ?? Date.now()
    }
  }

  private publish(): void {
    this.options.onStateChange?.(this.snapshot())
  }
}
