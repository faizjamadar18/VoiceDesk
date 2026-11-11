/**
 * A tiny fake MCP server used by the transport tests.
 *
 * It speaks newline-delimited JSON-RPC over stdin/stdout and implements just
 * enough of the protocol for client.test.ts: `initialize`,
 * `notifications/initialized`, a paginated `tools/list`, and `tools/call` with
 * good, erroring, and hanging paths. It also writes chatter to stderr so the
 * client's stderr draining can be exercised without corrupting stdout.
 *
 * Extra behaviors mirror protocol edge cases the client must handle:
 * - a server-initiated notification and request during initialize (the client
 *   must reply with JSON-RPC error -32601);
 * - a response carrying an unrelated id before the real tools/list response
 *   (the client must drop it).
 */

import { createInterface } from 'node:readline'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_REQUEST_ID = 'server-request-1'

const SEARCH_TOOL = {
  name: 'search_docs',
  description: 'Search the documentation.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  annotations: { readOnlyHint: true }
}

const DELETE_TOOL = {
  name: 'delete_docs',
  description: 'Delete documentation.',
  annotations: { readOnlyHint: false }
}

let initialized = false
let methodNotFoundReplied = false

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function respond(requestId, result) {
  write({ jsonrpc: '2.0', id: requestId, result })
}

function error(requestId, code, message) {
  if (requestId === undefined || requestId === null) return
  write({ jsonrpc: '2.0', id: requestId, error: { code, message } })
}

function handle(message) {
  const method = message.method
  const requestId = message.id
  const params = message.params || {}
  process.stderr.write(`fake server received ${method}\n`)

  // A response to the server-initiated request sent during initialize.
  if (method === undefined) {
    if (
      requestId === SERVER_REQUEST_ID &&
      message.error &&
      message.error.code === -32601
    ) {
      methodNotFoundReplied = true
    }
    return
  }

  if (method === 'initialize') {
    if (params.protocolVersion !== PROTOCOL_VERSION) {
      error(requestId, -32602, 'unsupported protocol version')
      return
    }
    if ((params.clientInfo || {}).name !== 'kestrel') {
      error(requestId, -32602, 'unexpected client name')
      return
    }
    respond(requestId, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'fake', version: '1.0.0' }
    })
    write({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })
    write({
      jsonrpc: '2.0',
      id: SERVER_REQUEST_ID,
      method: 'sampling/createMessage',
      params: {}
    })
    return
  }

  if (method === 'notifications/initialized') {
    initialized = true
    return
  }

  if (method === 'tools/list') {
    if (!initialized) {
      error(requestId, -32002, 'not initialized')
      return
    }
    if (params.cursor === 'page-2') {
      respond(requestId, { tools: [DELETE_TOOL] })
      return
    }
    // This response's id belongs to no pending request and must be dropped.
    respond(999, { tools: [{ name: 'mismatched', description: 'Bogus.' }] })
    respond(requestId, { tools: [SEARCH_TOOL], nextCursor: 'page-2' })
    return
  }

  if (method === 'tools/call') {
    const name = params.name
    if (name === 'good') {
      respond(requestId, {
        content: [
          { type: 'text', text: 'first line' },
          { type: 'image', data: 'ignored', mimeType: 'image/png' },
          { type: 'text', text: 'second line' }
        ],
        isError: false
      })
    } else if (name === 'boom') {
      respond(requestId, {
        content: [{ type: 'text', text: 'kaboom' }],
        isError: true
      })
    } else if (name === 'hang') {
      setTimeout(() => {
        respond(requestId, {
          content: [{ type: 'text', text: 'too late' }],
          isError: false
        })
      }, 30000)
    } else if (name === 'check_reply') {
      respond(requestId, {
        content: [
          {
            type: 'text',
            text: methodNotFoundReplied ? 'method-not-found' : 'no-reply'
          }
        ],
        isError: false
      })
    } else {
      error(requestId, -32602, `unknown tool: ${name}`)
    }
    return
  }

  error(requestId, -32601, `unknown method: ${method}`)
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

lines.on('line', (line) => {
  const stripped = line.trim()
  if (!stripped) return
  let message
  try {
    message = JSON.parse(stripped)
  } catch {
    return
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  handle(message)
})

lines.on('close', () => {
  process.exit(0)
})
