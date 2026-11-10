import { ASR_SAMPLE_RATE, durationMs, encodePcm16 } from './pcm'

export interface AsrResult {
  text: string
  latencyMs: number
  provider: string
}

export interface LiveTurnHandlers {
  onPartial?: (text: string) => void
}

export interface LiveTurn {
  push(samples: Float32Array, sampleRate: number): void
  finish(): Promise<AsrResult>
  cancel(): void
}

export interface LiveTranscriber {
  startTurn(handlers?: LiveTurnHandlers): LiveTurn
  dispose?(): void | Promise<void>
}

export type SocketEvent = {
  data?: unknown
  code?: number
  reason?: string
}

/** Minimal WebSocket surface so the protocol can be tested without a server. */
export interface RealtimeSocket {
  binaryType: string
  send(data: string | ArrayBufferLike | ArrayBufferView): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: SocketEvent) => void): void
}

export type RealtimeSocketFactory = (url: string) => RealtimeSocket

export interface NemoStreamingTranscriberOptions {
  baseUrl: string
  socketFactory?: RealtimeSocketFactory
  connectTimeoutMs?: number
  finishTimeoutMs?: number
  language?: string
  automaticPunctuation?: boolean
}

export const REALTIME_PATH = '/v1/audio/transcriptions/realtime'

export function realtimeUrl(baseUrl: string): string {
  const wsBase = baseUrl.trim().replace(/^http/i, 'ws').replace(/\/+$/, '')
  return `${wsBase}${REALTIME_PATH}`
}

/** Collapse transport whitespace without changing the spoken words. */
export function normalizeTranscript(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

type ServerEvent = {
  type?: unknown
  delta?: unknown
  transcript?: unknown
  error?: { message?: unknown; code?: unknown } | null
}

function eventType(event: ServerEvent): string {
  return typeof event.type === 'string' ? event.type : ''
}

function serverMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return 'Speech recognition failed.'
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

const defaultSocketFactory: RealtimeSocketFactory = (url) =>
  new WebSocket(url) as unknown as RealtimeSocket

/**
 * One push-to-talk turn over NVIDIA's realtime transcription socket. Audio is
 * queued until the socket opens, then sent as raw PCM16 at the rate the
 * renderer captured. The server resamples to the model rate.
 */
class NemoLiveTurn implements LiveTurn {
  private readonly url: string
  private readonly socketFactory: RealtimeSocketFactory
  private readonly handlers: LiveTurnHandlers
  private readonly connectTimeoutMs: number
  private readonly finishTimeoutMs: number
  private readonly language: string
  private readonly automaticPunctuation: boolean
  private readonly startedAt = performance.now()

  private socket: RealtimeSocket | null = null
  private opened = false
  private sampleRate = 0
  private queue: Uint8Array[] = []
  private openPromise: Promise<void> | null = null
  private resolveOpen: (() => void) | null = null
  private rejectOpen: ((error: Error) => void) | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private finishTimer: ReturnType<typeof setTimeout> | null = null
  private finishPromise: Promise<AsrResult> | null = null
  private resolveFinish: ((result: AsrResult) => void) | null = null
  private rejectFinish: ((error: Error) => void) | null = null
  private failure: Error | null = null
  private cancelled = false

  /** Transcripts the server finalised at an interior pause. */
  private readonly segments: string[] = []
  private partialRaw = ''
  private shown = ''

  constructor(
    options: NemoStreamingTranscriberOptions & { url: string; handlers: LiveTurnHandlers }
  ) {
    this.url = options.url
    this.socketFactory = options.socketFactory ?? defaultSocketFactory
    this.handlers = options.handlers
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000
    this.finishTimeoutMs = options.finishTimeoutMs ?? 20_000
    this.language = options.language ?? 'en'
    this.automaticPunctuation = options.automaticPunctuation ?? true
  }

  push(samples: Float32Array, sampleRate: number): void {
    if (this.cancelled || this.failure) return
    if (!(samples instanceof Float32Array) || samples.length === 0) return
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) return

    if (!this.socket) this.open(sampleRate)
    if (this.failure || !this.socket) return
    if (this.sampleRate !== sampleRate) {
      this.fail(new Error('The microphone sample rate changed during a turn.'))
      return
    }

    const pcm = encodePcm16(samples)
    if (pcm.byteLength === 0) return
    if (this.opened) {
      this.sendBinary(pcm)
    } else {
      this.queue.push(pcm)
    }
  }

  finish(): Promise<AsrResult> {
    if (this.finishPromise) return this.finishPromise
    if (this.cancelled) return Promise.reject(new Error('The turn was cancelled.'))
    if (!this.socket) return Promise.resolve(this.result(''))

    const pending = new Promise<AsrResult>((resolve, reject) => {
      this.resolveFinish = resolve
      this.rejectFinish = reject
    })
    this.finishPromise = pending
    this.finishTimer = setTimeout(() => {
      this.reject(
        new Error(`Transcription did not finish within ${this.finishTimeoutMs} ms.`)
      )
    }, this.finishTimeoutMs)

    void this.openPromise
      ?.then(() => {
        if (this.cancelled) return
        if (this.failure) {
          this.reject(this.failure)
          return
        }
        this.sendJson({ type: 'input_audio_buffer.commit' })
      })
      .catch((error: unknown) => this.reject(asError(error)))

    return pending
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.queue = []
    this.clearTimers()
    const reject = this.rejectFinish
    this.rejectFinish = null
    this.resolveFinish = null
    this.close()
    reject?.(new Error('The turn was cancelled.'))
  }

  private open(sampleRate: number): void {
    this.sampleRate = sampleRate

    this.openPromise = new Promise<void>((resolve, reject) => {
      this.resolveOpen = resolve
      this.rejectOpen = reject
    })
    // A turn can fail before finish() is called; avoid an unhandled rejection.
    void this.openPromise.catch(() => undefined)

    this.connectTimer = setTimeout(() => {
      this.fail(
        new Error('Timed out connecting to the local NVIDIA Nemotron server.')
      )
    }, this.connectTimeoutMs)

    let socket: RealtimeSocket
    try {
      socket = this.socketFactory(this.url)
    } catch (error) {
      this.fail(asError(error))
      return
    }

    this.socket = socket
    socket.binaryType = 'arraybuffer'
    socket.addEventListener('open', () => this.onOpen())
    socket.addEventListener('message', (event) => this.onMessage(event.data))
    socket.addEventListener('error', () => {
      this.fail(new Error('Could not reach the local NVIDIA Nemotron server.'))
    })
    socket.addEventListener('close', () => this.onClose())
  }

  private onOpen(): void {
    if (this.cancelled) {
      this.close()
      return
    }
    this.opened = true
    this.clearConnectTimer()
    this.sendJson({
      type: 'session.update',
      session: {
        sample_rate: this.sampleRate,
        language: this.language,
        automatic_punctuation: this.automaticPunctuation
      }
    })
    for (const chunk of this.queue) this.sendBinary(chunk)
    this.queue = []
    this.resolveOpen?.()
    this.resolveOpen = null
    this.rejectOpen = null
  }

  private onMessage(data: unknown): void {
    const text = this.textFromData(data)
    if (!text) return

    let event: ServerEvent
    try {
      event = JSON.parse(text) as ServerEvent
    } catch {
      return
    }
    if (!event || typeof event !== 'object') return

    switch (eventType(event)) {
      case 'conversation.item.input_audio_transcription.delta':
        if (typeof event.delta === 'string') this.applyDelta(event.delta)
        break
      case 'conversation.item.input_audio_transcription.completed':
        this.completeSegment(typeof event.transcript === 'string' ? event.transcript : '')
        break
      case 'input_audio_buffer.committed':
        this.settle()
        break
      case 'error':
        this.fail(new Error(serverMessage(event.error)))
        break
      default:
        break
    }
  }

  private onClose(): void {
    if (this.cancelled) return
    if (this.rejectFinish) {
      this.fail(new Error('The NVIDIA Nemotron connection closed before the transcript was ready.'))
      return
    }
    if (this.failure) return
    this.fail(
      this.opened
        ? new Error('The NVIDIA Nemotron connection closed unexpectedly.')
        : new Error('Could not connect to the local NVIDIA Nemotron server.')
    )
  }

  private applyDelta(delta: string): void {
    if (!delta) return
    // The server sends only the new suffix when the hypothesis extends the
    // previous partial, and the full replacement when it revises earlier
    // words. A replacement always starts with the current hypothesis.
    const previous = this.partialRaw
    this.partialRaw =
      previous && delta.startsWith(previous) ? delta : `${previous}${delta}`
    this.show()
  }

  private completeSegment(transcript: string): void {
    const clean = normalizeTranscript(transcript)
    if (clean) this.segments.push(clean)
    this.partialRaw = ''
    this.show()
  }

  private show(): void {
    const text = normalizeTranscript(
      [this.segments.join(' '), this.partialRaw].filter(Boolean).join(' ')
    )
    if (text === this.shown) return
    this.shown = text
    this.handlers.onPartial?.(text)
  }

  private settle(): void {
    if (!this.resolveFinish) return
    // Commit order is: final `.completed`, then `input_audio_buffer.committed`.
    const text = this.segments.length > 0 ? this.segments.join(' ') : this.partialRaw
    const resolve = this.resolveFinish
    this.resolveFinish = null
    this.rejectFinish = null
    this.clearTimers()
    this.close()
    resolve(this.result(text))
  }

  private reject(error: Error): void {
    if (!this.rejectFinish) {
      this.failure ??= error
      return
    }
    const reject = this.rejectFinish
    this.resolveFinish = null
    this.rejectFinish = null
    this.clearTimers()
    this.close()
    reject(error)
  }

  private fail(error: Error): void {
    if (this.cancelled) return
    this.failure ??= error
    if (!this.opened) {
      this.rejectOpen?.(error)
      this.rejectOpen = null
      this.resolveOpen = null
      this.clearConnectTimer()
      this.close()
      return
    }
    if (this.rejectFinish) this.reject(error)
  }

  private result(text: string): AsrResult {
    return {
      text: normalizeTranscript(text),
      latencyMs: Math.round(performance.now() - this.startedAt),
      provider: 'nemo-speech'
    }
  }

  private sendJson(value: unknown): void {
    if (!this.socket || this.cancelled) return
    try {
      this.socket.send(JSON.stringify(value))
    } catch (error) {
      this.fail(asError(error))
    }
  }

  private sendBinary(pcm: Uint8Array): void {
    if (!this.socket || this.cancelled) return
    try {
      this.socket.send(pcm)
    } catch (error) {
      this.fail(asError(error))
    }
  }

  private textFromData(data: unknown): string | null {
    if (typeof data === 'string') return data
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
    return null
  }

  private close(): void {
    const socket = this.socket
    this.socket = null
    this.opened = false
    if (!socket) return
    try {
      socket.close(1000)
    } catch {
      // The socket already closed.
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = null
  }

  private clearTimers(): void {
    this.clearConnectTimer()
    if (this.finishTimer) clearTimeout(this.finishTimer)
    this.finishTimer = null
  }
}

/**
 * NVIDIA Nemotron streaming client. Each turn owns one WebSocket so a stale
 * connection can never leak audio into the next command.
 */
export class NemoStreamingTranscriber implements LiveTranscriber {
  private readonly options: NemoStreamingTranscriberOptions
  private readonly url: string

  constructor(options: NemoStreamingTranscriberOptions) {
    this.options = options
    this.url = realtimeUrl(options.baseUrl)
  }

  startTurn(handlers: LiveTurnHandlers = {}): LiveTurn {
    return new NemoLiveTurn({ ...this.options, url: this.url, handlers })
  }
}

/**
 * Deterministic local transcriber for tests and the smoke harness. It reveals
 * the scripted sentence as audio duration grows, then returns it all on finish.
 */
export class FakeLiveTranscriber implements LiveTranscriber {
  readonly transcript: string
  private readonly wordIntervalMs: number

  constructor(transcript = 'open notepad', wordIntervalMs = 450) {
    this.transcript = transcript
    this.wordIntervalMs = wordIntervalMs
  }

  startTurn(handlers: LiveTurnHandlers = {}): LiveTurn {
    const words = this.transcript.split(/\s+/).filter(Boolean)
    const interval = this.wordIntervalMs
    let elapsedMs = 0
    let cancelled = false

    return {
      push: (samples, sampleRate) => {
        if (cancelled) return
        elapsedMs += durationMs(samples, sampleRate || ASR_SAMPLE_RATE)
        const count = Math.min(words.length, Math.floor(elapsedMs / interval))
        const text = words.slice(0, count).join(' ')
        if (text) handlers.onPartial?.(text)
      },
      finish: async () => {
        cancelled = true
        return { text: this.transcript, latencyMs: 0, provider: 'fake' }
      },
      cancel: () => {
        cancelled = true
      }
    }
  }
}
