/**
 * Transcription providers for the Kestrel desktop app.
 *
 * Ported from apps/api/app/transcribers.py. Audio is held in memory only;
 * nothing here writes audio to disk, a database, or logs.
 */

export const DEFAULT_FAKE_TRANSCRIPT = 'Fake transcription from Kestrel.'
export const GROQ_ENDPOINT =
  'https://api.groq.com/openai/v1/audio/transcriptions'
export const GROQ_MODEL = 'whisper-large-v3-turbo'
export const GROQ_TIMEOUT_SECONDS = 30.0

export const CONTENT_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
  'audio/x-wav': 'wav'
}

export type TranscriptionFetch = (
  url: string,
  init: RequestInit
) => Promise<Response>

export class MissingProviderKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingProviderKeyError'
  }
}

export class TranscriptionProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriptionProviderError'
  }
}

export interface Transcriber {
  name: string
  transcribe(
    audio: Uint8Array | ArrayBuffer,
    contentType: string
  ): Promise<string>
}

export class FakeTranscriber implements Transcriber {
  readonly name = 'fake'
  private readonly transcript: string
  private readonly delayMs: number

  constructor(transcript: string = DEFAULT_FAKE_TRANSCRIPT, delayMs = 0) {
    this.transcript = transcript
    this.delayMs = Math.max(0, delayMs)
  }

  static fromEnv(): FakeTranscriber {
    const transcript =
      process.env.KESTREL_FAKE_TRANSCRIPT || DEFAULT_FAKE_TRANSCRIPT
    return new FakeTranscriber(transcript, delayMsFromEnv())
  }

  async transcribe(
    _audio: Uint8Array | ArrayBuffer,
    _contentType: string
  ): Promise<string> {
    if (this.delayMs) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.delayMs)
      })
    }
    return this.transcript
  }
}

interface GroqTranscriberOptions {
  fetch?: TranscriptionFetch
}

export class GroqTranscriber implements Transcriber {
  readonly name = 'groq'
  private readonly apiKey: string
  private readonly fetchImpl: TranscriptionFetch

  constructor(apiKey: string, options: GroqTranscriberOptions = {}) {
    this.apiKey = apiKey
    this.fetchImpl =
      options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  }

  static fromEnv(options: GroqTranscriberOptions = {}): GroqTranscriber {
    const apiKey = (process.env.GROQ_API_KEY ?? '').trim()
    if (!apiKey) {
      throw new MissingProviderKeyError(
        'GROQ_API_KEY is not configured. Set it or use ' +
          'KESTREL_ASR_PROVIDER=fake.'
      )
    }
    return new GroqTranscriber(apiKey, options)
  }

  async transcribe(
    audio: Uint8Array | ArrayBuffer,
    contentType: string
  ): Promise<string> {
    const headers = { Authorization: `Bearer ${this.apiKey}` }
    const form = new FormData()
    form.append(
      'file',
      new Blob([audioBlobPart(audio)], { type: contentType }),
      filenameFor(contentType)
    )
    form.append('model', GROQ_MODEL)

    let response: Response
    try {
      response = await this.fetchImpl(GROQ_ENDPOINT, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(GROQ_TIMEOUT_SECONDS * 1000)
      })
    } catch (error) {
      throw new TranscriptionProviderError(
        `Groq transcription request failed (${errorName(error)}).`
      )
    }

    if (response.status >= 400) {
      throw new TranscriptionProviderError(
        `Groq transcription failed with HTTP ${response.status}.`
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new TranscriptionProviderError(
        'Groq returned an invalid JSON response.'
      )
    }

    const text = isRecord(payload) ? payload.text : null
    if (typeof text !== 'string') {
      throw new TranscriptionProviderError(
        'Groq returned no transcript text.'
      )
    }
    return text
  }
}

export function filenameFor(contentType: string): string {
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  const extension = CONTENT_TYPE_EXTENSIONS[mediaType] ?? 'bin'
  return `audio.${extension}`
}

function audioBlobPart(audio: Uint8Array | ArrayBuffer): BlobPart {
  if (audio instanceof ArrayBuffer) {
    return audio
  }
  return audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength
  ) as ArrayBuffer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    if (error instanceof DOMException && error.name) {
      return error.name
    }
    return error.constructor.name || error.name
  }
  return typeof error
}

function delayMsFromEnv(): number {
  const rawDelay = process.env.KESTREL_FAKE_DELAY_MS
  if (!rawDelay) {
    return 0
  }
  const trimmed = rawDelay.trim()
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return 0
  }
  return Math.max(0, Number.parseInt(trimmed, 10))
}
