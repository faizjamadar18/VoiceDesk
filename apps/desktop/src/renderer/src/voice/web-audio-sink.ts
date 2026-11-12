import type { DecodedSpeechAudio, SpeechAudioSink } from './speech-player'

/**
 * Web Audio playback for streaming speech. One AudioContext is created lazily
 * and kept warm between answers; cancel() stops sources without closing it.
 */
export class WebAudioSink implements SpeechAudioSink {
  private context: AudioContext | null = null
  private readonly sources = new Set<AudioBufferSourceNode>()

  async decode(bytes: Uint8Array): Promise<DecodedSpeechAudio> {
    // Wait for a running clock so start times are never measured against a frozen one.
    const context = await this.ensureRunningContext()
    // decodeAudioData takes ownership of the buffer, so hand it a copy.
    const copy = new Uint8Array(bytes)
    const buffer = await context.decodeAudioData(copy.buffer)
    return { handle: buffer, duration: buffer.duration }
  }

  schedule(handle: unknown, at: number, onEnded: () => void): void {
    const context = this.ensureContext()
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    const source = context.createBufferSource()
    source.buffer = handle as AudioBuffer
    source.connect(context.destination)
    this.sources.add(source)

    source.onended = (): void => {
      this.sources.delete(source)
      try {
        source.disconnect()
      } catch {
        // Already torn down.
      }
      onEnded()
    }

    source.start(Math.max(at, context.currentTime))
  }

  now(): number {
    return this.ensureContext().currentTime
  }

  cancel(): void {
    for (const source of this.sources) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // Source may not have started yet.
      }
      try {
        source.disconnect()
      } catch {
        // Already disconnected.
      }
    }
    this.sources.clear()
  }

  /** Create the context on first use and wait for it to leave the suspended state. */
  private async ensureRunningContext(): Promise<AudioContext> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()
    return context
  }

  private ensureContext(): AudioContext {
    if (this.context === null) this.context = new AudioContext()
    return this.context
  }
}