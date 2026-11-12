/**
 * Groq-backed planner client using the OpenAI-compatible tool calling API.
 *
 * Ported from apps/api/app/groq.py. The client talks to Groq over the global
 * `fetch`; tests inject a fake fetch seam so no request leaves the process.
 */

import type { LlmClient, LlmReply, ToolCall, ToolSpec } from './types'

export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b'
export const GROQ_FALLBACK_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b'
] as const
export const GROQ_TIMEOUT_SECONDS = 5.0

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export class GroqError extends Error {
  readonly status?: number

  constructor(message: string, options: { status?: number } = {}) {
    super(message)
    this.name = 'GroqError'
    this.status = options.status
  }
}

export class GroqQuotaError extends GroqError {
  constructor(message: string, options: { status?: number } = {}) {
    super(message, options)
    this.name = 'GroqQuotaError'
  }
}

interface GroqClientOptions {
  fetch?: FetchLike
  baseUrl?: string
  model?: string
}

interface ChatMessage {
  role: string
  content: string
}

interface FunctionTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolSpec['parameters']
  }
}

interface ChatBody {
  model: string
  messages: ChatMessage[]
  tools: FunctionTool[]
  tool_choice: 'auto'
  temperature: number
}

export class GroqClient implements LlmClient {
  readonly baseUrl: string
  readonly model: string
  private readonly apiKey: string
  private readonly fetchImpl: FetchLike

  constructor(apiKey: string, options: GroqClientOptions = {}) {
    this.apiKey = apiKey
    this.fetchImpl =
      options.fetch ?? ((url, init) => globalThis.fetch(url, init))
    this.baseUrl = (options.baseUrl ?? DEFAULT_GROQ_BASE_URL).replace(/\/+$/, '')
    this.model = options.model ?? DEFAULT_GROQ_MODEL
  }

  static fromEnv(options: { fetch?: FetchLike } = {}): GroqClient {
    return new GroqClient(apiKeyFromEnv(), {
      fetch: options.fetch,
      baseUrl: baseUrlFromEnv(),
      model: process.env.KESTREL_GROQ_MODEL || DEFAULT_GROQ_MODEL
    })
  }

  async choose(transcript: string, specs: ToolSpec[]): Promise<LlmReply> {
    const url = `${this.baseUrl}/chat/completions`
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    }

    let remaining = [...specs]
    let response: Response | undefined
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = this.buildBody(transcript, remaining)
      response = await this.post(url, headers, body)
      if (response.status === 400 && attempt === 0) {
        const dropped = await offendingTool(response, remaining)
        if (dropped !== null) {
          console.warn(
            `Groq rejected the schema for tool ${JSON.stringify(dropped)}; retrying without it.`
          )
          remaining = remaining.filter((spec) => spec.name !== dropped)
          continue
        }
      }
      break
    }

    if (response === undefined) {
      throw new GroqError('Groq planner request failed (no response).')
    }

    if (response.status === 429) {
      throw new GroqQuotaError(
        `Groq quota exhausted for ${this.model} (HTTP 429).`,
        { status: 429 }
      )
    }

    if (response.status >= 400) {
      throw new GroqError(
        `Groq planner failed with HTTP ${response.status}: ${await errorSnippet(response)}`,
        { status: response.status }
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new GroqError('Groq response was not valid JSON.')
    }

    return replyFromResponse(data)
  }

  private buildBody(transcript: string, specs: ToolSpec[]): ChatBody {
    const tools: FunctionTool[] = specs.map((spec) => ({
      type: 'function',
      function: {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters
      }
    }))
    return {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are Kestrel, an executive voice assistant on Windows. ' +
            'The user interacts with you via voice and your answers are spoken aloud. ' +
            'Answer conversational questions concisely, warmly, and naturally. ' +
            'When the user asks to open an application, search files, check weather, ' +
            'type text, or perform any action, call the corresponding tool. ' +
            "Always call a tool if one fits the user's intent."
        },
        { role: 'user', content: transcript }
      ],
      tools,
      tool_choice: 'auto',
      temperature: 0.1
    }
  }

  private async post(
    url: string,
    headers: Record<string, string>,
    body: ChatBody
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GROQ_TIMEOUT_SECONDS * 1000)
      })
    } catch (error) {
      throw new GroqError(
        `Groq planner request failed (${errorName(error)}).`
      )
    }
  }
}

export function replyFromResponse(data: unknown): LlmReply {
  return {
    calls: toolCallsFromResponse(data),
    content: contentFromResponse(data)
  }
}

export function contentFromResponse(data: unknown): string | null {
  const choices = choicesFrom(data)
  if (choices === null) return null

  const message = messageFrom(choices[0])
  if (message === null) return null

  const content = message.content
  if (typeof content !== 'string') return null
  const stripped = content.trim()
  return stripped || null
}

export function toolCallsFromResponse(data: unknown): ToolCall[] {
  const choices = choicesFrom(data)
  if (choices === null) return []

  const message = messageFrom(choices[0])
  if (message === null) return []

  const rawToolCalls = message.tool_calls
  if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) return []

  const calls: ToolCall[] = []
  for (const item of rawToolCalls) {
    if (!isRecord(item)) continue
    const fn = item.function
    if (!isRecord(fn)) continue
    const name = fn.name
    if (typeof name !== 'string' || name.trim() === '') continue

    const argsRaw = fn.arguments ?? '{}'
    let args: Record<string, unknown> = {}
    if (typeof argsRaw === 'string') {
      try {
        args = JSON.parse(argsRaw) as Record<string, unknown>
      } catch {
        args = {}
      }
    } else if (isRecord(argsRaw)) {
      args = argsRaw
    }
    calls.push({ name, arguments: args })
  }
  return calls
}

function choicesFrom(data: unknown): unknown[] | null {
  if (!isRecord(data)) return null
  const choices = data.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  return choices
}

function messageFrom(choice: unknown): Record<string, unknown> | null {
  if (!isRecord(choice)) return null
  const message = choice.message
  return isRecord(message) ? message : null
}

async function errorSnippet(response: Response): Promise<string> {
  let raw: string
  try {
    raw = await response.clone().text()
  } catch {
    return ''
  }

  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data)) {
      return raw.slice(0, 200)
    }
    const error = data.error
    if (isRecord(error) && 'message' in error) {
      return String(error.message)
    }
    return JSON.stringify(data)
  } catch {
    return raw.slice(0, 200)
  }
}

const TOOL_NAME_PATTERN = /tool[^A-Za-z0-9_-]+([A-Za-z0-9_-]+)/

async function offendingTool(
  response: Response,
  specs: ToolSpec[]
): Promise<string | null> {
  const message = await errorSnippet(response)
  const lowered = message.toLowerCase()
  if (!lowered.includes('schema') && !lowered.includes('parameters')) {
    return null
  }
  const names = new Set(specs.map((spec) => spec.name))
  const match = TOOL_NAME_PATTERN.exec(message)
  if (match !== null && names.has(match[1])) {
    return match[1]
  }
  for (const name of names) {
    if (message.includes(name)) {
      return name
    }
  }
  return null
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

function apiKeyFromEnv(): string {
  const key =
    (process.env.KESTREL_GROQ_API_KEY ?? '').trim() ||
    (process.env.GROQ_API_KEY ?? '').trim()
  if (!key) {
    throw new Error('No Groq API key found in environment.')
  }
  return key
}

function baseUrlFromEnv(): string {
  const url = (process.env.KESTREL_GROQ_BASE_URL ?? '').trim()
  return url || DEFAULT_GROQ_BASE_URL
}

export function modelChainFromEnv(): string[] {
  const preferred = process.env.KESTREL_GROQ_MODEL || DEFAULT_GROQ_MODEL
  const chain = [preferred]
  for (const model of GROQ_FALLBACK_MODELS) {
    if (!chain.includes(model)) {
      chain.push(model)
    }
  }
  return chain
}

export interface ResilientLlmClientOptions {
  attempts?: number
  backoff?: number
  cooldown?: number
  clock?: () => number
  sleep?: (seconds: number) => Promise<void>
}

export class ResilientLlmClient implements LlmClient {
  private readonly clients: GroqClient[]
  private readonly attempts: number
  private readonly backoff: number
  private readonly cooldown: number
  private readonly clock: () => number
  private readonly sleep: (seconds: number) => Promise<void>
  private readonly skipUntil = new Map<string, number>()

  constructor(
    clients: readonly GroqClient[],
    options: ResilientLlmClientOptions = {}
  ) {
    this.clients = [...clients]
    this.attempts = Math.max(1, options.attempts ?? 2)
    this.backoff = options.backoff ?? 0.3
    this.cooldown = options.cooldown ?? 120.0
    this.clock =
      options.clock ?? (() => Date.now() / 1000)
    this.sleep =
      options.sleep ??
      ((seconds) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, seconds * 1000)
        }))
  }

  get models(): string[] {
    return this.clients.map((client) => client.model)
  }

  private ordered(): GroqClient[] {
    const now = this.clock()
    const ready = this.clients.filter(
      (client) => (this.skipUntil.get(client.model) ?? 0) <= now
    )
    const cooling = this.clients.filter(
      (client) => (this.skipUntil.get(client.model) ?? 0) > now
    )
    return [...ready, ...cooling]
  }

  async choose(transcript: string, specs: ToolSpec[]): Promise<LlmReply> {
    const failures: string[] = []
    const now = this.clock()
    for (const client of this.ordered()) {
      const cooling = (this.skipUntil.get(client.model) ?? 0) > now
      const attempts = cooling ? 1 : this.attempts
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await client.choose(transcript, specs)
        } catch (error) {
          if (error instanceof GroqQuotaError) {
            this.skipUntil.set(client.model, this.clock() + this.cooldown)
            failures.push(`${client.model}: ${error.message}`)
            console.warn(
              `Groq model ${client.model} is out of quota; skipping it for ${Math.trunc(this.cooldown)}s.`
            )
            break
          }
          if (error instanceof GroqError) {
            failures.push(`${client.model}: ${error.message}`)
            console.warn(
              `Groq model ${client.model} failed (attempt ${attempt + 1}/${attempts}): ${error.message}`
            )
            if (attempt + 1 < attempts) {
              await this.sleep(this.backoff * (attempt + 1))
            }
            continue
          }
          throw error
        }
      }
    }
    throw new GroqError('All Groq models failed: ' + failures.join('; '))
  }
}

export function resilientFromEnv(
  options: Omit<ResilientLlmClientOptions, 'clock' | 'sleep'> = {}
): ResilientLlmClient {
  const apiKey = apiKeyFromEnv()
  const baseUrl = baseUrlFromEnv()
  return new ResilientLlmClient(
    modelChainFromEnv().map(
      (model) => new GroqClient(apiKey, { baseUrl, model })
    ),
    options
  )
}
