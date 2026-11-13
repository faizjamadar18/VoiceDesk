import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_GROQ_MODEL,
  GROQ_FALLBACK_MODELS,
  GROQ_TIMEOUT_SECONDS,
  GroqClient,
  GroqError,
  GroqQuotaError,
  ResilientLlmClient,
  contentFromResponse,
  formatLocalTimestamp,
  modelChainFromEnv,
  resilientFromEnv,
  toolCallsFromResponse
} from './groq'
import type { FetchLike } from './groq'
import type { ToolSpec } from './types'

interface FetchCall {
  url: string
  init: RequestInit
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function recordingFetch(
  handler: (call: FetchCall, index: number) => Response | Promise<Response>
): { fetch: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return handler(call, calls.length - 1)
  }
  return { fetch, calls }
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

function toolNames(call: FetchCall): string[] {
  const tools = bodyOf(call).tools
  if (!Array.isArray(tools)) return []
  return tools.map((tool) => {
    const entry = tool as { function: { name: string } }
    return entry.function.name
  })
}

function spec(name: string, description = 'Launch an app'): ToolSpec {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { app: { type: 'string' } },
      required: ['app']
    },
    risk: 'read',
    requiresConfirmation: false
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('toolCallsFromResponse', () => {
  it('extracts the function name and arguments', () => {
    const raw = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location": "Tokyo"}'
                }
              }
            ]
          }
        }
      ]
    }

    expect(toolCallsFromResponse(raw)).toEqual([
      { name: 'get_weather', arguments: { location: 'Tokyo' } }
    ])
  })

  it('handles empty or malformed payloads', () => {
    expect(toolCallsFromResponse({})).toEqual([])
    expect(toolCallsFromResponse({ choices: [] })).toEqual([])
    expect(toolCallsFromResponse({ choices: [{ message: {} }] })).toEqual([])
    expect(
      toolCallsFromResponse({
        choices: [{ message: { tool_calls: [{ function: 'not a dict' }] } }]
      })
    ).toEqual([])
  })

  it('falls back to empty arguments for bad JSON', () => {
    const calls = toolCallsFromResponse({
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: 'open_app', arguments: '{oops' } }]
          }
        }
      ]
    })
    expect(calls).toEqual([{ name: 'open_app', arguments: {} }])
  })
})

describe('contentFromResponse', () => {
  it('trims content and treats blank content as null', () => {
    expect(
      contentFromResponse({ choices: [{ message: { content: '  hello  ' } }] })
    ).toBe('hello')
    expect(
      contentFromResponse({ choices: [{ message: { content: '   ' } }] })
    ).toBeNull()
    expect(contentFromResponse({})).toBeNull()
  })
})

describe('formatLocalTimestamp', () => {
  it('renders a local timestamp with an explicit UTC offset', () => {
    expect(formatLocalTimestamp(new Date())).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
    )
  })

  it('round-trips the local wall clock', () => {
    const date = new Date(2026, 10, 12, 14, 32, 5)
    const stamp = formatLocalTimestamp(date)
    const [datePart, timePart] = stamp.slice(0, 19).split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hours, minutes, seconds] = timePart.split(':').map(Number)
    const rebuilt = new Date(year, month - 1, day, hours, minutes, seconds)

    expect(rebuilt.getHours()).toBe(date.getHours())
    expect(rebuilt.getMinutes()).toBe(date.getMinutes())
    expect(rebuilt.getSeconds()).toBe(date.getSeconds())
  })
})

describe('GroqClient', () => {
  it('sends the tool definitions and returns a tool call', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'open_app',
                    arguments: '{"app": "notepad"}'
                  }
                }
              ]
            }
          }
        ]
      })
    )
    const client = new GroqClient('gsk_test', { fetch })

    const reply = await client.choose('open notepad', [spec('open_app')])

    expect(reply.calls).toEqual([
      { name: 'open_app', arguments: { app: 'notepad' } }
    ])
    expect(reply.content).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      `${DEFAULT_GROQ_BASE_URL}/chat/completions`
    )
    expect(calls[0].init.method).toBe('POST')
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization
    ).toBe('Bearer gsk_test')
    const body = bodyOf(calls[0])
    expect(body.model).toBe(DEFAULT_GROQ_MODEL)
    expect(body.temperature).toBe(0.1)
    expect(body.tool_choice).toBe('auto')
    expect(toolNames(calls[0])).toEqual(['open_app'])
    const messages = body.messages as Array<{ role: string; content: string }>
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('You are Kestrel')
    expect(messages[0].content).toContain('Always call a tool')
    expect(messages[0].content).toContain(
      'Never ask the user which calendar, mailbox, or app to use.'
    )
    expect(messages[0].content).toContain('Never invent an email address.')
    expect(messages[1]).toEqual({ role: 'user', content: 'open notepad' })
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('includes explicit Notion rules in the system prompt', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )
    const client = new GroqClient('gsk_test', { fetch })

    await client.choose('summarize my DP notes', [])

    const messages = bodyOf(calls[0]).messages as Array<{
      role: string
      content: string
    }>
    const system = messages[0].content
    expect(system).toContain(
      'When the user asks to find, search, read, summarize, or query pages, ' +
        'notes, or databases in Notion, call the matching Notion tool directly.'
    )
    expect(system).toContain(
      "When the user asks to read, view, or summarize a page or note (e.g., 'summarize my DP notes', 'read the project page'), use `notion_read_page` passing the page name."
    )
    expect(system).toContain(
      'When the user asks to read rows, tables, or a database, use `notion_query_database` passing the database name.'
    )
    expect(system).toContain(
      'When the user asks to search or find pages or databases, use `notion_search`.'
    )
    expect(system).toContain(
      'When the user asks to create a page, use `notion_create_page`.'
    )
    expect(system).toContain(
      'Never invent Notion IDs or ask the user which app to use when a Notion tool fits.'
    )
  })

  it('sends the current date, time, and a relative-date resolution rule', async () => {
    const fixed = new Date(2026, 10, 12, 14, 32, 5)
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )
    const client = new GroqClient('gsk_test', {
      fetch,
      clock: () => fixed
    })

    await client.choose('schedule a meeting tomorrow at 3', [])

    const messages = bodyOf(calls[0]).messages as Array<{
      role: string
      content: string
    }>
    expect(messages[0].content).toContain(formatLocalTimestamp(fixed))
    expect(messages[0].content).toContain('absolute ISO 8601 datetime')
  })

  it('replays prior turns between the system message and the transcript', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )
    const client = new GroqClient('gsk_test', { fetch })

    await client.choose('and now', [], [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ])

    const messages = bodyOf(calls[0]).messages as Array<{
      role: string
      content: string
    }>
    expect(messages).toHaveLength(4)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('You are Kestrel')
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(messages[2]).toEqual({ role: 'assistant', content: 'hello' })
    expect(messages[3]).toEqual({ role: 'user', content: 'and now' })
  })

  it('sends only the system and current user messages with no history', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )
    const client = new GroqClient('gsk_test', { fetch })

    await client.choose('open notepad', [])

    const messages = bodyOf(calls[0]).messages as Array<{
      role: string
      content: string
    }>
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('You are Kestrel')
    expect(messages[1]).toEqual({ role: 'user', content: 'open notepad' })
  })

  it('replays the same history on the schema retry', async () => {
    const bad = spec('notion_api_patch_block_children', 'Append blocks.')
    const { fetch, calls } = recordingFetch((_call, index) => {
      if (index === 0) {
        return jsonResponse(
          {
            error: {
              message:
                'invalid JSON schema for tool ' +
                'notion_api_patch_block_children'
            }
          },
          400
        )
      }
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    })
    const client = new GroqClient('gsk_test', { fetch })

    await client.choose(
      'and now',
      [bad],
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ]
    )

    expect(calls).toHaveLength(2)
    const messages = bodyOf(calls[1]).messages as Array<{
      role: string
      content: string
    }>
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(messages[2]).toEqual({ role: 'assistant', content: 'hello' })
    expect(messages[3]).toEqual({ role: 'user', content: 'and now' })
  })

  it('returns content when there are no tool calls', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'Which page?' } }] })
    )
    const client = new GroqClient('gsk_test', { fetch })

    const reply = await client.choose('open the page', [])

    expect(reply.calls).toEqual([])
    expect(reply.content).toBe('Which page?')
  })

  it('maps HTTP 429 to a quota error without retrying', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ error: { message: 'Rate limit exceeded' } }, 429)
    )
    const client = new GroqClient('gsk_test', { fetch })

    await expect(client.choose('open notepad', [])).rejects.toBeInstanceOf(
      GroqQuotaError
    )
    expect(calls).toHaveLength(1)
  })

  it('includes the HTTP status and body snippet for server errors', async () => {
    const { fetch, calls } = recordingFetch(
      () => new Response('Internal Server Error', { status: 500 })
    )
    const client = new GroqClient('gsk_test', { fetch })

    const error = await client.choose('open notepad', []).catch((err) => err)

    expect(error).toBeInstanceOf(GroqError)
    expect((error as Error).message).toContain('HTTP 500')
    expect((error as Error).message).toContain('Internal Server Error')
    expect(calls).toHaveLength(1)
  })

  it('retries without the tool named in a schema error', async () => {
    const bad = spec('notion_api_patch_block_children', 'Append blocks.')
    const good = spec('open_app')
    const { fetch, calls } = recordingFetch((_call, index) => {
      if (index === 0) {
        return jsonResponse(
          {
            error: {
              message:
                'invalid JSON schema for tool ' +
                'notion_api_patch_block_children, tools[68].' +
                'function.parameters: ref not found'
            }
          },
          400
        )
      }
      return jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'open_app',
                    arguments: '{"app": "notepad"}'
                  }
                }
              ]
            }
          }
        ]
      })
    })
    const client = new GroqClient('gsk_test', { fetch })

    const reply = await client.choose('open notepad', [bad, good])

    expect(reply.calls).toEqual([
      { name: 'open_app', arguments: { app: 'notepad' } }
    ])
    expect(calls).toHaveLength(2)
    expect(toolNames(calls[0])).toEqual([
      'notion_api_patch_block_children',
      'open_app'
    ])
    expect(toolNames(calls[1])).toEqual(['open_app'])
  })

  it('does not retry an unrelated HTTP 400', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse(
        { error: { message: 'bad request, nothing to do with tools' } },
        400
      )
    )
    const client = new GroqClient('gsk_test', { fetch })

    await expect(
      client.choose('open notepad', [spec('open_app')])
    ).rejects.toBeInstanceOf(GroqError)
    expect(calls).toHaveLength(1)
  })

  it('rejects a response that is not valid JSON', async () => {
    const { fetch } = recordingFetch(
      () => new Response('not json', { status: 200 })
    )
    const client = new GroqClient('gsk_test', { fetch })

    await expect(client.choose('open notepad', [])).rejects.toThrow(
      'Groq response was not valid JSON.'
    )
  })

  it('wraps network failures', async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    const client = new GroqClient('gsk_test', { fetch })

    await expect(client.choose('open notepad', [])).rejects.toThrow(
      'Groq planner request failed (TypeError).'
    )
  })

  it('uses a five second default timeout', () => {
    expect(GROQ_TIMEOUT_SECONDS).toBe(5.0)
  })

  it('reads the environment aliases and overrides', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_other')
    vi.stubEnv('KESTREL_GROQ_API_KEY', 'gsk_kestrel')
    vi.stubEnv('KESTREL_GROQ_BASE_URL', 'https://groq.example/v1/')
    vi.stubEnv('KESTREL_GROQ_MODEL', 'planner/test-model')
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )

    const client = GroqClient.fromEnv({ fetch })
    await client.choose('hello', [])

    expect(client.baseUrl).toBe('https://groq.example/v1')
    expect(client.model).toBe('planner/test-model')
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization
    ).toBe('Bearer gsk_kestrel')
    expect(calls[0].url).toBe('https://groq.example/v1/chat/completions')
    expect(bodyOf(calls[0]).model).toBe('planner/test-model')
  })

  it('raises when no API key is configured', () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', '')
    vi.stubEnv('GROQ_API_KEY', '')

    expect(() => GroqClient.fromEnv()).toThrow(
      'No Groq API key found in environment.'
    )
  })
})

describe('model chain', () => {
  it('puts the preferred model first and deduplicates fallbacks', () => {
    vi.stubEnv('KESTREL_GROQ_MODEL', 'openai/gpt-oss-120b')

    expect(modelChainFromEnv()).toEqual([
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b'
    ])
  })

  it('uses the default model when none is configured', () => {
    vi.stubEnv('KESTREL_GROQ_MODEL', '')

    expect(modelChainFromEnv()).toEqual([
      DEFAULT_GROQ_MODEL,
      ...GROQ_FALLBACK_MODELS
    ])
  })

  it('builds resilient clients from the environment', () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', 'gsk_test')
    vi.stubEnv('KESTREL_GROQ_MODEL', '')

    const client = resilientFromEnv()

    expect(client.models).toEqual([DEFAULT_GROQ_MODEL, ...GROQ_FALLBACK_MODELS])
  })
})

describe('ResilientLlmClient', () => {
  it('falls back to the next model on a quota error', async () => {
    const first = new GroqClient('gsk_1', { model: 'openai/gpt-oss-20b' })
    const second = new GroqClient('gsk_2', { model: 'openai/gpt-oss-120b' })
    vi.spyOn(first, 'choose').mockRejectedValue(
      new GroqQuotaError('Quota exhausted', { status: 429 })
    )
    vi.spyOn(second, 'choose').mockResolvedValue({
      calls: [{ name: 'open_app', arguments: { app: 'calc' } }],
      content: null
    })
    const resilient = new ResilientLlmClient([first, second])

    const reply = await resilient.choose('open calc', [])

    expect(reply.calls).toEqual([
      { name: 'open_app', arguments: { app: 'calc' } }
    ])
    expect(first.choose).toHaveBeenCalledTimes(1)
    expect(second.choose).toHaveBeenCalledTimes(1)
  })

  it('skips a cooling model until the cooldown expires', async () => {
    let now = 1000
    const first = new GroqClient('gsk_1', { model: 'openai/gpt-oss-20b' })
    const second = new GroqClient('gsk_2', { model: 'openai/gpt-oss-120b' })
    vi.spyOn(first, 'choose').mockRejectedValue(
      new GroqQuotaError('Quota exhausted', { status: 429 })
    )
    vi.spyOn(second, 'choose').mockResolvedValue({
      calls: [{ name: 'open_app', arguments: { app: 'calc' } }],
      content: null
    })
    const resilient = new ResilientLlmClient([first, second], {
      clock: () => now,
      sleep: async () => undefined
    })

    await resilient.choose('open calc', [])
    await resilient.choose('open calc', [])

    expect(first.choose).toHaveBeenCalledTimes(1)
    expect(second.choose).toHaveBeenCalledTimes(2)

    now += 121
    await resilient.choose('open calc', [])

    expect(first.choose).toHaveBeenCalledTimes(2)
    expect(second.choose).toHaveBeenCalledTimes(3)
  })

  it('retries a failing model with backoff before giving up', async () => {
    const only = new GroqClient('gsk_1', { model: 'openai/gpt-oss-20b' })
    vi.spyOn(only, 'choose')
      .mockRejectedValueOnce(new GroqError('Network down'))
      .mockResolvedValueOnce({
        calls: [{ name: 'open_app', arguments: { app: 'calc' } }],
        content: null
      })
    const sleep = vi.fn(async (_seconds: number) => undefined)
    const resilient = new ResilientLlmClient([only], {
      attempts: 2,
      backoff: 0.3,
      sleep
    })

    const reply = await resilient.choose('open calc', [])

    expect(reply.calls).toEqual([
      { name: 'open_app', arguments: { app: 'calc' } }
    ])
    expect(only.choose).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(0.3)
  })

  it('reports every failed model when all attempts fail', async () => {
    const only = new GroqClient('gsk_1', { model: 'openai/gpt-oss-20b' })
    vi.spyOn(only, 'choose').mockRejectedValue(new GroqError('Network down'))
    const resilient = new ResilientLlmClient([only], { attempts: 1 })

    await expect(resilient.choose('open calc', [])).rejects.toThrow(
      'All Groq models failed'
    )
  })
})
