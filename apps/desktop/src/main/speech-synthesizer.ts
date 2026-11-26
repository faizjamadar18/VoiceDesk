import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { splitSpeechChunks } from '../shared/speech-chunking'
import { trimTrailingSilence, wavDurationMs } from './speech-audio'

export interface SpeechChunk {
  index: number
  text: string
  audio: Uint8Array
}

export interface SpeechSynthesizerEngine {
  synthesize(
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<Uint8Array | null>
  stream?(
    text: string,
    options?: { voice?: string; speed?: number }
  ): AsyncIterable<{ text: string; audio: Uint8Array }>
}

export interface KokoroModel {
  generate(
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<{ toWav: () => ArrayBuffer }>
  stream?(
    text: string,
    options?: { voice?: string; speed?: number }
  ): AsyncIterable<{ text: string; audio: { toWav: () => ArrayBuffer } }>
}

export type KokoroModelLoader = () => Promise<KokoroModel>

export interface KokoroEngineOptions {
  modelId?: string
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  device?: 'wasm' | 'webgpu' | 'cpu' | 'dml' | null
  loader?: KokoroModelLoader
}

export const DEFAULT_VOICE = 'af_heart'
export const DEFAULT_SPEED = 1.0
export const DEFAULT_KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export function sanitizeSpeechText(text: string): string {
  if (!text) return ''
  return text
    // Replace markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Remove code fence delimiters with optional language tag (e.g. ```typescript or ```)
    .replace(/```[a-zA-Z0-9_-]*/g, '')
    // Remove inline backticks
    .replace(/`+/g, '')
    // Remove markdown heading markers (#, ##, ###, etc.)
    .replace(/(?:^|\n)\s*#{1,6}\s+/g, '\n')
    .replace(/#{1,6}\s*/g, '')
    // Remove asterisks and tildes (bold, italic, strikethrough)
    .replace(/[*~]+/g, '')
    // Collapse horizontal whitespace within lines while preserving newlines
    .replace(/[^\S\r\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
}

export function splitSpeechSentences(text: string): string[] {
  if (!text || !text.trim()) {
    return []
  }
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function isTtsDebugEnabled(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.KESTREL_TTS_DEBUG === '1'
  } catch {
    return false
  }
}

function logChunkTelemetry(
  index: number,
  text: string,
  generationMs: number,
  audioMs: number | null
): void {
  const audio = audioMs === null ? 'n/a' : `${Math.round(audioMs)}`
  const rtf = audioMs && audioMs > 0 ? (generationMs / audioMs).toFixed(2) : 'n/a'
  console.log(
    `[tts] chunk=${index} chars=${text.length} genMs=${Math.round(generationMs)} audioMs=${audio} rtf=${rtf}`
  )
}

export function resolveDefaultKokoroModelId(): string {
  if (typeof process !== 'undefined') {
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath
    if (resourcesPath) {
      const bundledPath = join(resourcesPath, 'models', 'kokoro')
      if (existsSync(bundledPath)) {
        return bundledPath
      }
    }
  }
  return DEFAULT_KOKORO_MODEL_ID
}

export class KokoroSynthesizerEngine implements SpeechSynthesizerEngine {
  private readonly modelId: string
  private readonly dtype: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  private readonly device: 'wasm' | 'webgpu' | 'cpu' | 'dml' | null
  private readonly loader?: KokoroModelLoader
  private modelPromise: Promise<KokoroModel> | null = null
  private warmupPromise: Promise<void> | null = null

  constructor(options: KokoroEngineOptions = {}) {
    this.modelId = options.modelId ?? resolveDefaultKokoroModelId()
    this.dtype = options.dtype ?? 'q8'
    this.device = options.device !== undefined ? options.device : null
    this.loader = options.loader
  }

  private async getModel(): Promise<KokoroModel> {
    if (!this.modelPromise) {
      if (this.loader) {
        this.modelPromise = this.loader()
      } else {
        this.modelPromise = (async () => {
          try {
            const { createRequire } = await import('node:module')
            const req = createRequire(import.meta.url)
            const kokoroDist = dirname(req.resolve('kokoro-js'))
            if (!('__dirname' in globalThis)) {
              ;(globalThis as unknown as { __dirname: string }).__dirname = kokoroDist
            }
          } catch {
            // ignore if not running in Node
          }

          const { KokoroTTS } = await import('kokoro-js')
          const tts = await KokoroTTS.from_pretrained(this.modelId, {
            dtype: this.dtype,
            device: this.device as any
          })
          return tts as unknown as KokoroModel
        })()
      }
    }
    return this.modelPromise
  }

  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<Uint8Array | null> {
    const sanitized = sanitizeSpeechText(text)
    if (!sanitized) {
      return null
    }
    await this.awaitWarmupIfRunning()
    const model = await this.getModel()
    const rawAudio = await model.generate(sanitized, {
      voice: options?.voice,
      speed: options?.speed ?? DEFAULT_SPEED
    })
    return trimTrailingSilence(new Uint8Array(rawAudio.toWav()))
  }

  async *stream(
    text: string,
    options?: { voice?: string; speed?: number }
  ): AsyncIterable<{ text: string; audio: Uint8Array }> {
    const sanitized = sanitizeSpeechText(text)
    const chunks = splitSpeechChunks(sanitized)
    if (chunks.length === 0) {
      return
    }

    await this.awaitWarmupIfRunning()

    const model = await this.getModel()
    const voice = options?.voice
    const speed = options?.speed ?? DEFAULT_SPEED
    const debug = isTtsDebugEnabled()

    let index = 0
    for (const chunk of chunks) {
      const startedAt = performance.now()
      const rawAudio = await model.generate(chunk, { voice, speed })
      const generationMs = performance.now() - startedAt
      const audio = trimTrailingSilence(new Uint8Array(rawAudio.toWav()))
      index += 1
      if (debug) {
        logChunkTelemetry(index, chunk, generationMs, wavDurationMs(audio))
      }
      yield { text: chunk, audio }
    }
  }

  warmup(): Promise<void> {
    if (!this.warmupPromise) {
      this.warmupPromise = this.runWarmup()
    }
    return this.warmupPromise
  }

  private async runWarmup(): Promise<void> {
    try {
      const model = await this.getModel()
      await model.generate('Ready.', { voice: DEFAULT_VOICE, speed: DEFAULT_SPEED })
    } catch {
      // Warm-up is best effort and never blocks speech.
    }
  }

  private async awaitWarmupIfRunning(): Promise<void> {
    if (!this.warmupPromise) {
      return
    }
    try {
      await this.warmupPromise
    } catch {
      // Warm-up is best effort and never blocks speech.
    }
  }
}

export interface SynthesizeOptions {
  voice?: string
  speed?: number
}

export interface SpeechSynthesizerOptions {
  engine?: SpeechSynthesizerEngine
  defaultVoice?: string
  defaultSpeed?: number
}

export class SpeechSynthesizer {
  private readonly engine: SpeechSynthesizerEngine
  private readonly defaultVoice: string
  private readonly defaultSpeed: number

  constructor(options: SpeechSynthesizerOptions = {}) {
    this.engine = options.engine ?? new KokoroSynthesizerEngine()
    this.defaultVoice = options.defaultVoice ?? DEFAULT_VOICE
    this.defaultSpeed = options.defaultSpeed ?? DEFAULT_SPEED
  }

  warmup(): void {
    const engineWithWarmup = this.engine as { warmup?: () => Promise<void> }
    if (typeof engineWithWarmup.warmup === 'function') {
      void engineWithWarmup.warmup()
    }
  }

  async synthesize(text: string, options?: SynthesizeOptions): Promise<Uint8Array | null> {
    if (!text || !text.trim()) {
      return null
    }

    try {
      const voice = options?.voice ?? this.defaultVoice
      const speed = options?.speed ?? this.defaultSpeed
      return await this.engine.synthesize(text.trim(), { voice, speed })
    } catch (error) {
      console.warn('[speech-synthesizer] Speech synthesis failed:', error)
      return null
    }
  }

  async *synthesizeStream(text: string, options?: SynthesizeOptions): AsyncIterable<SpeechChunk> {
    if (!text || !text.trim()) {
      return
    }

    const trimmed = text.trim()
    const voice = options?.voice ?? this.defaultVoice
    const speed = options?.speed ?? this.defaultSpeed

    if (typeof this.engine.stream === 'function') {
      let index = 0
      for await (const chunk of this.engine.stream(trimmed, { voice, speed })) {
        yield { index: index++, text: chunk.text, audio: chunk.audio }
      }
      return
    }

    const audio = await this.engine.synthesize(trimmed, { voice, speed })
    if (audio) {
      yield { index: 0, text: trimmed, audio }
    }
  }
}

