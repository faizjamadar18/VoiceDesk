import { describe, expect, it } from 'vitest'
import {
  ComposioAuthError,
  ComposioClient,
  ComposioError,
  DEFAULT_COMPOSIO_BASE_URL
} from './client'
import { COMPOSIO_PROVIDERS } from './providers'
import type { ComposioProviderSpec } from './types'

interface Call {
  url: string
  init: RequestInit
}

const CALENDAR: readonly ComposioProviderSpec[] = COMPOSIO_PROVIDERS

const SESSION_BODY = {
  user_id: 'user-1',
  toolkits: { enable: ['googlecalendar', 'gmail', 'googlesuper', 'notion'] },
  tools: {
    googlecalendar: {
      enable: [
        'GOOGLECALENDAR_EVENTS_LIST',
        'GOOGLECALENDAR_CREATE_EVENT',
        'GOOGLECALENDAR_PATCH_EVENT',
        'GOOGLECALENDAR_DELETE_EVENT'
      ]
    },
    gmail: {
      enable: [
        'GMAIL_FETCH_EMAILS',
        'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
        'GMAIL_SEND_EMAIL',
        'GMAIL_REPLY_TO_THREAD',
        'GMAIL_CREATE_EMAIL_DRAFT'
      ]
    },
    googlesuper: {
      enable: [
        'GOOGLESUPER_FIND_FILE',
        'GOOGLESUPER_CREATE_FILE_FROM_TEXT',
        'GOOGLESUPER_CREATE_PERMISSION',
        'GOOGLESUPER_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION'
      ]
    },
    notion: {
      enable: [
        'NOTION_SEARCH_NOTION_PAGE',
        'NOTION_FETCH_BLOCK_CONTENTS',
        'NOTION_QUERY_DATABASE',
        'NOTION_CREATE_NOTION_PAGE'
      ]
    }
  },
  manage_connections: { enable: false },
  workbench: { enable: false },
  preload: { tools: 'all' },
  search: { enable: false },
  execute: { enable_multi_execute: false },
  mcp: true
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function recordingFetch(
  calls: Call[],
  handler: (call: Call) => Response
): (url: string, init: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return handler(call)
  }
}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

describe('ComposioClient.createSession', () => {
  it('sends the exact tool-router body and returns the parsed session', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({
          session_id: 'sess-1',
          mcp: {
            url: 'https://mcp.composio.dev/sess-1',
            headers: { 'x-api-key': 'session-token' }
          }
        })
      )
    })

    const session = await client.createSession({
      userId: 'user-1',
      providers: CALENDAR
    })

    expect(session).toEqual({
      sessionId: 'sess-1',
      mcpUrl: 'https://mcp.composio.dev/sess-1',
      mcpHeaders: { 'x-api-key': 'session-token' }
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${DEFAULT_COMPOSIO_BASE_URL}/tool_router/session`)
    expect(calls[0].init.method).toBe('POST')
    expect(headersOf(calls[0])['x-api-key']).toBe('test-key')
    expect(headersOf(calls[0])['content-type']).toBe('application/json')
    expect(bodyOf(calls[0])).toEqual(SESSION_BODY)
  })

  it('uses a trailing-slash-free base url for the request', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v3.1/',
      fetch: recordingFetch(calls, () =>
        jsonResponse({ session_id: 's', mcp: { url: 'u', headers: {} } })
      )
    })

    await client.createSession({ userId: 'user-1', providers: CALENDAR })

    expect(calls[0].url).toBe('https://example.test/api/v3.1/tool_router/session')
  })

  it('defaults the MCP headers to the API key when the response omits them', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({
          session_id: 'sess-1',
          mcp: { type: 'http', url: 'https://mcp.composio.dev/sess-1' }
        })
      )
    })

    const session = await client.createSession({
      userId: 'user-1',
      providers: CALENDAR
    })

    expect(session).toEqual({
      sessionId: 'sess-1',
      mcpUrl: 'https://mcp.composio.dev/sess-1',
      mcpHeaders: { 'x-api-key': 'test-key' }
    })
    // The create response carried a usable url, so no fallback read is needed.
    expect(calls).toHaveLength(1)
  })

  it('falls back to the session GET when the create response has no mcp', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, (call) =>
        call.init.method === 'GET'
          ? jsonResponse({
              session_id: 'sess-1',
              mcp: { url: 'https://mcp.composio.dev/sess-1' }
            })
          : jsonResponse({ session_id: 'sess-1' })
      )
    })

    const session = await client.createSession({
      userId: 'user-1',
      providers: CALENDAR
    })

    expect(session).toEqual({
      sessionId: 'sess-1',
      mcpUrl: 'https://mcp.composio.dev/sess-1',
      mcpHeaders: { 'x-api-key': 'test-key' }
    })
    expect(calls).toHaveLength(2)
    expect(calls[1].init.method).toBe('GET')
    expect(calls[1].url).toBe(
      `${DEFAULT_COMPOSIO_BASE_URL}/tool_router/session/sess-1`
    )
  })

  it('throws when neither the create response nor the session GET has mcp', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({ session_id: 'sess-1' })
      )
    })

    await expect(
      client.createSession({ userId: 'user-1', providers: CALENDAR })
    ).rejects.toThrow('Composio did not return an MCP endpoint for the session.')
    expect(calls).toHaveLength(2)
  })

  it('throws a ComposioError when mcp.url is missing', async () => {
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: async (_url, init) =>
        init.method === 'GET'
          ? jsonResponse({ session_id: 'sess-1' })
          : jsonResponse({ session_id: 'sess-1', mcp: { headers: {} } })
    })

    await expect(
      client.createSession({ userId: 'user-1', providers: CALENDAR })
    ).rejects.toThrow('Composio did not return an MCP endpoint for the session.')
  })

  it('throws a ComposioError when session_id is missing', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({ mcp: { url: 'https://mcp.composio.dev/sess-1' } })
      )
    })

    await expect(
      client.createSession({ userId: 'user-1', providers: CALENDAR })
    ).rejects.toThrow('Composio did not return an MCP endpoint for the session.')
    // Without a session id there is nothing to fall back to.
    expect(calls).toHaveLength(1)
  })

  it('throws a ComposioAuthError on 401 without leaking the key', async () => {
    const client = new ComposioClient({
      apiKey: 'super-secret-key',
      fetch: async () => jsonResponse({ error: 'unauthorized' }, 401)
    })

    const error = await client
      .createSession({ userId: 'user-1', providers: CALENDAR })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ComposioAuthError)
    expect((error as Error).message).toBe(
      'Composio rejected the API key. Check the key in Settings.'
    )
    expect((error as Error).message).not.toContain('super-secret-key')
    expect(JSON.stringify(error)).not.toContain('super-secret-key')
  })
})

describe('ComposioClient.createConnectLink', () => {
  it('returns redirect_url and omits callback_url when not supplied', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({ redirect_url: 'https://composio.dev/connect/abc' })
      )
    })

    const url = await client.createConnectLink({
      sessionId: 'sess-1',
      toolkit: 'googlecalendar'
    })

    expect(url).toBe('https://composio.dev/connect/abc')
    expect(calls[0].url).toBe(
      `${DEFAULT_COMPOSIO_BASE_URL}/tool_router/session/sess-1/link`
    )
    const body = bodyOf(calls[0])
    expect(body).toEqual({ toolkit: 'googlecalendar' })
    expect(Object.hasOwn(body, 'callback_url')).toBe(false)
  })

  it('includes callback_url when supplied', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({ redirect_url: 'https://composio.dev/connect/abc' })
      )
    })

    await client.createConnectLink({
      sessionId: 'sess-1',
      toolkit: 'googlecalendar',
      callbackUrl: 'https://kestrel.local/callback'
    })

    expect(bodyOf(calls[0])).toEqual({
      toolkit: 'googlecalendar',
      callback_url: 'https://kestrel.local/callback'
    })
  })

  it('throws when redirect_url is blank', async () => {
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: async () => jsonResponse({ redirect_url: '   ' })
    })

    await expect(
      client.createConnectLink({ sessionId: 'sess-1', toolkit: 'googlecalendar' })
    ).rejects.toBeInstanceOf(ComposioError)
  })
})

describe('ComposioClient.listConnectedToolkits', () => {
  it('lowercases and de-duplicates items[].slug', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () =>
        jsonResponse({
          items: [
            { slug: 'GOOGLECALENDAR' },
            { slug: 'gmail' },
            { slug: 'GoogleCalendar' },
            { slug: 'notion' }
          ]
        })
      )
    })

    const slugs = await client.listConnectedToolkits('sess-1')

    expect(slugs).toEqual(['googlecalendar', 'gmail', 'notion'])
    expect(calls[0].url).toBe(
      `${DEFAULT_COMPOSIO_BASE_URL}/tool_router/session/sess-1/toolkits?is_connected=true`
    )
  })
})

describe('ComposioClient.deleteSession', () => {
  it('resolves on a 404 response', async () => {
    const calls: Call[] = []
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: recordingFetch(calls, () => jsonResponse({}, 404))
    })

    await expect(client.deleteSession('sess-1')).resolves.toBeUndefined()
    expect(calls[0].init.method).toBe('DELETE')
  })
})

describe('ComposioClient errors', () => {
  it('carries status 429 on a rate limit', async () => {
    const client = new ComposioClient({
      apiKey: 'test-key',
      fetch: async () => jsonResponse({ error: 'slow down' }, 429)
    })

    const error = await client
      .createSession({ userId: 'user-1', providers: CALENDAR })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ComposioError)
    expect((error as ComposioError).status).toBe(429)
  })

  it('reports a network failure without leaking the key', async () => {
    const client = new ComposioClient({
      apiKey: 'super-secret-key',
      fetch: async () => {
        const failure = new Error('socket hang up')
        failure.name = 'TimeoutError'
        throw failure
      }
    })

    const error = await client
      .createSession({ userId: 'user-1', providers: CALENDAR })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ComposioError)
    expect((error as Error).message).toBe('Could not reach Composio (TimeoutError).')
    expect((error as Error).message).not.toContain('super-secret-key')
  })
})
