/**
 * Composio lifecycle integration.
 *
 * One class owns everything Composio needs at runtime: the user's API key,
 * the Composio session, the hosted MCP connection, and the voice tools the
 * connected providers contribute. Nothing outside this file needs to know
 * Composio's shape.
 *
 * The class never throws out of a public method: a missing key, a revoked key,
 * or a Composio outage all surface through `status().error` or an
 * `{ ok: false }` result, so a broken integration can never take Kestrel down.
 * The API key is only ever handed to the injected client factory; it is never
 * logged and never placed in any message.
 *
 * Every network seam is injected (`clientFactory`, `mcpClientFactory`,
 * `sleep`), so unit tests never touch the network, Electron, or the real
 * filesystem beyond the key store's temp file.
 */

import { makeClient } from '../mcp/client'
import type { McpClient, McpServerConfig, McpTool } from '../mcp/types'
import type { Tool } from '../types'
import { createCalendarTools } from './calendar'
import { ComposioAuthError, ComposioClient } from './client'
import { createGmailTools } from './gmail'
import type { ComposioKeyStore } from './key'
import { keyProblem } from './key'
import { COMPOSIO_PROVIDERS } from './providers'
import type {
  ComposioProviderId,
  ComposioProviderSpec,
  ComposioProviderStatus,
  ComposioSession,
  ComposioStatus
} from './types'

export const DEFAULT_CALLBACK_URL = 'voicedesk://composio/callback'
export const CONNECT_POLL_INTERVAL_MS = 2000
export const CONNECT_POLL_ATTEMPTS = 60

/** Outcome of asking Composio for a provider's OAuth link. */
export interface ComposioConnectResult {
  readonly ok: boolean
  readonly url: string | null
  readonly message: string
}

export interface ComposioIntegrationOptions {
  keyStore: ComposioKeyStore
  /** Stable per-user id passed to Composio. */
  userId: string
  /** Injectable seams: tests must never hit the network. */
  clientFactory?: (apiKey: string) => ComposioClient
  mcpClientFactory?: (config: McpServerConfig) => McpClient
  providers?: readonly ComposioProviderSpec[]
  callbackUrl?: string | null
  now?: () => Date
  timezone?: () => string
  sleep?: (ms: number) => Promise<void>
  /** Called after every state change so a host can push status to the UI. */
  onStatus?: (status: ComposioStatus) => void
}

type ToolFactory = (options: {
  callTool: (
    slug: string,
    args: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean }>
  now: () => Date
  timezone: () => string
}) => Tool[]

/**
 * The only place a provider is wired to its voice tools. Adding a provider
 * means adding an entry to `COMPOSIO_PROVIDERS` and, when its factory exists,
 * one line here.
 */
const TOOL_FACTORIES: Partial<Record<ComposioProviderId, ToolFactory>> = {
  googlecalendar: createCalendarTools,
  gmail: createGmailTools
}

const UNSUPPORTED_MESSAGE = 'That app is not supported yet.'
const CONNECT_MESSAGE =
  'Approve access in your browser, then come back here.'
const NO_KEY_MESSAGE = 'Add your Composio API key first.'

export class ComposioIntegration {
  private readonly keyStore: ComposioKeyStore
  private readonly userId: string
  private readonly clientFactory: (apiKey: string) => ComposioClient
  private readonly mcpClientFactory: (config: McpServerConfig) => McpClient
  private readonly providerSpecs: readonly ComposioProviderSpec[]
  private readonly callbackUrl: string | null
  private readonly now: () => Date
  private readonly timezone: () => string
  private readonly sleep: (ms: number) => Promise<void>
  private readonly onStatus: ((status: ComposioStatus) => void) | undefined

  private client: ComposioClient | null = null
  private mcpClient: McpClient | null = null
  private session: ComposioSession | null = null
  private advertised: McpTool[] | null = null
  private registered: Tool[] = []
  private providerStatuses: ComposioProviderStatus[] = []
  private hasKey = false
  private keySource: 'stored' | 'env' | null = null
  private error: string | null = null

  constructor(options: ComposioIntegrationOptions) {
    this.keyStore = options.keyStore
    this.userId = options.userId
    this.clientFactory =
      options.clientFactory ?? ((apiKey) => new ComposioClient({ apiKey }))
    this.mcpClientFactory = options.mcpClientFactory ?? makeClient
    this.providerSpecs = options.providers ?? COMPOSIO_PROVIDERS
    this.callbackUrl =
      options.callbackUrl === undefined
        ? DEFAULT_CALLBACK_URL
        : options.callbackUrl
    this.now = options.now ?? (() => new Date())
    this.timezone = options.timezone ?? hostTimezone
    this.sleep = options.sleep ?? defaultSleep
    this.onStatus = options.onStatus
    this.resetProviders()
  }

  /** Every voice tool the connected providers contribute. */
  get tools(): Tool[] {
    return [...this.registered]
  }

  /** The current state, safe to push straight to the UI. */
  status(): ComposioStatus {
    return {
      hasKey: this.hasKey,
      keySource: this.keySource,
      sessionId: this.session?.sessionId ?? null,
      providers: this.providerStatuses.map((provider) => ({ ...provider })),
      error: this.error
    }
  }

  /** Read the key and bring the session and tools up. Idempotent. */
  async initialize(): Promise<ComposioStatus> {
    try {
      const { key, source } = this.keyStore.read()
      this.keySource = source

      if (!key) {
        this.hasKey = false
        this.error = null
        this.registered = []
        this.session = null
        await this.closeMcp()
        this.resetProviders()
        this.notify()
        return this.status()
      }

      this.hasKey = true

      // A consumer key can never work. Say so plainly and make no request.
      const problem = keyProblem(key)
      if (problem !== null) {
        this.error = problem
        this.session = null
        this.registered = []
        await this.closeMcp()
        this.resetProviders()
        this.notify()
        return this.status()
      }

      // Already initialized: never create a second session.
      if (this.session !== null) {
        this.notify()
        return this.status()
      }

      this.client = this.clientFactory(key)
      let session: ComposioSession
      try {
        session = await this.client.createSession({
          userId: this.userId,
          providers: this.providerSpecs
        })
      } catch (error) {
        this.error = sessionErrorMessage(error)
        this.session = null
        this.registered = []
        await this.closeMcp()
        this.resetProviders()
        this.notify()
        return this.status()
      }

      this.session = session
      this.error = null
      await this.sync()
      return this.status()
    } catch (error) {
      this.error = errorMessage(error)
      this.notify()
      return this.status()
    }
  }

  /** Re-check which toolkits are connected and rebuild the tools. */
  async refresh(): Promise<ComposioStatus> {
    // A fresh process has no session, and only `initialize()` reads the key and
    // creates one, so refresh must delegate or a stored key never comes up.
    if (this.session === null) return this.initialize()

    try {
      await this.sync()
      return this.status()
    } catch (error) {
      this.error = errorMessage(error)
      this.notify()
      return this.status()
    }
  }

  /** Persist `key`, drop the old session, and initialize afresh. */
  async setKey(key: string): Promise<ComposioStatus> {
    try {
      this.keyStore.save(key)
    } catch (error) {
      this.error = errorMessage(error)
      this.notify()
      return this.status()
    }

    this.session = null
    this.registered = []
    await this.closeMcp()
    this.resetProviders()
    this.error = null
    return this.initialize()
  }

  /** Best-effort teardown, then forget the stored key. */
  async clearKey(): Promise<ComposioStatus> {
    try {
      const client = this.client
      const session = this.session
      if (client !== null && session !== null) {
        try {
          await client.deleteSession(session.sessionId)
        } catch {
          // Best-effort: a failed teardown must not block clearing the key.
        }
      }

      this.session = null
      this.client = null
      this.registered = []
      await this.closeMcp()
      this.keyStore.clear()
      this.resetProviders()
      this.error = null

      const { key, source } = this.keyStore.read()
      this.hasKey = key !== null
      this.keySource = source
      this.notify()
      return this.status()
    } catch (error) {
      this.error = errorMessage(error)
      this.notify()
      return this.status()
    }
  }

  /** Ask Composio for the OAuth link that connects `providerId`. */
  async connect(
    providerId: ComposioProviderId
  ): Promise<ComposioConnectResult> {
    try {
      const provider =
        this.providerSpecs.find((spec) => spec.id === providerId) ?? null
      if (provider === null || TOOL_FACTORIES[providerId] === undefined) {
        return { ok: false, url: null, message: UNSUPPORTED_MESSAGE }
      }

      if (this.session === null || this.client === null) {
        await this.initialize()
      }

      const session = this.session
      const client = this.client
      if (session === null || client === null) {
        return {
          ok: false,
          url: null,
          message: this.error ?? NO_KEY_MESSAGE
        }
      }

      try {
        const url = await client.createConnectLink({
          sessionId: session.sessionId,
          toolkit: provider.toolkit.toLowerCase(),
          callbackUrl: this.callbackUrl
        })
        return { ok: true, url, message: CONNECT_MESSAGE }
      } catch (error) {
        return { ok: false, url: null, message: errorMessage(error) }
      }
    } catch (error) {
      return { ok: false, url: null, message: errorMessage(error) }
    }
  }

  /**
   * Poll until Composio reports `providerId` connected, or the attempt budget
   * runs out. Never throws.
   */
  async waitForConnection(providerId: ComposioProviderId): Promise<boolean> {
    try {
      const provider =
        this.providerSpecs.find((spec) => spec.id === providerId) ?? null
      if (provider === null) return false
      const slug = provider.toolkit.toLowerCase()

      for (let attempt = 0; attempt < CONNECT_POLL_ATTEMPTS; attempt += 1) {
        await this.sleep(CONNECT_POLL_INTERVAL_MS)

        const session = this.session
        const client = this.client
        if (session === null || client === null) return false

        let connected: string[]
        try {
          connected = await client.listConnectedToolkits(session.sessionId)
        } catch {
          return false
        }

        if (connected.some((name) => name.toLowerCase() === slug)) {
          await this.sync()
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }

  /** Release the MCP connection. Idempotent, never throws. */
  async close(): Promise<void> {
    await this.closeMcp()
  }

  /**
   * Re-resolve which providers are connected and rebuild the tool set.
   *
   * The MCP client is only created once at least one toolkit is connected, and
   * its advertised tool list is cached for the session's lifetime so a refresh
   * does not re-handshake.
   */
  private async sync(): Promise<void> {
    const session = this.session
    const client = this.client
    if (session === null || client === null) {
      this.registered = []
      await this.closeMcp()
      this.resetProviders()
      this.notify()
      return
    }

    let connected: Set<string>
    try {
      const slugs = await client.listConnectedToolkits(session.sessionId)
      connected = new Set(slugs.map((slug) => slug.toLowerCase()))
    } catch (error) {
      const message = errorMessage(error)
      this.error = message
      this.registered = []
      this.providerStatuses = this.providerSpecs.map((provider) =>
        failedStatus(provider, message)
      )
      this.notify()
      return
    }

    const anyConnected = this.providerSpecs.some((provider) =>
      connected.has(provider.toolkit.toLowerCase())
    )
    let advertised: McpTool[] | null = null
    let advertisedError: string | null = null
    if (anyConnected) {
      try {
        advertised = await this.advertisedTools()
      } catch (error) {
        advertisedError = errorMessage(error)
      }
    }

    const tools: Tool[] = []
    const taken = new Set<string>()
    const statuses: ComposioProviderStatus[] = []

    for (const provider of this.providerSpecs) {
      const base = { id: provider.id, label: provider.label }

      if (!connected.has(provider.toolkit.toLowerCase())) {
        statuses.push({ ...base, connected: false, toolCount: 0, error: null })
        continue
      }

      if (advertised === null) {
        statuses.push({
          ...base,
          connected: false,
          toolCount: 0,
          error: advertisedError ?? 'The Composio connection is not ready.'
        })
        continue
      }

      const factory = TOOL_FACTORIES[provider.id]
      if (factory === undefined) {
        statuses.push({
          ...base,
          connected: false,
          toolCount: 0,
          error: UNSUPPORTED_MESSAGE
        })
        continue
      }

      const advertisedNames = advertised.map((tool) => tool.name)
      const resolved = new Map<string, string>()
      let missing: string | null = null
      for (const slug of provider.tools) {
        const advertisedName = resolveAdvertised(
          slug,
          provider.toolkit,
          advertisedNames
        )
        if (advertisedName === null) {
          missing = slug
          break
        }
        resolved.set(slug, advertisedName)
      }
      if (missing !== null) {
        statuses.push({
          ...base,
          connected: false,
          toolCount: 0,
          error: `Composio did not advertise ${missing}.`
        })
        continue
      }

      const mcpClient = this.mcpClient
      if (mcpClient === null) {
        statuses.push({
          ...base,
          connected: false,
          toolCount: 0,
          error: advertisedError ?? 'The Composio connection is not ready.'
        })
        continue
      }

      const built = factory({
        callTool: async (slug, args) => {
          const name = resolved.get(slug) ?? slug
          const result = await mcpClient.callTool(name, args)
          return { text: result.text, isError: result.isError }
        },
        now: this.now,
        timezone: this.timezone
      })

      const duplicate = firstDuplicate(
        built.map((tool) => tool.spec.name),
        taken
      )
      if (duplicate !== null) {
        statuses.push({
          ...base,
          connected: false,
          toolCount: 0,
          error: `Duplicate tool name ${duplicate}.`
        })
        continue
      }

      for (const tool of built) taken.add(tool.spec.name)
      tools.push(...built)
      statuses.push({
        ...base,
        connected: true,
        toolCount: built.length,
        error: null
      })
    }

    this.providerStatuses = statuses
    this.registered = tools
    this.error = advertisedError
    this.notify()
  }

  /** The advertised tool list, fetched once per session. */
  private async advertisedTools(): Promise<McpTool[]> {
    if (this.advertised !== null) return this.advertised

    const session = this.session
    if (session === null) throw new Error('No Composio session.')

    if (this.mcpClient === null) {
      this.mcpClient = this.mcpClientFactory({
        name: 'composio',
        transport: 'http',
        url: session.mcpUrl,
        headers: session.mcpHeaders,
        args: [],
        env: {},
        enabled: true,
        autoApprove: false,
        readOnly: false,
        writeTools: new Set(),
        tools: null
      })
    }

    const tools = await this.mcpClient.listTools()
    this.advertised = tools
    return tools
  }

  /** Close the MCP client, swallowing errors. Idempotent. */
  private async closeMcp(): Promise<void> {
    const client = this.mcpClient
    this.mcpClient = null
    this.advertised = null
    if (client === null) return
    try {
      await client.close()
    } catch {
      // Close must never raise.
    }
  }

  private resetProviders(): void {
    this.providerStatuses = this.providerSpecs.map((provider) => ({
      id: provider.id,
      label: provider.label,
      connected: false,
      toolCount: 0,
      error: null
    }))
  }

  private notify(): void {
    const callback = this.onStatus
    if (callback === undefined) return
    try {
      callback(this.status())
    } catch {
      // A host callback must never break the integration.
    }
  }
}

function failedStatus(
  provider: ComposioProviderSpec,
  message: string
): ComposioProviderStatus {
  return {
    id: provider.id,
    label: provider.label,
    connected: false,
    toolCount: 0,
    error: message
  }
}

/**
 * Match one canonical slug against the names the server advertised, trying an
 * exact match, then a case-insensitive match, then a match on the segment after
 * the uppercased toolkit prefix plus `_` (so an advertised
 * `googlecalendar_create_event` resolves canonical
 * `GOOGLECALENDAR_CREATE_EVENT`).
 */
function resolveAdvertised(
  slug: string,
  toolkit: string,
  advertised: readonly string[]
): string | null {
  if (advertised.includes(slug)) return slug

  const lower = slug.toLowerCase()
  const insensitive = advertised.find((name) => name.toLowerCase() === lower)
  if (insensitive !== undefined) return insensitive

  const prefix = `${toolkit.toUpperCase()}_`
  const upper = slug.toUpperCase()
  const suffix = upper.startsWith(prefix) ? upper.slice(prefix.length) : upper
  return (
    advertised.find((name) => {
      const candidate = name.toUpperCase()
      return (
        candidate.startsWith(prefix) &&
        candidate.slice(prefix.length) === suffix
      )
    }) ?? null
  )
}

/** The first name already taken, or duplicated within `names`. */
function firstDuplicate(
  names: readonly string[],
  taken: ReadonlySet<string>
): string | null {
  const seen = new Set<string>()
  for (const name of names) {
    if (taken.has(name) || seen.has(name)) return name
    seen.add(name)
  }
  return null
}

/** The host's IANA zone, or `UTC` when it cannot be read. */
function hostTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A key rejection is spelled out for the user; everything else is verbatim. */
function sessionErrorMessage(error: unknown): string {
  if (error instanceof ComposioAuthError) {
    return 'Your Composio API key was rejected. Check the key in Settings.'
  }
  return errorMessage(error)
}
