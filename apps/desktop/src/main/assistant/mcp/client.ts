/**
 * Transport clients for Kestrel's MCP (Model Context Protocol) integration.
 *
 * Two transports are supported: `stdio` spawns a server process and speaks
 * newline-delimited JSON-RPC over its standard streams, while `http` speaks
 * Streamable HTTP (plain JSON or server-sent events). Both share the JSON-RPC
 * handshake, pagination, and result-flattening behavior in `McpClientBase`.
 *
 * The public seam is `makeClient`, plus the concrete clients so tests can
 * inject small timeouts or a fetch implementation.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import {
  McpConnectionError,
  type McpCallResult,
  type McpClient,
  type McpServerConfig,
  type McpTool
} from './types'

export const PROTOCOL_VERSION = '2025-06-18'
export const CLIENT_INFO = { name: 'kestrel', version: '0.1.0' } as const
export const DEFAULT_TIMEOUT_SECONDS = 30
export const DEFAULT_INIT_TIMEOUT_SECONDS = 15

const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  required: []
}
const STREAM_ENDED = Symbol('stream-ended')

export interface McpLogger {
  debug(message: string, ...args: unknown[]): void
}

const defaultLogger: McpLogger = {
  debug: (message, ...args) => console.debug(message, ...args)
}

export interface McpClientOptions {
  /** Seconds to wait for an ordinary request. */
  timeout?: number
  /** Seconds to wait for the initialize handshake. */
  initTimeout?: number
  logger?: McpLogger
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface HttpMcpClientOptions extends McpClientOptions {
  fetch?: FetchLike
}

export function makeClient(config: McpServerConfig): McpClient {
  const transport: string = config.transport
  if (transport === 'stdio') return new StdioMcpClient(config)
  if (transport === 'http') return new HttpMcpClient(config)
  throw new McpConnectionError(
    `MCP server ${repr(config.name)} uses unsupported transport ${repr(transport)}.`
  )
}

export type CommandLookup = (command: string) => string | null

/**
 * Resolve a bare command name to a runnable path.
 *
 * On Windows `where.exe` finds `npx.CMD` because `shell: false` cannot execute
 * the `npx.ps1` wrapper that PowerShell would prefer. Commands that are
 * already paths, or that cannot be found, are returned unchanged so the
 * failure surfaces as a normal spawn error.
 */
export function resolveCommand(
  command: string,
  lookup: CommandLookup = defaultCommandLookup
): string {
  const hasSeparator =
    command.includes(path.sep) ||
    (process.platform === 'win32' && command.includes('/'))
  if (!command || hasSeparator || path.isAbsolute(command)) return command
  return lookup(command) ?? command
}

function defaultCommandLookup(command: string): string | null {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  try {
    const output = execFileSync(locator, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
    const matches = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    return preferredWindowsMatch(matches) ?? null
  } catch {
    return null
  }
}

/**
 * `where.exe` lists an extensionless shim before `npx.cmd`; prefer a file that
 * carries one of Windows' executable extensions (mirroring `shutil.which`).
 */
function preferredWindowsMatch(matches: string[]): string | null {
  if (matches.length === 0) return null
  if (process.platform !== 'win32') return matches[0]
  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
    .map((extension) => extension.toLowerCase())
  return (
    matches.find((match) =>
      extensions.includes(path.extname(match).toLowerCase())
    ) ?? matches[0]
  )
}

const WINDOWS_SHELL_EXTENSIONS: ReadonlySet<string> = new Set(['.cmd', '.bat'])

/** True when `command` is a Windows batch script that needs `cmd.exe`. */
export function isWindowsShellScript(command: string): boolean {
  return (
    process.platform === 'win32' &&
    WINDOWS_SHELL_EXTENSIONS.has(path.extname(command).toLowerCase())
  )
}

/**
 * Quote one token for a `cmd.exe` command line.
 *
 * These tokens come from operator-owned MCP config, never from user text, so a
 * defensive quote is enough: wrap anything that carries whitespace or a shell
 * metacharacter. `cmd.exe` expands `%VAR%`, so a literal `%` in an argument
 * would be expanded; MCP configs pass secrets through the environment instead.
 */
export function quoteWindowsArg(value: string): string {
  if (value === '') return '""'
  if (!/[\s"&|<>^()%!]/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

export interface SpawnTarget {
  file: string
  args: string[]
  /** `cmd.exe` receives an already-quoted line, so libuv must not re-quote. */
  verbatim: boolean
}

/**
 * Build the actual spawn target for a resolved command.
 *
 * Modern Node and Electron refuse to spawn `.cmd`/`.bat` with `shell: false`
 * (`EINVAL`), and the bundled MCP config launches `npx`, which resolves to
 * `npx.cmd`. This mirrors Node's own shell handling: run batch scripts through
 * `%ComSpec% /d /s /c "<quoted command line>"` with `windowsVerbatimArguments`.
 * Executables keep the plain, shell-free spawn.
 */
export function windowsSpawnTarget(
  command: string,
  args: readonly string[]
): SpawnTarget {
  if (!isWindowsShellScript(command)) {
    return { file: command, args: [...args], verbatim: false }
  }
  const comspec = (process.env.ComSpec ?? '').trim() || 'cmd.exe'
  const line = [command, ...args].map(quoteWindowsArg).join(' ')
  return { file: comspec, args: ['/d', '/s', '/c', `"${line}"`], verbatim: true }
}

/** JSON-RPC behavior shared by every MCP transport. */
export abstract class McpClientBase implements McpClient {
  readonly name: string
  protected readonly config: McpServerConfig
  protected readonly timeout: number
  protected readonly initTimeout: number
  protected readonly logger: McpLogger
  private nextId = 0
  private initialized = false
  private closed = false

  constructor(config: McpServerConfig, options: McpClientOptions = {}) {
    this.config = config
    this.name = config.name
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_SECONDS
    this.initTimeout = options.initTimeout ?? DEFAULT_INIT_TIMEOUT_SECONDS
    this.logger = options.logger ?? defaultLogger
  }

  // -- public protocol --------------------------------------------------

  async listTools(): Promise<McpTool[]> {
    await this.ensureInitialized()

    const tools: McpTool[] = []
    let cursor: string | null = null
    for (;;) {
      const params: Record<string, unknown> =
        cursor === null ? {} : { cursor }
      const result = await this.request('tools/list', params, this.timeout)
      const entries = result.tools
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (!isRecord(entry)) continue
          tools.push(toolFromEntry(entry))
        }
      }
      const nextCursor = result.nextCursor
      if (typeof nextCursor !== 'string' || nextCursor.length === 0) break
      cursor = nextCursor
    }
    return tools
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    await this.ensureInitialized()

    const result = await this.request(
      'tools/call',
      { name, arguments: args },
      this.timeout
    )
    return {
      text: flattenText(result.content),
      isError: truthy(result.isError)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.closeTransport()
    } catch {
      // close must never raise
    }
  }

  // -- shared helpers ---------------------------------------------------

  protected get isClosed(): boolean {
    return this.closed
  }

  protected checkOpen(): void {
    if (this.closed) {
      throw new McpConnectionError(`MCP server ${repr(this.name)} is closed.`)
    }
  }

  protected nextRequestId(): number {
    this.nextId += 1
    return this.nextId
  }

  protected result(message: unknown, method: string): Record<string, unknown> {
    if (!isRecord(message)) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} sent a malformed response to ` +
          `${repr(method)}.`
      )
    }
    const error = message.error
    if (error !== undefined && error !== null) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} returned an error for ${repr(method)}: ` +
          `${jsonRpcErrorMessage(error)}`
      )
    }
    const result = message.result
    return isRecord(result) ? result : {}
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    this.checkOpen()
    await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { ...CLIENT_INFO }
      },
      this.initTimeout
    )
    await this.sendNotification('notifications/initialized')
    this.initialized = true
  }

  protected abstract request(
    method: string,
    params: Record<string, unknown>,
    timeout: number
  ): Promise<Record<string, unknown>>

  protected abstract sendNotification(method: string): Promise<void>

  protected abstract closeTransport(): Promise<void>
}

interface Waiter {
  resolve(value: unknown): void
  reject(error: unknown): void
  timer?: ReturnType<typeof setTimeout>
}

/** FIFO bridge between asynchronous stream readers and request waiters. */
class MessageQueue {
  private readonly buffered: unknown[] = []
  private readonly waiters: Waiter[] = []

  push(value: unknown): void {
    const waiter = this.waiters.shift()
    if (waiter !== undefined) {
      if (waiter.timer !== undefined) clearTimeout(waiter.timer)
      waiter.resolve(value)
      return
    }
    this.buffered.push(value)
  }

  take(timeoutMs: number, timeoutError: () => Error): Promise<unknown> {
    const buffered = this.buffered.shift()
    if (buffered !== undefined) return Promise.resolve(buffered)

    return new Promise<unknown>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject }
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(timeoutError())
      }, Math.max(0, timeoutMs))
      this.waiters.push(waiter)
    })
  }
}

/** MCP client that talks to a child process over stdin/stdout. */
export class StdioMcpClient extends McpClientBase {
  private readonly messages = new MessageQueue()
  private child: ChildProcess | null = null
  private streamFinished = false

  constructor(config: McpServerConfig, options: McpClientOptions = {}) {
    super(config, options)
    if (!config.command) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} has no command configured.`
      )
    }

    this.child = this.spawn()
    this.readStdout()
    this.readStderr()
  }

  private spawn(): ChildProcess {
    const command = this.config.command
    if (!command) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} has no command configured.`
      )
    }
    const resolved = resolveCommand(command)
    const target = windowsSpawnTarget(resolved, this.config.args)
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.config.env }
    let child: ChildProcess
    try {
      child = spawn(target.file, target.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.cwd ?? undefined,
        env,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: target.verbatim
      })
    } catch (error) {
      throw new McpConnectionError(
        `Could not start MCP server ${repr(this.name)}: ` +
          `${errorMessageValue(error)}`
      )
    }

    child.on('error', (error: Error) => {
      this.messages.push(
        new McpConnectionError(
          `Could not start MCP server ${repr(this.name)}: ${error.message}`
        )
      )
      this.finishStream()
    })
    child.stdin?.on('error', (error: Error) => {
      this.messages.push(
        new McpConnectionError(
          `MCP server ${repr(this.name)} is no longer accepting input: ` +
            `${error.message}`
        )
      )
    })
    return child
  }

  protected async request(
    method: string,
    params: Record<string, unknown>,
    timeout: number
  ): Promise<Record<string, unknown>> {
    this.checkOpen()
    const requestId = this.nextRequestId()
    this.sendRaw({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    })

    const deadline = Date.now() + timeout * 1000
    for (;;) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new McpConnectionError(
          `MCP server ${repr(this.name)} timed out waiting for ` +
            `${repr(method)}.`
        )
      }
      const message = await this.messages.take(remaining, () =>
        new McpConnectionError(
          `MCP server ${repr(this.name)} timed out waiting for ` +
            `${repr(method)}.`
        )
      )

      if (message === STREAM_ENDED) {
        // Leave the sentinel in place so later waits also fail fast.
        this.messages.push(STREAM_ENDED)
        throw new McpConnectionError(
          `MCP server ${repr(this.name)} exited before responding to ` +
            `${repr(method)}.`
        )
      }
      if (message instanceof Error) throw message
      if (!isRecord(message)) continue
      if (Object.hasOwn(message, 'method')) {
        if (Object.hasOwn(message, 'id')) {
          this.replyMethodNotFound(message.id)
        }
        continue
      }
      if (message.id !== requestId) continue
      return this.result(message, method)
    }
  }

  protected async sendNotification(method: string): Promise<void> {
    this.sendRaw({ jsonrpc: '2.0', method })
  }

  protected async closeTransport(): Promise<void> {
    const child = this.child
    this.child = null
    if (child === null) return
    try {
      child.stdin?.end()
    } catch {
      // The child may already be gone.
    }
    if (hasExited(child)) return
    try {
      child.kill('SIGTERM')
    } catch {
      // Fall through to the kill below.
    }
    if (await waitForExit(child, 2000)) return
    try {
      child.kill('SIGKILL')
    } catch {
      // Nothing left to terminate.
    }
    await waitForExit(child, 1000)
  }

  private sendRaw(message: Record<string, unknown>): void {
    if (this.isClosed || this.child === null) {
      throw new McpConnectionError(`MCP server ${repr(this.name)} is closed.`)
    }
    const stdin = this.child.stdin
    if (stdin === null) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} has no input stream.`
      )
    }
    try {
      stdin.write(`${JSON.stringify(message)}\n`)
    } catch (error) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} is no longer accepting input: ` +
          `${errorMessageValue(error)}`
      )
    }
  }

  private replyMethodNotFound(requestId: unknown): void {
    try {
      this.sendRaw({
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32601, message: 'Method not found' }
      })
    } catch (error) {
      if (!(error instanceof McpConnectionError)) throw error
    }
  }

  private readStdout(): void {
    const stream = this.child?.stdout
    if (!stream) {
      this.finishStream()
      return
    }
    const lines = createInterface({ input: stream, crlfDelay: Infinity })
    lines.on('line', (line: string) => {
      const stripped = line.trim()
      if (!stripped) return
      try {
        this.messages.push(JSON.parse(stripped))
      } catch {
        // Ignore malformed lines, matching the Python reader.
      }
    })
    lines.on('close', () => this.finishStream())
    stream.on('error', () => this.finishStream())
  }

  private readStderr(): void {
    const stream = this.child?.stderr
    if (!stream) return
    const lines = createInterface({ input: stream, crlfDelay: Infinity })
    lines.on('line', (line: string) => {
      const text = line.trimEnd()
      if (text) this.logger.debug(`[${this.name}] ${text}`)
    })
    lines.on('error', () => {
      // stderr is diagnostics only.
    })
  }

  private finishStream(): void {
    if (this.streamFinished) return
    this.streamFinished = true
    this.messages.push(STREAM_ENDED)
  }
}

/** MCP client for a Streamable HTTP endpoint. */
export class HttpMcpClient extends McpClientBase {
  private readonly url: string
  private readonly fetchImpl: FetchLike
  private sessionId: string | null = null

  constructor(config: McpServerConfig, options: HttpMcpClientOptions = {}) {
    super(config, options)
    if (!config.url) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} has no URL configured.`
      )
    }
    this.url = config.url
    this.fetchImpl =
      options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  }

  protected async request(
    method: string,
    params: Record<string, unknown>,
    timeout: number
  ): Promise<Record<string, unknown>> {
    this.checkOpen()
    const requestId = this.nextRequestId()
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    }

    let response: Response
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.requestHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(1, Math.round(timeout * 1000)))
      })
    } catch (error) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} request failed: ` +
          `${errorMessageValue(error)}`
      )
    }

    if (response.status < 200 || response.status >= 300) {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} returned HTTP ${response.status}: ` +
          `${await responseSnippet(response)}`
      )
    }

    if (method === 'initialize') this.captureSessionId(response)

    return this.result(
      await this.parseMessage(response, requestId, method),
      method
    )
  }

  protected async sendNotification(method: string): Promise<void> {
    if (this.isClosed) return
    const payload = { jsonrpc: '2.0', method }
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.requestHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(
          Math.max(1, Math.round(this.timeout * 1000))
        )
      })
      this.captureSessionId(response)
      await response.text().catch(() => '')
    } catch {
      // The initialized notification is best-effort.
    }
  }

  protected async closeTransport(): Promise<void> {
    // fetch owns no persistent client; nothing to release.
  }

  private requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    }
    Object.assign(headers, this.config.headers)
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId
    return headers
  }

  private captureSessionId(response: Response): void {
    const sessionId = response.headers.get('Mcp-Session-Id')
    if (sessionId) this.sessionId = sessionId
  }

  private async parseMessage(
    response: Response,
    requestId: number,
    method: string
  ): Promise<unknown> {
    const contentType = (
      response.headers.get('content-type') ?? ''
    ).toLowerCase()
    if (contentType.includes('text/event-stream')) {
      return this.parseSse(await response.text(), requestId, method)
    }
    try {
      return await response.json()
    } catch {
      throw new McpConnectionError(
        `MCP server ${repr(this.name)} sent an invalid JSON response to ` +
          `${repr(method)}.`
      )
    }
  }

  private parseSse(text: string, requestId: number, method: string): unknown {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice('data:'.length).trim()
      if (!payload || payload === '[DONE]') continue

      let message: unknown
      try {
        message = JSON.parse(payload)
      } catch {
        continue
      }
      if (!isRecord(message)) continue
      if (Object.hasOwn(message, 'method')) {
        // A notification or server-initiated request; not our response.
        continue
      }
      if (message.id === requestId) return message
    }
    throw new McpConnectionError(
      `MCP server ${repr(this.name)} did not send a response to ${repr(method)}.`
    )
  }
}

function toolFromEntry(entry: Record<string, unknown>): McpTool {
  const name = entry.name
  const rawDescription = entry.description
  const schema = entry.inputSchema
  const annotations = isRecord(entry.annotations) ? entry.annotations : {}
  return {
    name: name === undefined || name === null ? '' : pythonString(name),
    description: truthy(rawDescription) ? pythonString(rawDescription) : '',
    inputSchema: isRecord(schema) ? schema : { ...DEFAULT_INPUT_SCHEMA },
    readOnly: Object.hasOwn(annotations, 'readOnlyHint')
      ? truthy(annotations.readOnlyHint)
      : true
  }
}

function flattenText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type !== 'text') continue
    const text = block.text
    if (typeof text === 'string') parts.push(text)
  }
  return parts.join('\n')
}

function errorMessageValue(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Python's `_error_message`: use a JSON-RPC error's message when present. */
function jsonRpcErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const message = error.message
    if (message !== undefined && message !== null) return pythonString(message)
  }
  return pythonString(error)
}

function responseSnippet(response: Response): Promise<string> {
  return response
    .text()
    .then((text) => text.slice(0, 200))
    .catch(() => '<unreadable body>')
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (exited: boolean): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      child.removeListener('exit', onExit)
      resolve(exited)
    }
    const onExit = (): void => finish(true)
    timer = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Python `repr()` for the short strings used in error messages. */
function repr(value: string): string {
  if (value.includes("'") && !value.includes('"')) return `"${value}"`
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Python truthiness for values that can appear in JSON. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (value === 0 || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/** Python's `str()` for JSON values. */
function pythonString(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonRepr(item)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, item]) => `'${key}': ${pythonRepr(item)}`
    )
    return `{${entries.join(', ')}}`
  }
  return String(value)
}

function pythonRepr(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  return pythonString(value)
}
