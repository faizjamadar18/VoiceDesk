import type { ToolContext } from '../types'
import { describe, expect, it } from 'vitest'
import {
  McpManager,
  McpToolAdapter,
  formatToolResult,
  humanize,
  sanitize
} from './registry'
import type {
  McpCallResult,
  McpClient,
  McpServerConfig,
  McpServerStatus,
  McpTool
} from './types'

interface FakeClientOptions {
  tools?: McpTool[]
  result?: McpCallResult
  error?: unknown
  listError?: unknown
}

/** A scripted client that records calls and never touches a network. */
class FakeClient implements McpClient {
  readonly name: string
  readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> =
    []
  closeCount = 0
  private readonly toolList: McpTool[]
  private readonly result: McpCallResult
  private readonly error: unknown
  private readonly listError: unknown

  constructor(name: string, options: FakeClientOptions = {}) {
    this.name = name
    this.toolList = options.tools ?? []
    this.result = options.result ?? { text: '', isError: false }
    this.error = options.error
    this.listError = options.listError
  }

  async listTools(): Promise<McpTool[]> {
    if (this.listError !== undefined) throw this.listError
    return [...this.toolList]
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    this.calls.push({ name, arguments: args })
    if (this.error !== undefined) throw this.error
    return this.result
  }

  async close(): Promise<void> {
    this.closeCount += 1
  }
}

function makeServer(
  overrides: Partial<McpServerConfig> = {}
): McpServerConfig {
  return {
    name: 'Google Drive',
    transport: 'stdio',
    command: 'run-server',
    args: [],
    env: {},
    headers: {},
    enabled: true,
    autoApprove: false,
    readOnly: false,
    writeTools: new Set<string>(),
    tools: null,
    ...overrides
  }
}

function makeTool(overrides: Partial<McpTool> = {}): McpTool {
  return {
    name: 'read_file',
    description: 'Read a file.',
    inputSchema: { type: 'object' },
    readOnly: true,
    ...overrides
  }
}

function makeCtx(dryRun: boolean): ToolContext {
  return { dryRun } as unknown as ToolContext
}

function makeAdapter(
  server: McpServerConfig,
  tool: McpTool,
  client: McpClient
): McpToolAdapter {
  return new McpToolAdapter(server, tool, client)
}

describe('humanize', () => {
  it('turns known ids into readable labels', () => {
    expect(humanize('google_drive')).toBe('Google Drive')
  })
})

describe('sanitize', () => {
  it('collapses separators and strips the edges', () => {
    expect(sanitize('Google-Drive!')).toBe('google_drive')
    expect(sanitize('  a  b  ')).toBe('a_b')
    expect(sanitize('--Leading--')).toBe('leading')
  })
})

describe('McpToolAdapter', () => {
  it('combines sanitized server and tool names', () => {
    const adapter = makeAdapter(
      makeServer({ name: 'Google Drive' }),
      makeTool({ name: 'Read File!' }),
      new FakeClient('c')
    )

    expect(adapter.spec.name).toBe('google_drive_read_file')
  })

  it('uses the tool description and server action label', () => {
    const adapter = makeAdapter(
      makeServer({ name: 'google_drive' }),
      makeTool({ description: 'List issues.' }),
      new FakeClient('c')
    )

    expect(adapter.spec.description).toBe('List issues.')
    expect(adapter.spec.actionLabel).toBe('Google Drive')
  })

  it('falls back to the tool name for an empty description', () => {
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ name: 'ping', description: '' }),
      new FakeClient('c')
    )

    expect(adapter.spec.description).toBe('ping')
  })

  it('marks a read-only tool as read', () => {
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ readOnly: true }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('read')
    expect(adapter.spec.requiresConfirmation).toBe(false)
  })

  it('marks every tool read when the server is read-only', () => {
    const adapter = makeAdapter(
      makeServer({ readOnly: true }),
      makeTool({ readOnly: false }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('read')
    expect(adapter.spec.requiresConfirmation).toBe(false)
  })

  it('requires confirmation for a write tool', () => {
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ readOnly: false }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('write')
    expect(adapter.spec.requiresConfirmation).toBe(true)
  })

  it('drops confirmation for a write tool when auto-approve is set', () => {
    const adapter = makeAdapter(
      makeServer({ autoApprove: true }),
      makeTool({ readOnly: false }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('write')
    expect(adapter.spec.requiresConfirmation).toBe(false)
  })

  it('lets write_tools mark an unannotated tool as write', () => {
    const adapter = makeAdapter(
      makeServer({ writeTools: new Set(['API-post-page']) }),
      makeTool({ name: 'API-post-page', readOnly: true }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('write')
    expect(adapter.spec.requiresConfirmation).toBe(true)
  })

  it('leaves other tools read when write_tools is set', () => {
    const adapter = makeAdapter(
      makeServer({ writeTools: new Set(['API-post-page']) }),
      makeTool({ name: 'API-post-search', readOnly: true }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('read')
  })

  it('lets a read-only server override write_tools', () => {
    const adapter = makeAdapter(
      makeServer({ readOnly: true, writeTools: new Set(['anything']) }),
      makeTool({ name: 'anything', readOnly: true }),
      new FakeClient('c')
    )

    expect(adapter.spec.risk).toBe('read')
    expect(adapter.spec.requiresConfirmation).toBe(false)
  })

  it('normalizes an empty schema to an object', () => {
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ inputSchema: {} }),
      new FakeClient('c')
    )

    expect(adapter.spec.parameters).toEqual({
      type: 'object',
      properties: {},
      required: []
    })
  })

  it('normalizes the schema without mutating the input', () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ inputSchema: schema }),
      new FakeClient('c')
    )

    expect(adapter.spec.parameters.properties).toEqual({
      query: { type: 'string' }
    })
    expect(adapter.spec.parameters.required).toEqual(['query'])
    expect(adapter.spec.parameters).not.toBe(schema)
    expect(adapter.spec.parameters.properties).not.toBe(schema.properties)
    expect(schema).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    })
  })

  it('removes refs and defs from parameters', () => {
    const schema = {
      $defs: {
        block: { type: 'object', properties: { text: { type: 'string' } } }
      },
      type: 'object',
      properties: {
        children: { type: 'array', items: { $ref: '#/$defs/block' } }
      }
    }
    const adapter = makeAdapter(
      makeServer(),
      makeTool({ inputSchema: schema }),
      new FakeClient('c')
    )

    const serialized = JSON.stringify(adapter.spec.parameters)

    expect(serialized).not.toContain('$ref')
    expect(serialized).not.toContain('$defs')
    expect(adapter.spec.parameters.type).toBe('object')
  })

  it('does not call the client during a dry run', async () => {
    const client = new FakeClient('c', {
      result: { text: 'done', isError: false }
    })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({}, makeCtx(true))

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('Would run read_file.')
    expect(client.calls).toEqual([])
  })

  it('truncates a long message and speaks a shorter one', async () => {
    const longText = 'word '.repeat(2000)
    const client = new FakeClient('c', {
      result: { text: longText, isError: false }
    })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({ a: 1 }, makeCtx(false))

    expect(outcome.status).toBe('ok')
    expect(outcome.action).toBe('Google Drive')
    expect(outcome.message.endsWith('...')).toBe(true)
    expect(outcome.message.length).toBeLessThanOrEqual(4003)
    expect(outcome.spokenResponse).toBeDefined()
    expect(outcome.spokenResponse?.endsWith('...')).toBe(true)
    expect(outcome.spokenResponse?.length).toBeLessThanOrEqual(403)
    expect(client.calls).toEqual([{ name: 'read_file', arguments: { a: 1 } }])
  })

  it('collapses whitespace in a short message', async () => {
    const client = new FakeClient('c', {
      result: { text: '  hello\n\nworld  ', isError: false }
    })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({}, makeCtx(false))

    expect(outcome.message).toBe('hello world')
    expect(outcome.spokenResponse).toBe('hello world')
  })

  it('maps an isError result to an error outcome', async () => {
    const client = new FakeClient('c', {
      result: { text: 'boom', isError: true }
    })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({}, makeCtx(false))

    expect(outcome.status).toBe('error')
    expect(outcome.message).toBe('boom')
  })

  it('maps a raised exception to an error outcome', async () => {
    const client = new FakeClient('c', { error: new Error('kaboom') })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({}, makeCtx(false))

    expect(outcome.status).toBe('error')
    expect(outcome.message).toContain('kaboom')
  })

  it('speaks a summary instead of raw JSON', async () => {
    const client = new FakeClient('c', {
      result: { text: emptyNotionSearch(), isError: false }
    })
    const adapter = makeAdapter(makeServer(), makeTool(), client)

    const outcome = await adapter.run({}, makeCtx(false))

    expect(outcome.status).toBe('ok')
    expect(outcome.message).toBe('No results found.')
    expect(outcome.spokenResponse).toBe('No results found.')
  })
})

function emptyNotionSearch(): string {
  return JSON.stringify({
    object: 'list',
    results: [],
    next_cursor: null,
    has_more: false,
    request_id: 'x'
  })
}

describe('formatToolResult', () => {
  it('summarizes an empty Notion search', () => {
    expect(formatToolResult(emptyNotionSearch())).toBe('No results found.')
  })

  it('counts list results', () => {
    const text = JSON.stringify({ results: [{ id: '1' }, { id: '2' }] })
    expect(formatToolResult(text)).toBe('Found 2 result(s).')
  })

  it('leaves prose unchanged', () => {
    expect(formatToolResult('hello world')).toBe('hello world')
  })

  it('uses title for an object', () => {
    expect(formatToolResult(JSON.stringify({ title: 'Roadmap' }))).toBe(
      'Roadmap'
    )
  })

  it('returns Done for an empty object', () => {
    expect(formatToolResult('{}')).toBe('Done.')
    expect(formatToolResult('   ')).toBe('Done.')
  })
})

describe('McpManager', () => {
  it('records statuses and exposes tools from good servers', async () => {
    const goodTool = makeTool({
      name: 'ping',
      description: 'Ping.',
      inputSchema: { type: 'object' }
    })
    const good = makeServer({ name: 'good', command: 'a' })
    const bad = makeServer({ name: 'bad', command: 'b' })

    const factory = (config: McpServerConfig): FakeClient => {
      if (config.name === 'bad') {
        return new FakeClient(config.name, {
          listError: new Error('nope')
        })
      }
      return new FakeClient(config.name, { tools: [goodTool] })
    }

    const manager = new McpManager([good, bad], factory)

    const statuses = await manager.connect()

    expect(statuses.map((status) => status.name)).toEqual(['good', 'bad'])
    expect(statuses[0].ok).toBe(true)
    expect(statuses[0].toolCount).toBe(1)
    expect(statuses[1].ok).toBe(false)
    expect(statuses[1].error).toBe('nope')
    expect(manager.tools.map((tool) => tool.spec.name)).toEqual(['good_ping'])
    expect(manager.statuses).toEqual(statuses)
  })

  it('filters and counts tools through the allowlist', async () => {
    const available = [
      makeTool({ name: 'API-post-search', description: 'Search.' }),
      makeTool({ name: 'API-delete-a-block', description: 'Delete.' })
    ]
    const server = makeServer({
      name: 'notion',
      command: 'x',
      tools: ['API-post-search']
    })

    const factory = (config: McpServerConfig): FakeClient =>
      new FakeClient(config.name, { tools: available })

    const manager = new McpManager([server], factory)

    const statuses = await manager.connect()

    expect(manager.tools.map((tool) => tool.spec.name)).toEqual([
      'notion_api_post_search'
    ])
    expect(statuses[0].toolCount).toBe(1)
  })

  it('never raises when the factory fails', async () => {
    const factory = (): FakeClient => {
      throw new Error('cannot start')
    }

    const manager = new McpManager([makeServer({ name: 's' })], factory)

    const statuses = await manager.connect()

    expect(statuses).toEqual<McpServerStatus[]>([
      { name: 's', ok: false, toolCount: 0, error: 'cannot start' }
    ])
    expect(manager.tools).toEqual([])
  })

  it('closes every client and is idempotent', async () => {
    const created: FakeClient[] = []
    const factory = (config: McpServerConfig): FakeClient => {
      const client =
        config.name === 'bad'
          ? new FakeClient(config.name, {
              listError: new Error('x')
            })
          : new FakeClient(config.name)
      created.push(client)
      return client
    }

    const manager = new McpManager(
      [makeServer({ name: 'good' }), makeServer({ name: 'bad' })],
      factory
    )
    await manager.connect()

    await manager.close()
    await manager.close()

    expect(created).toHaveLength(2)
    expect(created.every((client) => client.closeCount === 1)).toBe(true)
  })
})
