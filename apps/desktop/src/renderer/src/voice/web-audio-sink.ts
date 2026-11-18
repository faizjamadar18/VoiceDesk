import type { DecodedSpeechAudio, SpeechAudioSink } from './speech-player'

/**
 * Web Audio playback for streaming speech. One AudioContext is created lazily
 * and kept warm between answers; cancel() stops sources without closing it.
 */
export class WebAudioSink implements SpeechAudioSink {
  private context: AudioContext | null = null
  private readonly sources = new Set<AudioBufferSourceNode>()
  private analyser: AnalyserNode | null = null
  private pcmData: Float32Array<ArrayBuffer> | null = null

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
    const analyser = this.ensureAnalyser(context)
    source.connect(analyser)
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

  getVolume(): number {
    if (this.analyser === null || this.sources.size === 0) return 0
    if (this.pcmData === null || this.pcmData.length !== this.analyser.fftSize) {
      this.pcmData = new Float32Array(this.analyser.fftSize)
    }
    this.analyser.getFloatTimeDomainData(this.pcmData)
    let sum = 0
    for (let i = 0; i < this.pcmData.length; i++) {
      const sample = this.pcmData[i]
      sum += sample * sample
    }
    const rms = Math.sqrt(sum / this.pcmData.length)
    return Math.min(1, Math.max(0, rms * 4))
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

  private ensureAnalyser(context: AudioContext): AnalyserNode {
    if (this.analyser === null) {
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.3
      this.analyser.connect(context.destination)
    }
    return this.analyser
  }
}