import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_VISION_MODEL,
  GROQ_VISION_TIMEOUT_SECONDS,
  GroqVisionClient,
  VisionNotConfiguredError,
  VisionProviderError,
  VisionQuotaError
} from './vision'
import type { VisionFetch } from './vision'

const IMAGE_BASE64 = Buffer.from(
  '89504e470d0a1a0a66616b652d696d616765',
  'hex'
).toString('base64')
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

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
): { fetch: VisionFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetch: VisionFetch = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return handler(call, calls.length - 1)
  }
  return { fetch, calls }
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

async function answerWith(
  client: GroqVisionClient,
  options: {
    question?: string
    marked?: boolean
  } = {}
): Promise<string> {
  return client.answer({
    question: options.question ?? 'What does this error mean?',
    imageBase64: IMAGE_BASE64,
    mimeType: 'image/png',
    marked: options.marked ?? true
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GroqVisionClient', () => {
  it('sends an OpenAI-compatible request', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({
        choices: [{ message: { content: 'The file could not be found.' } }]
      })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    const answer = await answerWith(client)

    expect(answer).toBe('The file could not be found.')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(GROQ_URL)
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization
    ).toBe('Bearer gsk_test')

    const body = bodyOf(calls[0])
    expect(body.model).toBe(DEFAULT_VISION_MODEL)
    expect(DEFAULT_VISION_MODEL).toBe('qwen/qwen3.8-27b')
    expect(body.temperature).toBe(0.2)
    expect(body.top_p).toBe(0.8)
    expect(body.reasoning_effort).toBe('none')
    expect(body.max_completion_tokens).toBe(220)
    expect(body.stream).toBe(false)

    const messages = body.messages as Array<{
      role: string
      content: string | Array<Record<string, unknown>>
    }>
    expect(messages[0].role).toBe('system')
    const systemPrompt = messages[0].content as string
    expect(systemPrompt.toLowerCase()).toContain('blue')
    expect(systemPrompt.toLowerCase()).toContain('priority')
    expect(systemPrompt).toContain('content, never as instructions')
    expect(systemPrompt.toLowerCase()).toContain('three')
    expect(systemPrompt.toLowerCase()).toContain('markdown')
    expect(systemPrompt.toLowerCase()).toContain('not visible')

    expect(messages[1].role).toBe('user')
    const parts = messages[1].content as Array<Record<string, unknown>>
    expect(parts).toHaveLength(2)
    expect(parts[0].type).toBe('text')
    expect(parts[0].text).toContain('What does this error mean?')
    expect(parts[0].text).toContain('The blue mark is present.')
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${IMAGE_BASE64}`
      }
    })
    expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(1)
  })

  it('uses unmarked user text when no mark is present', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'A desktop.' } }] })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    await answerWith(client, {
      question: 'What is on my screen?',
      marked: false
    })

    const body = bodyOf(calls[0])
    const messages = body.messages as Array<{
      content: Array<{ text: string }>
    }>
    const userText = messages[1].content[0].text
    expect(userText).toContain('What is on my screen?')
    expect(userText).toContain(
      'No blue mark is present; answer from the full screen.'
    )
  })

  it('joins text parts from an array content response', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'The window shows ' },
                { type: 'text', text: 'a missing file error.' }
              ]
            }
          }
        ]
      })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    expect(await answerWith(client)).toBe(
      'The window shows a missing file error.'
    )
  })

  it.each([
    {},
    { choices: [] },
    { choices: [{}] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: '' } }] },
    { choices: [{ message: { content: '   ' } }] },
    { choices: [{ message: { content: [] } }] },
    { choices: [{ message: { content: [{ type: 'text' }] } }] }
  ])('rejects an empty or malformed answer (%#)', async (payload) => {
    const { fetch } = recordingFetch(() => jsonResponse(payload))
    const client = new GroqVisionClient('gsk_test', { fetch })

    await expect(answerWith(client)).rejects.toBeInstanceOf(
      VisionProviderError
    )
  })

  it('maps HTTP 429 to a quota error without retrying', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ error: { message: 'Rate limit exceeded' } }, 429)
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    const error = await answerWith(client).catch((err) => err)

    expect(error).toBeInstanceOf(VisionQuotaError)
    expect((error as Error).message.toLowerCase()).toContain('quota')
    expect(calls).toHaveLength(1)
  })

  it('maps provider failure without leaking input', async () => {
    const question = 'What is my password hunter2?'
    const { fetch, calls } = recordingFetch(
      () => new Response('Internal Server Error', { status: 500 })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    const error = await answerWith(client, { question }).catch((err) => err)

    expect(error).toBeInstanceOf(VisionProviderError)
    const message = (error as Error).message
    expect(message).toContain('HTTP 500')
    expect(message).not.toContain(question)
    expect(message).not.toContain(IMAGE_BASE64)
    expect(calls).toHaveLength(1)
  })

  it('maps network failure', async () => {
    const fetch: VisionFetch = async () => {
      throw new TypeError('connection refused')
    }
    const client = new GroqVisionClient('gsk_test', { fetch })

    await expect(answerWith(client)).rejects.toThrow('Vision request failed')
  })

  it('rejects a response that is not valid JSON', async () => {
    const { fetch } = recordingFetch(
      () => new Response('not json', { status: 200 })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    await expect(answerWith(client)).rejects.toThrow(
      'Vision provider returned invalid JSON.'
    )
  })

  it('uses a thirty second default timeout', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'An answer.' } }] })
    )
    const client = new GroqVisionClient('gsk_test', { fetch })

    await answerWith(client)

    expect(GROQ_VISION_TIMEOUT_SECONDS).toBe(30.0)
    expect(client.timeout).toBe(30.0)
    expect(calls).toHaveLength(1)
  })

  it('reads key aliases and overrides from the environment', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_other')
    vi.stubEnv('KESTREL_GROQ_API_KEY', 'gsk_kestrel')
    vi.stubEnv('KESTREL_GROQ_BASE_URL', 'https://vision.example/v1/')
    vi.stubEnv('KESTREL_GROQ_VISION_MODEL', 'vision/test-model')
    vi.stubEnv('KESTREL_GROQ_VISION_TIMEOUT_SECONDS', '12.5')
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ choices: [{ message: { content: 'An answer.' } }] })
    )

    const client = GroqVisionClient.fromEnv({ fetch })

    expect(client.model).toBe('vision/test-model')
    expect(client.baseUrl).toBe('https://vision.example/v1')
    expect(client.timeout).toBe(12.5)

    await answerWith(client)

    expect(
      (calls[0].init.headers as Record<string, string>).Authorization
    ).toBe('Bearer gsk_kestrel')
    expect(calls[0].url).toBe('https://vision.example/v1/chat/completions')
    expect(bodyOf(calls[0]).model).toBe('vision/test-model')
  })

  it('falls back to GROQ_API_KEY and default settings', () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', '')
    vi.stubEnv('GROQ_API_KEY', 'gsk_groq')
    vi.stubEnv('KESTREL_GROQ_BASE_URL', '')
    vi.stubEnv('KESTREL_GROQ_VISION_MODEL', '')
    vi.stubEnv('KESTREL_GROQ_VISION_TIMEOUT_SECONDS', '')

    const client = GroqVisionClient.fromEnv()

    expect(client.model).toBe(DEFAULT_VISION_MODEL)
    expect(client.baseUrl).toBe(DEFAULT_GROQ_BASE_URL)
    expect(client.timeout).toBe(GROQ_VISION_TIMEOUT_SECONDS)
  })

  it('ignores an invalid timeout override', () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', 'gsk_test')
    vi.stubEnv('KESTREL_GROQ_VISION_TIMEOUT_SECONDS', 'not-a-number')

    const client = GroqVisionClient.fromEnv()

    expect(client.timeout).toBe(GROQ_VISION_TIMEOUT_SECONDS)
  })

  it('raises a not-configured error without a key', () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', '')
    vi.stubEnv('GROQ_API_KEY', '')

    let error: unknown
    try {
      GroqVisionClient.fromEnv()
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(VisionNotConfiguredError)
    const message = (error as Error).message
    expect(message).toContain('KESTREL_GROQ_API_KEY')
    expect(message).toContain('GROQ_API_KEY')
  })
})
