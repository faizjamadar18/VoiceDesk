import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpCallResult, McpClient, McpTool } from '../mcp/types'
import type { ToolContext } from '../types'
import { ComposioAuthError, ComposioClient } from './client'
import {
  CONNECT_POLL_ATTEMPTS,
  ComposioIntegration,
  DEFAULT_CALLBACK_URL
} from './integration'
import { ComposioKeyStore } from './key'
import { COMPOSIO_PROVIDERS } from './providers'
import type {
  ComposioProviderSpec,
  ComposioSession,
  ComposioStatus
} from './types'

const SESSION: ComposioSession = {
  sessionId: 'sess-1',
  mcpUrl: 'https://mcp.example/sess-1',
  mcpHeaders: { 'x-api-key': 'session-token' }
}

const CALENDAR_SLUGS = [
  'GOOGLECALENDAR_EVENTS_LIST',
  'GOOGLECALENDAR_CREATE_EVENT',
  'GOOGLECALENDAR_PATCH_EVENT',
  'GOOGLECALENDAR_DELETE_EVENT'
]

const DRIVE_SLUGS = [
  'GOOGLESUPER_FIND_FILE',
  'GOOGLESUPER_CREATE_FILE_FROM_TEXT',
  'GOOGLESUPER_CREATE_PERMISSION',
  'GOOGLESUPER_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION'
]

const NOTION_SLUGS = [
  'NOTION_SEARCH_NOTION_PAGE',
  'NOTION_FETCH_BLOCK_CONTENTS',
  'NOTION_QUERY_DATABASE',
  'NOTION_CREATE_NOTION_PAGE'
]

function mcpTool(name: string): McpTool {
  return {
    name,
    description: name,
    inputSchema: { type: 'object', properties: {}, required: [] },
    readOnly: false
  }
}

/** A Composio client that records calls and returns canned results. */
class FakeComposioClient extends ComposioClient {
  createSessionCalls: Array<{
    userId: string
    providers: readonly ComposioProviderSpec[]
  }> = []
  connectLinkCalls: Array<{
    sessionId: string
    toolkit: string
    callbackUrl?: string | null
  }> = []
  listConnectedCalls = 0
  deleteSessionCalls: string[] = []

  sessionResult: ComposioSession = SESSION
  sessionError: Error | null = null
  connectLinkResult = 'https://connect.example/abc'
  /** Given the zero-based call index, the toolkits to report as connected. */
  listConnected: (callIndex: number) => string[] = () => []

  constructor() {
    super({ apiKey: 'fake-key' })
  }

  override async createSession(input: {
    userId: string
    providers: readonly ComposioProviderSpec[]
  }): Promise<ComposioSession> {
    this.createSessionCalls.push(input)
    if (this.sessionError !== null) throw this.sessionError
    return this.sessionResult
  }

  override async createConnectLink(input: {
    sessionId: string
    toolkit: string
    callbackUrl?: string | null
  }): Promise<string> {
    this.connectLinkCalls.push(input)
    return this.connectLinkResult
  }

  override async listConnectedToolkits(_sessionId: string): Promise<string[]> {
    const index = this.listConnectedCalls
    this.listConnectedCalls += 1
    return this.listConnected(index)
  }

  override async deleteSession(sessionId: string): Promise<void> {
    this.deleteSessionCalls.push(sessionId)
  }
}

/** An MCP client that records calls and returns canned tools. */
class FakeMcpClient implements McpClient {
  readonly name = 'composio'
  listToolsCalls = 0
  callToolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  closeCalls = 0
  tools: McpTool[] = []
  result: McpCallResult = { text: '{}', isError: false }

  listTools(): McpTool[] {
    this.listToolsCalls += 1
    return this.tools
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    this.callToolCalls.push({ name, args })
    return this.result
  }

  close(): void {
    this.closeCalls += 1
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executor: {
      openApp: async () => undefined,
      openUrl: async () => undefined
    },
    clock: () => new Date('2026-11-07T09:41:12Z'),
    fileRoots: [],
    dryRun: false,
    fileOps: {
      createFolder: async () => '',
      createFile: async () => '',
      deleteFile: async () => '',
      resolveDeleteTarget: async (target) => target,
      removeCreated: async () => undefined
    },
    fileSearch: { search: async () => [] },
    weather: {
      fetch: async (location) => ({
        location,
        temperature: '',
        low: '',
        high: '',
        condition: '',
        icon: '',
        spoken: ''
      })
    },
    ...overrides
  }
}

const directories: string[] = []

function makeStore(): ComposioKeyStore {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-composio-int-'))
  directories.push(directory)
  return new ComposioKeyStore(join(directory, 'composio-key.json'), {
    encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8').toString('base64'),
    decrypt: (cipher) =>
      Buffer.from(cipher, 'base64').toString('utf8').replace(/^enc:/, '')
  })
}

interface Harness {
  integration: ComposioIntegration
  client: FakeComposioClient
  mcp: FakeMcpClient
  store: ComposioKeyStore
  statuses: ComposioStatus[]
}

function makeHarness(
  providers: readonly ComposioProviderSpec[] = COMPOSIO_PROVIDERS
): Harness {
  const store = makeStore()
  const client = new FakeComposioClient()
  const mcp = new FakeMcpClient()
  const statuses: ComposioStatus[] = []
  const integration = new ComposioIntegration({
    keyStore: store,
    userId: 'user-1',
    clientFactory: () => client,
    mcpClientFactory: () => mcp,
    providers,
    sleep: async () => undefined,
    onStatus: (status) => statuses.push(status)
  })
  return { integration, client, mcp, store, statuses }
}

/** Make the calendar toolkit connected and advertise all four slugs. */
function connectCalendar(harness: Harness): void {
  harness.client.listConnected = () => ['googlecalendar']
  harness.mcp.tools = CALENDAR_SLUGS.map(mcpTool)
}

beforeEach(() => {
  vi.stubEnv('KESTREL_COMPOSIO_API_KEY', '')
  vi.stubEnv('COMPOSIO_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ComposioIntegration', () => {
  it('reports no key, no session, and no tools when nothing is stored', async () => {
    const { integration, client } = makeHarness()

    const status = await integration.initialize()

    expect(status.hasKey).toBe(false)
    expect(status.keySource).toBeNull()
    expect(status.sessionId).toBeNull()
    expect(status.error).toBeNull()
    expect(integration.tools).toEqual([])
    expect(client.createSessionCalls).toHaveLength(0)
  })

  it('creates exactly one session even when initialize runs twice', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')

    const first = await harness.integration.initialize()
    expect(harness.client.createSessionCalls).toHaveLength(1)
    expect(first.sessionId).toBe('sess-1')
    expect(first.hasKey).toBe(true)

    const second = await harness.integration.initialize()
    expect(harness.client.createSessionCalls).toHaveLength(1)
    expect(second.sessionId).toBe('sess-1')
  })

  it('surfaces a rejected key as an error without throwing', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.sessionError = new ComposioAuthError('nope')

    const status = await harness.integration.initialize()

    expect(status.error).toMatch(/key/i)
    expect(status.sessionId).toBeNull()
    expect(status.hasKey).toBe(true)
    expect(harness.integration.tools).toEqual([])
  })

  it('reports a disconnected provider with no tools', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => []

    const status = await harness.integration.initialize()
    const provider = status.providers.find((p) => p.id === 'googlecalendar')

    expect(provider?.connected).toBe(false)
    expect(provider?.toolCount).toBe(0)
    expect(provider?.error).toBeNull()
    expect(harness.integration.tools).toEqual([])
    expect(harness.mcp.listToolsCalls).toBe(0)
  })

  it('registers the calendar tools when the toolkit is connected', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    connectCalendar(harness)

    const status = await harness.integration.initialize()
    const provider = status.providers.find((p) => p.id === 'googlecalendar')
    const names = harness.integration.tools.map((tool) => tool.spec.name)

    expect(provider?.connected).toBe(true)
    expect(provider?.toolCount).toBe(4)
    expect(provider?.error).toBeNull()
    expect(names).toContain('calendar_list_events')
    expect(names).toContain('calendar_create_event')
    expect(harness.integration.tools).toHaveLength(4)
    expect(harness.mcp.listToolsCalls).toBe(1)
  })

  it('registers the drive tools when googlesuper is connected', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => ['googlesuper']
    harness.mcp.tools = DRIVE_SLUGS.map(mcpTool)
    harness.mcp.result = {
      text: JSON.stringify({ successful: true, data: { files: [] } }),
      isError: false
    }

    const status = await harness.integration.initialize()
    const provider = status.providers.find((p) => p.id === 'googlesuper')
    const names = harness.integration.tools.map((tool) => tool.spec.name)

    expect(provider?.connected).toBe(true)
    expect(provider?.toolCount).toBe(4)
    expect(provider?.error).toBeNull()
    expect(names).toHaveLength(4)
    for (const name of [
      'drive_find_files',
      'drive_create_file',
      'drive_share_file',
      'drive_delete_file'
    ]) {
      expect(names).toContain(name)
    }

    const find = harness.integration.tools.find(
      (tool) => tool.spec.name === 'drive_find_files'
    )
    expect(find).toBeDefined()
    await find?.run({}, makeContext())

    expect(harness.mcp.callToolCalls).toHaveLength(1)
    expect(harness.mcp.callToolCalls[0].name).toBe('GOOGLESUPER_FIND_FILE')
  })

  it('registers the notion tools when notion is connected', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => ['notion']
    harness.mcp.tools = NOTION_SLUGS.map(mcpTool)
    harness.mcp.result = {
      text: JSON.stringify({ successful: true, data: { results: [] } }),
      isError: false
    }

    const status = await harness.integration.initialize()
    const provider = status.providers.find((p) => p.id === 'notion')
    const names = harness.integration.tools.map((tool) => tool.spec.name)

    expect(provider?.connected).toBe(true)
    expect(provider?.toolCount).toBe(4)
    expect(provider?.error).toBeNull()
    expect(names).toHaveLength(4)
    for (const name of [
      'notion_search',
      'notion_read_page',
      'notion_query_database',
      'notion_create_page'
    ]) {
      expect(names).toContain(name)
    }

    const search = harness.integration.tools.find(
      (tool) => tool.spec.name === 'notion_search'
    )
    expect(search).toBeDefined()
    await search?.run({}, makeContext())

    expect(harness.mcp.callToolCalls).toHaveLength(1)
    expect(harness.mcp.callToolCalls[0].name).toBe('NOTION_SEARCH_NOTION_PAGE')
  })

  it('groups registered tool names by provider id', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => [
      'googlecalendar',
      'googlesuper',
      'notion'
    ]
    harness.mcp.tools = [
      ...CALENDAR_SLUGS,
      ...DRIVE_SLUGS,
      ...NOTION_SLUGS
    ].map(mcpTool)

    await harness.integration.initialize()

    const groups = harness.integration.toolGroups()
    expect(groups.map((group) => group.provider)).toEqual([
      'googlecalendar',
      'googlesuper',
      'notion'
    ])
    const calendar = groups.find((group) => group.provider === 'googlecalendar')
    expect(calendar?.tools).toContain('calendar_list_events')
    expect(calendar?.tools).toHaveLength(4)
    const drive = groups.find((group) => group.provider === 'googlesuper')
    expect(drive?.tools).toContain('drive_find_files')
    expect(drive?.tools).toHaveLength(4)
    const notion = groups.find((group) => group.provider === 'notion')
    expect(notion?.tools).toContain('notion_search')
    expect(notion?.tools).toHaveLength(4)
  })

  it('fails the whole provider when one required slug is missing', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => ['googlecalendar']
    harness.mcp.tools = CALENDAR_SLUGS.filter(
      (slug) => slug !== 'GOOGLECALENDAR_PATCH_EVENT'
    ).map(mcpTool)

    const status = await harness.integration.initialize()
    const provider = status.providers.find((p) => p.id === 'googlecalendar')

    expect(provider?.connected).toBe(false)
    expect(provider?.toolCount).toBe(0)
    expect(provider?.error).toContain('GOOGLECALENDAR_PATCH_EVENT')
    expect(harness.integration.tools).toEqual([])
  })

  it('resolves lower-case names and calls MCP with the advertised name', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => ['googlecalendar']
    harness.mcp.tools = CALENDAR_SLUGS.map((slug) => mcpTool(slug.toLowerCase()))
    harness.mcp.result = {
      text: JSON.stringify({ successful: true, data: { items: [] } }),
      isError: false
    }

    await harness.integration.initialize()

    const list = harness.integration.tools.find(
      (tool) => tool.spec.name === 'calendar_list_events'
    )
    expect(list).toBeDefined()
    await list?.run({}, makeContext())

    expect(harness.mcp.callToolCalls).toHaveLength(1)
    expect(harness.mcp.callToolCalls[0].name).toBe('googlecalendar_events_list')
  })

  it('returns a connect link for a supported provider and refuses an unsupported one', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    await harness.integration.initialize()

    const connected = await harness.integration.connect('googlecalendar')
    expect(connected.ok).toBe(true)
    expect(connected.url).toBe('https://connect.example/abc')
    expect(harness.client.connectLinkCalls).toHaveLength(1)
    expect(harness.client.connectLinkCalls[0].toolkit).toBe('googlecalendar')
    expect(harness.client.connectLinkCalls[0].callbackUrl).toBe(
      DEFAULT_CALLBACK_URL
    )

    const unsupported = await makeHarness([COMPOSIO_PROVIDERS[0]]).integration
      .connect('notion')
    expect(unsupported.ok).toBe(false)
    expect(unsupported.url).toBeNull()
    expect(unsupported.message).toBe('That app is not supported yet.')
  })

  it('gives up after the poll budget without throwing', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.client.listConnected = () => []
    await harness.integration.initialize()

    const ok = await harness.integration.waitForConnection('googlecalendar')

    expect(ok).toBe(false)
    // One poll from initialize's sync, then one per attempt.
    expect(harness.client.listConnectedCalls).toBe(1 + CONNECT_POLL_ATTEMPTS)
  })

  it('returns true once the toolkit appears and registers the tools', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    harness.mcp.tools = CALENDAR_SLUGS.map(mcpTool)
    harness.client.listConnected = (index) =>
      index >= 2 ? ['googlecalendar'] : []
    await harness.integration.initialize()

    const ok = await harness.integration.waitForConnection('googlecalendar')

    expect(ok).toBe(true)
    expect(harness.integration.tools).toHaveLength(4)
  })

  it('clears the stored key and falls back to the environment', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', 'env-key')

    const before = await harness.integration.initialize()
    expect(before.keySource).toBe('stored')
    expect(before.sessionId).toBe('sess-1')

    const status = await harness.integration.clearKey()

    expect(harness.store.hasStored()).toBe(false)
    expect(status.hasKey).toBe(true)
    expect(status.keySource).toBe('env')
    expect(status.sessionId).toBeNull()
    expect(harness.integration.tools).toEqual([])
    expect(harness.client.deleteSessionCalls).toEqual(['sess-1'])
  })

  it('skips a provider whose factory emits an already-taken tool name', async () => {
    const spec = COMPOSIO_PROVIDERS[0]
    const harness = makeHarness([spec, spec])
    harness.store.save('composio-secret')
    harness.client.listConnected = () => ['googlecalendar']
    harness.mcp.tools = CALENDAR_SLUGS.map(mcpTool)

    const status = await harness.integration.initialize()

    expect(status.providers).toHaveLength(2)
    expect(status.providers[0].toolCount).toBe(4)
    expect(status.providers[0].error).toBeNull()
    expect(status.providers[1].error).toBe(
      'Duplicate tool name calendar_list_events.'
    )
    expect(status.providers[1].toolCount).toBe(0)
    expect(harness.integration.tools).toHaveLength(4)
  })

  it('brings a stored key up on refresh without initialize', async () => {
    const harness = makeHarness()
    harness.store.save('composio-secret')
    connectCalendar(harness)

    // A fresh process calls refresh() only; it must still create the session.
    const status = await harness.integration.refresh()

    expect(harness.client.createSessionCalls).toHaveLength(1)
    expect(status.hasKey).toBe(true)
    expect(status.sessionId).toBe('sess-1')
    const names = harness.integration.tools.map((tool) => tool.spec.name)
    expect(names).toHaveLength(4)
    expect(names).toContain('calendar_list_events')
    expect(names).toContain('calendar_create_event')
    expect(names).toContain('calendar_move_event')
    expect(names).toContain('calendar_cancel_event')
  })

  it('explains a consumer key without calling Composio', async () => {
    const harness = makeHarness()
    // save() rejects ck_ keys, so an old key arrives through the environment.
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', 'ck_abc')

    const status = await harness.integration.initialize()

    expect(status.error).toContain('consumer key')
    expect(status.sessionId).toBeNull()
    expect(harness.integration.tools).toEqual([])
    expect(harness.client.createSessionCalls).toHaveLength(0)
  })
})
