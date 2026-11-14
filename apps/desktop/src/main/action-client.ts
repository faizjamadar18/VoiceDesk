import type { ActionResponse, ScreenAnswerResponse, ScreenAskInput } from '../shared/types'

export interface ActionClient {
  act(transcript: string): Promise<ActionResponse>
  confirm(
    planId: string,
    approved: boolean,
    edits?: Record<string, unknown>
  ): Promise<ActionResponse>
  undo(planId: string): Promise<ActionResponse>
  askScreen(input: ScreenAskInput): Promise<ScreenAnswerResponse>
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export const ACTION_TIMEOUT_MS = 15_000
export const SCREEN_TIMEOUT_MS = 45_000

export interface HttpActionClientOptions {
  baseUrl: string
  fetch?: FetchLike
  timeoutMs?: number
  screenTimeoutMs?: number
}

interface PostOptions {
  timeoutMs: number
  timeoutMessage: string
  failureMessage: (status: number, detail: string) => string
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === 'string') return payload.detail
    if (payload.detail !== undefined) return JSON.stringify(payload.detail)
  } catch {
    // Fall through to the HTTP status text.
  }
  return response.statusText || `HTTP ${response.status}`
}

export class HttpActionClient implements ActionClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number
  private readonly screenTimeoutMs: number

  constructor(options: HttpActionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? ACTION_TIMEOUT_MS
    this.screenTimeoutMs = options.screenTimeoutMs ?? SCREEN_TIMEOUT_MS
  }

  async act(transcript: string): Promise<ActionResponse> {
    return this.post<ActionResponse>('/act', { transcript }, this.actionOptions())
  }

  async confirm(
    planId: string,
    approved: boolean,
    edits?: Record<string, unknown>
  ): Promise<ActionResponse> {
    const body: Record<string, unknown> = { planId, approved }
    if (edits !== undefined) body['edits'] = edits
    return this.post<ActionResponse>('/act/confirm', body, this.actionOptions())
  }

  async undo(planId: string): Promise<ActionResponse> {
    return this.post<ActionResponse>('/act/undo', { planId }, this.actionOptions())
  }

  async askScreen(input: ScreenAskInput): Promise<ScreenAnswerResponse> {
    return this.post<ScreenAnswerResponse>(
      '/screen/ask',
      { question: input.question, image: input.imageBase64, marked: input.marked },
      {
        timeoutMs: this.screenTimeoutMs,
        timeoutMessage: 'Screen reading timed out. Try again.',
        failureMessage: (_status, detail) => `Couldn't read your screen: ${detail}`
      }
    )
  }

  private actionOptions(): PostOptions {
    return {
      timeoutMs: this.timeoutMs,
      timeoutMessage: `Action request timed out after ${this.timeoutMs}ms`,
      failureMessage: (status, detail) =>
        `Action request failed (${status}): ${detail}`
    }
  }

  private async post<T>(path: string, body: Record<string, unknown>, options: PostOptions): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const detail = await readErrorDetail(response)
        throw new Error(options.failureMessage(response.status, detail))
      }

      return (await response.json()) as T
    } catch (error) {
      if (controller.signal.aborted) throw new Error(options.timeoutMessage)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
