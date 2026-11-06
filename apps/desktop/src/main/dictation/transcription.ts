export interface TranscriptionRequest {
  audio: Uint8Array
  mimeType: string
}

export interface TranscriptionResult {
  text: string
  latencyMs: number
  provider?: string
}

export interface TranscriptionClient {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export const TRANSCRIPTION_TIMEOUT_MS = 30_000

export interface HttpTranscriptionClientOptions {
  baseUrl: string
  fetch?: FetchLike
  timeoutMs?: number
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === 'string') return payload.detail
    if (payload.detail !== undefined) return JSON.stringify(payload.detail)
  } catch {
    // Fall through to the HTTP status text when the body is not JSON.
  }

  return response.statusText || `HTTP ${response.status}`
}

export class HttpTranscriptionClient implements TranscriptionClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(options: HttpTranscriptionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': request.mimeType },
        // Undici (Node's fetch) accepts a Uint8Array body directly; the DOM
        // BodyInit union in this tsconfig is narrower than Node's runtime.
        body: request.audio as BodyInit,
        signal: controller.signal
      })

      if (!response.ok) {
        const detail = await readErrorDetail(response)
        throw new Error(`Transcription request failed (${response.status}): ${detail}`)
      }

      return (await response.json()) as TranscriptionResult
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Transcription request timed out after ${this.timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
