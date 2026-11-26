export interface DecodedSpeechAudio {
  handle: unknown
  duration: number
}

export interface SpeechAudioSink {
  decode(bytes: Uint8Array): Promise<DecodedSpeechAudio>
  schedule(handle: unknown, at: number, onEnded: () => void): void
  now(): number
  cancel(): void
}

export interface SpeechPlayerOptions {
  /** Small head start so the first buffer never starts in the past. Default 0.05s. */
  leadSeconds?: number
}

const DEFAULT_LEAD_SECONDS = 0.05

/**
 * Plays decoded speech buffers back to back. Decoding stays in arrival order,
 * so a slow decode can never reorder playback. Buffers are scheduled against a
 * running cursor, which keeps consecutive sentences gapless whenever synthesis
 * stays ahead of playback.
 */
export class SpeechPlayer {
  private readonly sink: SpeechAudioSink
  private readonly leadSeconds: number
  private cursor: number | null = null
  private pending = 0
  private decodes: Promise<void> = Promise.resolve()
  private waiters: Array<() => void> = []
  private stopped = false
  private lateJoinCount = 0
  private decodeFailureCount = 0

  constructor(sink: SpeechAudioSink, options: SpeechPlayerOptions = {}) {
    this.sink = sink
    const lead = options.leadSeconds
    this.leadSeconds =
      typeof lead === 'number' && Number.isFinite(lead) && lead >= 0
        ? lead
        : DEFAULT_LEAD_SECONDS
  }

  /** Test/telemetry only: number of buffers that arrived after their slot passed. */
  get lateJoins(): number {
    return this.lateJoinCount
  }

  /** Test/telemetry only: number of buffers dropped because decoding failed. */
  get decodeFailures(): number {
    return this.decodeFailureCount
  }

  enqueue(bytes: Uint8Array): void {
    if (this.stopped) return
    this.pending += 1
    this.decodes = this.decodes.then(() => this.playOne(bytes))
  }

  /** Resolves once every enqueued buffer has finished playing. */
  finished(): Promise<void> {
    if (this.stopped || this.pending === 0) return Promise.resolve()
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  cancel(): void {
    if (this.stopped) return
    this.stopped = true
    this.pending = 0
    this.cursor = null
    this.sink.cancel()
    this.releaseWaiters()
  }

  private async playOne(bytes: Uint8Array): Promise<void> {
    if (this.stopped) return

    let decoded: DecodedSpeechAudio
    try {
      decoded = await this.sink.decode(bytes)
    } catch {
      this.decodeFailureCount += 1
      this.settleBuffer()
      return
    }
    if (this.stopped) return

    const duration =
      Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : 0
    const earliest = this.sink.now() + this.leadSeconds
    const previousEnd = this.cursor
    const start = previousEnd === null ? earliest : Math.max(earliest, previousEnd)
    if (previousEnd !== null && start > previousEnd) this.lateJoinCount += 1
    this.cursor = start + duration

    let ended = false
    const onEnded = (): void => {
      if (ended) return
      ended = true
      if (this.stopped) return
      this.settleBuffer()
    }

    try {
      this.sink.schedule(decoded.handle, start, onEnded)
    } catch {
      this.settleBuffer()
    }
  }

  private settleBuffer(): void {
    if (this.pending > 0) this.pending -= 1
    if (this.pending === 0) this.releaseWaiters()
  }

  private releaseWaiters(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const resolve of waiters) resolve()
  }
}