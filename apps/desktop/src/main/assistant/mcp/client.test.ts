import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HttpMcpClient,
  StdioMcpClient,
  makeClient,
  resolveCommand
} from './client'
import { McpConnectionError, type McpServerConfig } from './types'

const FIXTURE_SERVER = fileURLToPath(
  new URL('./fixtures/fake-mcp-server.mjs', import.meta.url)
)

const silentLogger = { debug: () => {} }

function stdioConfig(
  overrides: Partial<McpServerConfig> = {}
): McpServerConfig {
  return {
    name: 'fake',
    transport: 'stdio',
    command: process.execPath,
    args: [FIXTURE_SERVER],
    env: {},
    headers: {},
    enabled: true,
    autoApprove: false,
    readOnly: false,
    writeTools: new Set(),
    tools: null,
    ...overrides
  }
}

function httpConfig(
  url: string,
  overrides: Partial<McpServerConfig> = {}
): McpServerConfig {
  return {
    name: 'remote',
    transport: 'http',
    args: [],
    env: {},
    headers: {},
    enabled: true,
    autoApprove: false,
    readOnly: false,
    writeTools: new Set(),
    tools: null,
    url,
    ...overrides
  }
}

const clients: Array<StdioMcpClient | HttpMcpClient> = []

function stdioClient(
  overrides: Partial<McpServerConfig> = {},
  timeouts: { timeout?: number; initTimeout?: number } = {}
): StdioMcpClient {
  const client = new StdioMcpClient(stdioConfig(overrides), {
    timeout: timeouts.timeout ?? 2,
    initTimeout: timeouts.initTimeout ?? 2,
    logger: silentLogger
  })
  clients.push(client)
  return client
}

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close()
  }
})

interface HttpRequestRecord {
  method: string
  headers: IncomingHttpHeaders
  body: Record<string, unknown>
}

interface HttpTestServer {
  url: string
  close(): Promise<void>
}

function startServer(
  handler: (
    request: HttpRequestRecord,
    response: ServerResponse
  ) => void | Promise<void>
): Promise<HttpTestServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        let body: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>
          }
        } catch {
          body = {}
        }
        Promise.resolve(
          handler(
            { method: request.method ?? '', headers: request.headers, body },
            response
          )
        ).catch((error: unknown) => {
          response.writeHead(500, { 'Content-Type': 'text/plain' })
          response.end(String(error))
        })
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${address.port}/rpc`,
        async close() {
          server.closeAllConnections()
          await new Promise<void>((done) => server.close(() => done()))
        }
      })
    })
  })
}

function sendJson(
  response: ServerResponse,
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers
  })
  response.end(JSON.stringify(payload))
}

function sse(...messages: unknown[]): string {
  return messages
    .map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`)
    .join('')
}

async function listHttpTools(
  server: HttpTestServer,
  overrides: Partial<McpServerConfig> = {}
): Promise<StdioMcpClient | HttpMcpClient> {
  const client = new HttpMcpClient(httpConfig(server.url, overrides), {
    timeout: 2,
    initTimeout: 2,
    logger: silentLogger
  })
  clients.push(client)
  await client.listTools()
  return client
}

describe('makeClient', () => {
  it('selects the transport and rejects an unknown one', async () => {
    const stdio = makeClient(
      stdioConfig({ args: ['-e', 'process.exit(0)'] })
    )
    try {
      expect(stdio).toBeInstanceOf(StdioMcpClient)
    } finally {
      await stdio.close()
    }

    const http = makeClient(httpConfig('https://mcp.test/rpc'))
    try {
      expect(http).toBeInstanceOf(HttpMcpClient)
    } finally {
      await http.close()
    }

    expect(() =>
      makeClient({
        ...httpConfig('https://mcp.test/rpc'),
        transport: 'smtp'
      } as unknown as McpServerConfig)
    ).toThrow(McpConnectionError)
  })
})

describe('StdioMcpClient', () => {
  it('initializes and lists paginated tools', async () => {
    const tools = await stdioClient().listTools()

    expect(tools.map((tool) => tool.name)).toEqual([
      'search_docs',
      'delete_docs'
    ])

    const [search, remove] = tools
    expect(search.description).toBe('Search the documentation.')
    expect(search.inputSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    })
    expect(search.readOnly).toBe(true)

    expect(remove.description).toBe('Delete documentation.')
    expect(remove.inputSchema).toEqual({
      type: 'object',
      properties: {},
      required: []
    })
    expect(remove.readOnly).toBe(false)
  })

  it('flattens text blocks when calling a tool', async () => {
    const result = await stdioClient().callTool('good', { query: 'anything' })

    expect(result.text).toBe('first line\nsecond line')
    expect(result.isError).toBe(false)
  })

  it('maps a tool error to isError', async () => {
    const result = await stdioClient().callTool('boom', {})

    expect(result.text).toBe('kaboom')
    expect(result.isError).toBe(true)
  })

  it('raises a connection error for a JSON-RPC error', async () => {
    const client = stdioClient()

    await expect(client.callTool('missing', {})).rejects.toThrow(
      /fake.*unknown tool/
    )
  })

  it('raises a connection error when a call times out', async () => {
    const client = stdioClient({}, { timeout: 0.3, initTimeout: 2 })

    await expect(client.callTool('hang', {})).rejects.toThrow(/timed out/)
  })

  it('raises a connection error when the process exits', async () => {
    const client = new StdioMcpClient(
      stdioConfig({
        name: 'dead',
        args: ['-e', 'process.exit(0)']
      }),
      { timeout: 2, initTimeout: 2, logger: silentLogger }
    )
    clients.push(client)

    await expect(client.listTools()).rejects.toBeInstanceOf(
      McpConnectionError
    )
  })

  it('raises a connection error when the command cannot be started', async () => {
    const client = new StdioMcpClient(
      stdioConfig({
        name: 'missing',
        command: 'definitely-not-installed-mcp-server',
        args: []
      }),
      { timeout: 2, initTimeout: 2, logger: silentLogger }
    )
    clients.push(client)

    await expect(client.listTools()).rejects.toThrow(
      /Could not start|exited before responding/
    )
  })

  it('ignores stderr noise', async () => {
    const tools = await stdioClient().listTools()

    expect(tools).toHaveLength(2)
  })

  it('closes idempotently and rejects use after close', async () => {
    const client = stdioClient()
    expect(await client.listTools()).toHaveLength(2)

    await client.close()
    await client.close()

    await expect(client.listTools()).rejects.toBeInstanceOf(
      McpConnectionError
    )
  })

  it('replies method-not-found to server-initiated requests', async () => {
    const client = stdioClient()
    await client.listTools()

    const result = await client.callTool('check_reply', {})

    expect(result.text).toBe('method-not-found')
  })
})

describe('resolveCommand', () => {
  it('returns an absolute path unchanged', () => {
    expect(resolveCommand(process.execPath)).toBe(process.execPath)
  })

  it('resolves a bare command through the lookup', () => {
    expect(resolveCommand('npx', () => 'C:\\bin\\npx.cmd')).toBe(
      'C:\\bin\\npx.cmd'
    )
  })

  it('returns an unknown command unchanged', () => {
    expect(resolveCommand('definitely-not-installed', () => null)).toBe(
      'definitely-not-installed'
    )
  })

  it('does not resolve commands containing a path separator', () => {
    const fail = (): string => {
      throw new Error('lookup should not run for a path')
    }

    expect(resolveCommand('some/dir/server', fail)).toBe('some/dir/server')
    if (process.platform === 'win32') {
      expect(resolveCommand('some\\dir\\server', fail)).toBe(
        'some\\dir\\server'
      )
    }
  })
})

describe('StdioMcpClient Windows shell scripts', () => {
  it.runIf(process.platform === 'win32')(
    'launches a .cmd wrapper for a configured command',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kestrel-mcp-cmd-'))
      const wrapper = join(dir, 'server.cmd')
      // `@echo off` keeps cmd.exe from polluting the JSON-RPC stream on stdout.
      writeFileSync(
        wrapper,
        `@echo off\r\n"${process.execPath}" "${FIXTURE_SERVER}" %*\r\n`,
        'utf8'
      )

      try {
        const client = stdioClient({ command: wrapper, args: [] })
        const tools = await client.listTools()

        expect(tools.map((tool) => tool.name)).toEqual([
          'search_docs',
          'delete_docs'
        ])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )
})

describe('HttpMcpClient', () => {
  it('parses a JSON response and sends the initialized notification', async () => {
    const seen: string[] = []
    const server = await startServer((request, response) => {
      const method = request.body.method
      if (typeof method === 'string') seen.push(method)
      const id = request.body.id
      if (method === 'initialize') {
        sendJson(response, {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} }
          }
        })
      } else if (method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
      } else if (method === 'tools/list') {
        sendJson(response, {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'ping',
                description: 'Ping something.',
                inputSchema: {
                  type: 'object',
                  properties: { host: { type: 'string' } },
                  required: ['host']
                }
              }
            ]
          }
        })
      } else {
        throw new Error(`unexpected method ${String(method)}`)
      }
    })

    try {
      const client = new HttpMcpClient(httpConfig(server.url), {
        timeout: 2,
        initTimeout: 2,
        logger: silentLogger
      })
      clients.push(client)
      const tools = await client.listTools()

      expect(tools.map((tool) => tool.name)).toEqual(['ping'])
      expect(tools[0].readOnly).toBe(true)
      expect(seen).toEqual([
        'initialize',
        'notifications/initialized',
        'tools/list'
      ])
    } finally {
      await server.close()
    }
  })

  it('parses an SSE response', async () => {
    const server = await startServer((request, response) => {
      const method = request.body.method
      const id = request.body.id
      if (method === 'initialize') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.end(
          sse({
            jsonrpc: '2.0',
            id,
            result: { protocolVersion: '2025-06-18' }
          })
        )
      } else if (method === 'notifications/initialized') {
        response.writeHead(204)
        response.end()
      } else if (method === 'tools/list') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.end(
          sse(
            { jsonrpc: '2.0', method: 'notifications/progress' },
            {
              jsonrpc: '2.0',
              id,
              result: { tools: [{ name: 'pong', description: 'Pong.' }] }
            }
          )
        )
      } else {
        throw new Error(`unexpected method ${String(method)}`)
      }
    })

    try {
      const client = new HttpMcpClient(httpConfig(server.url), {
        timeout: 2,
        initTimeout: 2,
        logger: silentLogger
      })
      clients.push(client)
      const tools = await client.listTools()

      expect(tools.map((tool) => tool.name)).toEqual(['pong'])
      expect(tools[0].description).toBe('Pong.')
    } finally {
      await server.close()
    }
  })

  it('sends the session id on later requests', async () => {
    const sessionHeaders: Record<string, string | undefined> = {}
    const server = await startServer((request, response) => {
      const method = request.body.method
      if (typeof method === 'string') {
        sessionHeaders[method] = request.headers['mcp-session-id'] as
          | string
          | undefined
      }
      const id = request.body.id
      if (method === 'initialize') {
        sendJson(
          response,
          {
            jsonrpc: '2.0',
            id,
            result: { protocolVersion: '2025-06-18' }
          },
          200,
          { 'Mcp-Session-Id': 'sess-42' }
        )
      } else if (method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
      } else if (method === 'tools/list') {
        sendJson(response, {
          jsonrpc: '2.0',
          id,
          result: { tools: [] }
        })
      } else {
        throw new Error(`unexpected method ${String(method)}`)
      }
    })

    try {
      await listHttpTools(server)
    } finally {
      await server.close()
    }

    expect(sessionHeaders.initialize).toBeUndefined()
    expect(sessionHeaders['notifications/initialized']).toBe('sess-42')
    expect(sessionHeaders['tools/list']).toBe('sess-42')
  })

  it('sends JSON-RPC headers and configured headers', async () => {
    let headers: IncomingHttpHeaders = {}
    const server = await startServer((request, response) => {
      headers = request.headers
      const method = request.body.method
      const id = request.body.id
      if (method === 'initialize') {
        sendJson(response, {
          jsonrpc: '2.0',
          id,
          result: { protocolVersion: '2025-06-18' }
        })
      } else if (method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
      } else {
        sendJson(response, {
          jsonrpc: '2.0',
          id,
          result: { tools: [] }
        })
      }
    })

    try {
      await listHttpTools(server, {
        headers: { Authorization: 'Bearer token' }
      })
    } finally {
      await server.close()
    }

    expect(headers['content-type']).toBe('application/json')
    expect(headers.accept).toBe('application/json, text/event-stream')
    expect(headers.authorization).toBe('Bearer token')
  })

  it('raises a connection error for an HTTP error status', async () => {
    const server = await startServer((request, response) => {
      const method = request.body.method
      if (method === 'initialize') {
        sendJson(response, {
          jsonrpc: '2.0',
          id: request.body.id,
          result: { protocolVersion: '2025-06-18' }
        })
      } else if (method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
      } else {
        response.writeHead(500, { 'Content-Type': 'text/plain' })
        response.end('upstream exploded')
      }
    })

    try {
      const client = new HttpMcpClient(httpConfig(server.url), {
        timeout: 2,
        initTimeout: 2,
        logger: silentLogger
      })
      clients.push(client)

      await expect(client.listTools()).rejects.toThrow(/remote.*500/)
    } finally {
      await server.close()
    }
  })

  it('raises a connection error for a JSON-RPC error', async () => {
    const server = await startServer((request, response) => {
      const method = request.body.method
      if (method === 'initialize') {
        sendJson(response, {
          jsonrpc: '2.0',
          id: request.body.id,
          result: { protocolVersion: '2025-06-18' }
        })
      } else if (method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
      } else {
        sendJson(response, {
          jsonrpc: '2.0',
          id: request.body.id,
          error: { code: -32601, message: 'no tools here' }
        })
      }
    })

    try {
      const client = new HttpMcpClient(httpConfig(server.url), {
        timeout: 2,
        initTimeout: 2,
        logger: silentLogger
      })
      clients.push(client)

      await expect(client.listTools()).rejects.toThrow(/remote.*no tools here/)
    } finally {
      await server.close()
    }
  })

  it('treats a failed initialized notification as best effort', async () => {
    const server = await startServer((request, response) => {
      const method = request.body.method
      if (method === 'initialize') {
        sendJson(response, {
          jsonrpc: '2.0',
          id: request.body.id,
          result: { protocolVersion: '2025-06-18' }
        })
      } else if (method === 'notifications/initialized') {
        response.writeHead(500, { 'Content-Type': 'text/plain' })
        response.end('notification rejected')
      } else {
        sendJson(response, {
          jsonrpc: '2.0',
          id: request.body.id,
          result: { tools: [] }
        })
      }
    })

    try {
      const client = new HttpMcpClient(httpConfig(server.url), {
        timeout: 2,
        initTimeout: 2,
        logger: silentLogger
      })
      clients.push(client)

      expect(await client.listTools()).toEqual([])
    } finally {
      await server.close()
    }
  })

  it('closes idempotently without making a request', async () => {
    const client = new HttpMcpClient(httpConfig('http://127.0.0.1:1/unused'), {
      timeout: 2,
      initTimeout: 2,
      logger: silentLogger
    })
    clients.push(client)

    await client.close()
    await client.close()

    await expect(client.listTools()).rejects.toThrow(/closed/)
  })
})
