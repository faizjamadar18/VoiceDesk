/**
 * Raw REST client for Composio v3.1.
 *
 * Composio is a hosted OAuth proxy: Kestrel sends the user's own API key, asks
 * for a session scoped to a few toolkits, and gets back an MCP endpoint it can
 * connect to like any other HTTP MCP server. This module deliberately speaks
 * the REST API directly instead of pulling in the Composio SDK, so the surface
 * stays small and every request stays easy to read and test.
 *
 * The client takes its `fetch` by injection: tests never touch the network.
 * The API key is only ever sent as the `x-api-key` header and is never written
 * into a log line, an error message, or an error object.
 */

import type { ComposioProviderSpec, ComposioSession } from './types'

export const DEFAULT_COMPOSIO_BASE_URL = 'https://backend.composio.dev/api/v3.1'
export const DEFAULT_TIMEOUT_MS = 20000

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** Base class for every Composio failure Kestrel surfaces to the UI. */
export class ComposioError extends Error {
  readonly status?: number

  constructor(message: string, options: { status?: number } = {}) {
    super(message)
    this.name = 'ComposioError'
    this.status = options.status
  }
}

/** The API key was missing, revoked, or not allowed to reach Composio. */
export class ComposioAuthError extends ComposioError {
  constructor(message: string) {
    super(message)
    this.name = 'ComposioAuthError'
  }
}

export interface ComposioClientOptions {
  apiKey: string
  fetch?: FetchLike
  baseUrl?: string
  timeoutMs?: number
}

/** One of a user's Composio connected accounts. */
export interface ComposioConnectedAccount {
  readonly id: string
  readonly toolkit: string
  readonly status: string
}

export class ComposioClient {
  private readonly apiKey: string
  private readonly fetchImpl: FetchLike
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: ComposioClientOptions) {
    this.apiKey = options.apiKey
    this.fetchImpl =
      options.fetch ?? ((url, init) => globalThis.fetch(url, init))
    this.baseUrl = (options.baseUrl ?? DEFAULT_COMPOSIO_BASE_URL).replace(
      /\/+$/,
      ''
    )
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /**
   * Create a session scoped to `providers`, returning its hosted MCP endpoint.
   *
   * The body mirrors Composio's tool-router contract: only the listed toolkits
   * and tools are enabled, single-execute only, and multi-execute, the
   * workbench, and hosted search are all turned off.
   */
  async createSession(input: {
    userId: string
    providers: readonly ComposioProviderSpec[]
  }): Promise<ComposioSession> {
    const toolkits = [
      ...new Set(input.providers.map((provider) => provider.toolkit))
    ]
    const tools: Record<string, { enable: string[] }> = {}
    for (const provider of input.providers) {
      tools[provider.toolkit] = { enable: [...provider.tools] }
    }

    const result = await this.request('POST', '/tool_router/session', {
      user_id: input.userId,
      toolkits: { enable: toolkits },
      tools,
      manage_connections: { enable: false },
      workbench: { enable: false },
      preload: { tools: 'all' },
      search: { enable: false },
      execute: { enable_multi_execute: false },
      mcp: true
    })

    const sessionId = stringField(result, 'session_id')
    if (!sessionId) {
      throw new ComposioError(
        'Composio did not return an MCP endpoint for the session.'
      )
    }

    // Composio's REST response carries only `mcp: { type, url }`; the SDK
    // adds the auth header client-side. If the create response omits the
    // block, the session GET returns the same one, so read it once.
    let endpoint = mcpEndpoint(result)
    if (endpoint === null) {
      endpoint = mcpEndpoint(
        await this.request(
          'GET',
          `/tool_router/session/${encodeURIComponent(sessionId)}`
        )
      )
    }
    if (endpoint === null) {
      throw new ComposioError(
        'Composio did not return an MCP endpoint for the session.'
      )
    }

    return {
      sessionId,
      mcpUrl: endpoint.url,
      // A missing header means "send the key that created the session", not
      // "no auth": that is what the SDK does and what the endpoint expects.
      mcpHeaders: endpoint.headers ?? { 'x-api-key': this.apiKey }
    }
  }

  /** Ask Composio for the OAuth link the user opens to connect a toolkit. */
  async createConnectLink(input: {
    sessionId: string
    toolkit: string
    callbackUrl?: string | null
  }): Promise<string> {
    const body: Record<string, unknown> = { toolkit: input.toolkit }
    const callbackUrl = input.callbackUrl?.trim()
    if (callbackUrl) body.callback_url = callbackUrl

    const result = await this.request(
      'POST',
      `/tool_router/session/${encodeURIComponent(input.sessionId)}/link`,
      body
    )

    const redirectUrl = stringField(result, 'redirect_url')
    if (!redirectUrl) {
      throw new ComposioError('Composio did not return a connect link.')
    }
    return redirectUrl
  }

  /** The toolkit slugs the session currently has a live connection for. */
  async listConnectedToolkits(sessionId: string): Promise<string[]> {
    const result = await this.request(
      'GET',
      `/tool_router/session/${encodeURIComponent(sessionId)}/toolkits?is_connected=true`
    )

    const slugs: string[] = []
    const seen = new Set<string>()
    const items = result.items
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!isRecord(item)) continue
        const slug = stringField(item, 'slug')?.toLowerCase()
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        slugs.push(slug)
      }
    }
    return slugs
  }

  /** The connected accounts for one user and toolkit. */
  async listConnectedAccounts(input: {
    userId: string
    toolkit: string
  }): Promise<ComposioConnectedAccount[]> {
    const result = await this.request(
      'GET',
      `/connected_accounts?user_ids=${encodeURIComponent(input.userId)}&toolkit_slugs=${encodeURIComponent(input.toolkit)}`
    )

    const accounts: ComposioConnectedAccount[] = []
    const items = result.items
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!isRecord(item)) continue
        const id = stringField(item, 'id')
        if (!id) continue
        const toolkit = isRecord(item.toolkit)
          ? stringField(item.toolkit, 'slug') ?? ''
          : ''
        accounts.push({
          id,
          toolkit,
          status: stringField(item, 'status') ?? ''
        })
      }
    }
    return accounts
  }

  /** Delete one connected account, revoking its OAuth grant first. */
  async deleteConnectedAccount(accountId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/connected_accounts/${encodeURIComponent(accountId)}?revoke_on_delete=true`,
      undefined,
      { allowNotFound: true }
    )
  }

  /** Tear down a session. A session that is already gone is not an error. */
  async deleteSession(sessionId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/tool_router/session/${encodeURIComponent(sessionId)}`,
      undefined,
      { allowNotFound: true }
    )
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    options: { allowNotFound?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'x-api-key': this.apiKey }
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs)
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init)
    } catch (error) {
      throw new ComposioError(
        `Could not reach Composio (${errorName(error)}).`
      )
    }

    if (options.allowNotFound && response.status === 404) return {}
    if (!response.ok) await raiseForStatus(response)

    const payload = await parseJson(response)
    return payload === null ? {} : payload
  }
}

/** Map an unsuccessful response to the right error type and message. */
async function raiseForStatus(response: Response): Promise<never> {
  const status = response.status
  if (status === 401 || status === 403) {
    throw new ComposioAuthError(
      'Composio rejected the API key. Check the key in Settings.'
    )
  }
  if (status === 429) {
    throw new ComposioError('Composio rate limit reached. Try again shortly.', {
      status: 429
    })
  }
  throw new ComposioError(
    `Composio request failed (HTTP ${status}): ${await bodySnippet(response)}`
  )
}

/** Read a JSON object body, or `null` when the body is empty or malformed. */
async function parseJson(
  response: Response
): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await response.json()
    return isRecord(data) ? data : null
  } catch {
    return null
  }
}

async function bodySnippet(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200)
  } catch {
    return ''
  }
}

function stringField(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface McpEndpoint {
  readonly url: string
  /** `null` when the response omitted headers or they were not all strings. */
  readonly headers: Record<string, string> | null
}

/** Read the MCP block out of a session response, or `null` when unusable. */
function mcpEndpoint(record: Record<string, unknown>): McpEndpoint | null {
  const mcp = isRecord(record.mcp) ? record.mcp : null
  if (mcp === null) return null
  const url = stringField(mcp, 'url')
  if (!url) return null
  return { url, headers: stringRecord(mcp.headers) }
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return null
    result[key] = item
  }
  return result
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name
  return 'Error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
