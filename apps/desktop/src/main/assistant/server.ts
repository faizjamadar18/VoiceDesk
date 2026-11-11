/**
 * In-process HTTP surface for the assistant.
 *
 * Ported from apps/api/app/main.py: this is the FastAPI app's routing, request
 * validation, and response serialization, running on Node's `http` server
 * inside the Electron main process. It exists because two things still need a
 * real URL on `127.0.0.1:8765`:
 *
 *   - the Supabase OAuth redirect (`/callback`), which the renderer registers
 *     as `http://127.0.0.1:8765/callback`, and
 *   - the notch, which reaches the assistant through `HttpActionClient`.
 *
 * Routes, status codes, headers, and bodies mirror the Python backend exactly;
 * `AssistantService` holds the behavior, and this layer only parses requests
 * (mirroring the Pydantic models) and serializes responses (mirroring
 * FastAPI's `response_model`).
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import {
  AssistantHttpError,
  AssistantService,
  MAX_AUDIO_BYTES,
  isSupportedContentType
} from './service'

export const CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Successful - VoiceDesk</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #ffffff 0%, #edf4fe 100%);
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
      padding: 24px;
    }
    .content-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 480px;
    }
    h1 {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 32px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 12px 0;
    }
    p {
      font-size: 15px;
      color: #6b7280;
      margin: 0 0 28px 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="content-container">
    <h1>Login Successful</h1>
    <p>You can now return to VoiceDesk and start using your voice as your keyboard</p>
    <button onclick="openApp()" style="display: inline-flex; align-items: center; gap: 10px; background: #000000; color: #ffffff; padding: 12px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 1h6v6H1V1zm8 0h6v6H9V1zm-8 8h6v6H1V9zm8 0h6v6H9V9z"/>
      </svg>
      <span>Open VoiceDesk</span>
    </button>
  </div>
  <script>
    function openApp() {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const target = 'voicedesk://auth/callback' + hash + (search ? (hash ? '&' : '?') + search.slice(1) : '');
      window.location.href = target;
    }
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(openApp, 300);
    });
  </script>
</body>
</html>
`

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8765

// JSON bodies stay generous so the screen-ask base64 payload reaches the
// route's own size checks; this cap only exists to bound a runaway request.
const MAX_JSON_BODY_BYTES = 32 * 1024 * 1024

const UNSUPPORTED_CONTENT_TYPE =
  'Unsupported Content-Type. Send raw audio with an audio/* or ' +
  'application/octet-stream Content-Type.'

export interface BindAddress {
  host: string
  port: number
}

/**
 * Turn `KESTREL_API_URL` into a local bind address, matching the base URL the
 * desktop's `HttpActionClient` talks to. A missing or malformed value falls
 * back to `127.0.0.1:8765`.
 */
export function parseApiAddress(raw: string | undefined): BindAddress {
  const fallback: BindAddress = { host: DEFAULT_HOST, port: DEFAULT_PORT }
  const value = raw?.trim()
  if (!value) return fallback
  try {
    const url = new URL(value)
    const host = url.hostname || fallback.host
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : url.protocol === 'https:'
        ? 443
        : 80
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback
    return { host, port }
  } catch {
    return fallback
  }
}

interface ValidationIssue {
  type: string
  loc: Array<string | number>
  msg: string
  input?: unknown
  ctx?: Record<string, unknown>
}

function missingIssue(field: string): ValidationIssue {
  return { type: 'missing', loc: ['body', field], msg: 'Field required' }
}

function stringTypeIssue(field: string, input: unknown): ValidationIssue {
  return {
    type: 'string_type',
    loc: ['body', field],
    msg: 'Input should be a valid string',
    input
  }
}

function stringTooShortIssue(
  field: string,
  input: unknown,
  min: number
): ValidationIssue {
  return {
    type: 'string_too_short',
    loc: ['body', field],
    msg: `String should have at least ${min} character${min === 1 ? '' : 's'}`,
    input,
    ctx: { min_length: min }
  }
}

function stringTooLongIssue(
  field: string,
  input: unknown,
  max: number
): ValidationIssue {
  return {
    type: 'string_too_long',
    loc: ['body', field],
    msg: `String should have at most ${max} characters`,
    input,
    ctx: { max_length: max }
  }
}

function valueErrorIssue(
  field: string,
  input: unknown,
  message: string
): ValidationIssue {
  return {
    type: 'value_error',
    loc: ['body', field],
    msg: `Value error, ${message}`,
    input,
    ctx: { error: {} }
  }
}

function boolTypeIssue(field: string, input: unknown): ValidationIssue {
  return {
    type: 'bool_type',
    loc: ['body', field],
    msg: 'Input should be a valid boolean',
    input
  }
}

function invalid(issues: ValidationIssue[]): AssistantHttpError {
  return new AssistantHttpError(422, issues)
}

interface FieldSpec {
  required: boolean
  minLength?: number
  maxLength?: number
  nonBlank?: boolean
  strict?: boolean
}

/**
 * Validate and normalize one string field, collecting every issue the way
 * Pydantic does. Returns the value when valid.
 */
function checkString(
  body: Record<string, unknown>,
  field: string,
  spec: FieldSpec,
  issues: ValidationIssue[]
): string | null {
  if (!(field in body)) {
    if (spec.required) issues.push(missingIssue(field))
    return null
  }
  const value = body[field]
  if (typeof value !== 'string') {
    issues.push(stringTypeIssue(field, value))
    return null
  }
  if (spec.minLength !== undefined && value.length < spec.minLength) {
    issues.push(stringTooShortIssue(field, value, spec.minLength))
    return null
  }
  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    issues.push(stringTooLongIssue(field, value, spec.maxLength))
    return null
  }
  if (spec.nonBlank && value.trim() === '') {
    issues.push(valueErrorIssue(field, value, `${field} must not be blank`))
    return null
  }
  return value
}

/** Pydantic's lax bool coercion, used by `ConfirmRequest.approved`. */
function coerceLaxBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 0) return false
    if (value === 1) return true
    return undefined
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 't', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'f', 'no', 'n', 'off'].includes(normalized)) return false
  }
  return undefined
}

function checkBoolean(
  body: Record<string, unknown>,
  field: string,
  strict: boolean,
  issues: ValidationIssue[]
): boolean | null {
  if (!(field in body)) {
    issues.push(missingIssue(field))
    return null
  }
  const value = body[field]
  if (strict) {
    if (typeof value !== 'boolean') {
      issues.push(boolTypeIssue(field, value))
      return null
    }
    return value
  }
  const coerced = coerceLaxBool(value)
  if (coerced === undefined) {
    issues.push(boolTypeIssue(field, value))
    return null
  }
  return coerced
}

function parseJsonObject(raw: Buffer): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    throw invalid([
      {
        type: 'json_invalid',
        loc: ['body'],
        msg: 'JSON decode error',
        input: {}
      }
    ])
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid([
      {
        type: 'model_attributes_type',
        loc: ['body'],
        msg: 'Input should be a valid dictionary or object to extract fields from',
        input: parsed
      }
    ])
  }
  return parsed as Record<string, unknown>
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function htmlResponse(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html)
  })
  res.end(html)
}

function readRawBody(
  req: IncomingMessage,
  maxBytes: number
): Promise<{ data: Buffer; exceeded: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let exceeded = false
    req.on('data', (chunk: Buffer) => {
      if (exceeded) return
      size += chunk.length
      if (size > maxBytes) {
        exceeded = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ data: Buffer.concat(chunks), exceeded }))
    req.on('error', reject)
  })
}

export interface AssistantServerOptions {
  service: AssistantService
  host?: string
  port?: number
}

export class AssistantServer {
  private readonly service: AssistantService
  private readonly server: Server
  readonly address: BindAddress

  constructor(options: AssistantServerOptions) {
    this.service = options.service
    this.address = {
      host: options.host ?? DEFAULT_HOST,
      port: options.port ?? DEFAULT_PORT
    }
    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
  }

  /** The URL the server is actually reachable at once listening. */
  url(): string {
    const bound = this.server.address()
    if (bound !== null && typeof bound === 'object') {
      return `http://${this.address.host}:${bound.port}`
    }
    return `http://${this.address.host}:${this.address.port}`
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = (): void => {
        this.server.removeListener('error', onError)
        resolve()
      }
      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.address.port, this.address.host)
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server.listening) {
        resolve()
        return
      }
      this.server.close(() => resolve())
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await this.route(req, res)
    } catch (error) {
      if (error instanceof AssistantHttpError) {
        jsonResponse(res, error.status, { detail: error.detail })
        return
      }
      console.error('[assistant] unhandled request error', error)
      jsonResponse(res, 500, { detail: 'Internal Server Error' })
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    const path = new URL(req.url ?? '/', 'http://localhost').pathname

    if (method === 'GET' && path === '/health') {
      jsonResponse(res, 200, this.service.health())
      return
    }
    if (method === 'GET' && (path === '/callback' || path === '/auth/callback')) {
      htmlResponse(res, 200, CALLBACK_HTML)
      return
    }
    if (method === 'GET' && path === '/planner') {
      jsonResponse(res, 200, this.service.plannerStatus())
      return
    }
    if (method === 'GET' && path === '/mcp/status') {
      jsonResponse(res, 200, this.service.mcpStatus())
      return
    }
    if (method === 'POST' && path === '/act') {
      jsonResponse(res, 200, await this.service.act(await this.readAct(req)))
      return
    }
    if (method === 'POST' && path === '/act/confirm') {
      const { planId, approved } = await this.readConfirm(req)
      jsonResponse(res, 200, await this.service.confirm(planId, approved))
      return
    }
    if (method === 'POST' && path === '/act/undo') {
      jsonResponse(res, 200, await this.service.undo(await this.readUndo(req)))
      return
    }
    if (method === 'POST' && path === '/screen/ask') {
      jsonResponse(res, 200, await this.service.askScreen(await this.readScreenAsk(req)))
      return
    }
    if (method === 'POST' && path === '/transcribe') {
      jsonResponse(res, 200, await this.transcribe(req))
      return
    }

    jsonResponse(res, 404, { detail: 'Not Found' })
  }

  private async readAct(req: IncomingMessage): Promise<string> {
    const body = await this.readJson(req)
    const issues: ValidationIssue[] = []
    const transcript = checkString(
      body,
      'transcript',
      { required: true, minLength: 1, maxLength: 4000, nonBlank: true },
      issues
    )
    if (issues.length > 0) throw invalid(issues)
    return transcript as string
  }

  private async readConfirm(
    req: IncomingMessage
  ): Promise<{ planId: string; approved: boolean }> {
    const body = await this.readJson(req)
    const issues: ValidationIssue[] = []
    const planId = checkString(body, 'planId', { required: true, minLength: 1 }, issues)
    const approved = checkBoolean(body, 'approved', false, issues)
    if (issues.length > 0) throw invalid(issues)
    return { planId: planId as string, approved: approved as boolean }
  }

  private async readUndo(req: IncomingMessage): Promise<string> {
    const body = await this.readJson(req)
    const issues: ValidationIssue[] = []
    const planId = checkString(body, 'planId', { required: true, minLength: 1 }, issues)
    if (issues.length > 0) throw invalid(issues)
    return planId as string
  }

  private async readScreenAsk(req: IncomingMessage): Promise<{
    question: string
    imageBase64: string
    marked: boolean
  }> {
    const body = await this.readJson(req)
    const issues: ValidationIssue[] = []
    const question = checkString(
      body,
      'question',
      { required: true, minLength: 1, maxLength: 2000, nonBlank: true },
      issues
    )
    const image = checkString(
      body,
      'image',
      { required: true, minLength: 1 },
      issues
    )
    const marked = checkBoolean(body, 'marked', true, issues)
    if (issues.length > 0) throw invalid(issues)
    return {
      question: question as string,
      imageBase64: image as string,
      marked: marked as boolean
    }
  }

  private async transcribe(req: IncomingMessage): Promise<{
    text: string
    provider: string
    latencyMs: number
  }> {
    const contentType = req.headers['content-type'] ?? ''
    if (!isSupportedContentType(contentType)) {
      throw new AssistantHttpError(415, UNSUPPORTED_CONTENT_TYPE)
    }

    const { data, exceeded } = await readRawBody(req, MAX_AUDIO_BYTES)
    if (exceeded) {
      throw new AssistantHttpError(413, 'Audio body must be at most 10 MiB.')
    }
    if (data.length === 0) {
      throw new AssistantHttpError(400, 'Audio body is empty.')
    }

    return this.service.transcribe(data, contentType)
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const { data, exceeded } = await readRawBody(req, MAX_JSON_BODY_BYTES)
    if (exceeded) {
      throw new AssistantHttpError(413, 'Request body too large.')
    }
    return parseJsonObject(data)
  }
}
