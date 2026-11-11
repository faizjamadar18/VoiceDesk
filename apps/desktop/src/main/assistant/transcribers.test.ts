import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONTENT_TYPE_EXTENSIONS,
  DEFAULT_FAKE_TRANSCRIPT,
  FakeTranscriber,
  GROQ_ENDPOINT,
  GROQ_MODEL,
  GroqTranscriber,
  MissingProviderKeyError,
  TranscriptionProviderError,
  filenameFor
} from './transcribers'
import type { TranscriptionFetch } from './transcribers'

const AUDIO = Uint8Array.from([0x66, 0x61, 0x6b, 0x65, 0x2d, 0x61, 0x75, 0x64, 0x69, 0x6f])

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
): { fetch: TranscriptionFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetch: TranscriptionFetch = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return handler(call, calls.length - 1)
  }
  return { fetch, calls }
}

function formOf(call: FetchCall): FormData {
  if (!(call.init.body instanceof FormData)) {
    throw new Error('expected a FormData request body')
  }
  return call.init.body
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('filenameFor', () => {
  it('maps content types to extensions', () => {
    expect(filenameFor('audio/webm')).toBe('audio.webm')
    expect(filenameFor('audio/webm; codecs=opus')).toBe('audio.webm')
    expect(filenameFor('AUDIO/MPEG')).toBe('audio.mp3')
    expect(filenameFor('application/octet-stream')).toBe('audio.bin')
    expect(CONTENT_TYPE_EXTENSIONS['audio/x-m4a']).toBe('m4a')
  })
})

describe('FakeTranscriber', () => {
  it('returns the default transcript', async () => {
    const transcriber = new FakeTranscriber()

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe(
      DEFAULT_FAKE_TRANSCRIPT
    )
    expect(transcriber.name).toBe('fake')
  })

  it('returns a configured transcript', async () => {
    const transcriber = new FakeTranscriber('Hello from the fake transcriber.')

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe(
      'Hello from the fake transcriber.'
    )
  })

  it('reads the transcript and delay from the environment', async () => {
    vi.stubEnv('KESTREL_FAKE_TRANSCRIPT', 'Configured transcript.')
    vi.stubEnv('KESTREL_FAKE_DELAY_MS', '0')

    const transcriber = FakeTranscriber.fromEnv()

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe(
      'Configured transcript.'
    )
  })

  it('falls back to the default transcript when the env value is empty', async () => {
    vi.stubEnv('KESTREL_FAKE_TRANSCRIPT', '')
    vi.stubEnv('KESTREL_FAKE_DELAY_MS', '')

    const transcriber = FakeTranscriber.fromEnv()

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe(
      DEFAULT_FAKE_TRANSCRIPT
    )
  })

  it('ignores an invalid delay', async () => {
    vi.stubEnv('KESTREL_FAKE_DELAY_MS', 'not-a-number')

    const transcriber = FakeTranscriber.fromEnv()

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe(
      DEFAULT_FAKE_TRANSCRIPT
    )
  })
})

describe('GroqTranscriber', () => {
  it('sends the expected multipart request', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ text: 'Groq transcript.' })
    )
    const transcriber = new GroqTranscriber('test-key', { fetch })

    const text = await transcriber.transcribe(AUDIO, 'audio/webm')

    expect(text).toBe('Groq transcript.')
    expect(transcriber.name).toBe('groq')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(GROQ_ENDPOINT)
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(Object.keys(headers)).toEqual(['Authorization'])

    const form = formOf(calls[0])
    const file = form.get('file')
    expect(file).toBeInstanceOf(File)
    if (!(file instanceof File)) {
      throw new Error('missing file entry')
    }
    expect(file.name).toBe('audio.webm')
    expect(file.type).toBe('audio/webm')
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(
      Array.from(AUDIO)
    )
    expect(form.get('model')).toBe(GROQ_MODEL)
    expect(GROQ_MODEL).toBe('whisper-large-v3-turbo')
  })

  it('derives the filename from parameterized content types', async () => {
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ text: 'ok' })
    )
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await transcriber.transcribe(AUDIO, 'audio/webm; codecs=opus')
    await transcriber.transcribe(AUDIO, 'application/octet-stream')

    const first = formOf(calls[0]).get('file')
    const second = formOf(calls[1]).get('file')
    expect(first).toBeInstanceOf(File)
    expect(second).toBeInstanceOf(File)
    if (!(first instanceof File) || !(second instanceof File)) {
      throw new Error('missing file entry')
    }
    expect(first.name).toBe('audio.webm')
    expect(second.name).toBe('audio.bin')
  })

  it('returns an empty transcript when the provider sends one', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ text: '' }))
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(transcriber.transcribe(AUDIO, 'audio/wav')).resolves.toBe('')
  })

  it('maps a provider HTTP error', async () => {
    const { fetch, calls } = recordingFetch(
      () => new Response('nope', { status: 500 })
    )
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(
      transcriber.transcribe(AUDIO, 'audio/wav')
    ).rejects.toThrow('Groq transcription failed with HTTP 500.')
    expect(calls).toHaveLength(1)
  })

  it('rejects invalid JSON', async () => {
    const { fetch } = recordingFetch(
      () => new Response('not json', { status: 200 })
    )
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(
      transcriber.transcribe(AUDIO, 'audio/wav')
    ).rejects.toThrow('Groq returned an invalid JSON response.')
  })

  it('rejects a payload without transcript text', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ text: 42 }))
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(
      transcriber.transcribe(AUDIO, 'audio/wav')
    ).rejects.toThrow('Groq returned no transcript text.')
  })

  it('wraps network failures', async () => {
    const fetch: TranscriptionFetch = async () => {
      throw new TypeError('connection refused')
    }
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(
      transcriber.transcribe(AUDIO, 'audio/wav')
    ).rejects.toThrow('Groq transcription request failed (TypeError).')
  })

  it('reads and trims GROQ_API_KEY from the environment', async () => {
    vi.stubEnv('GROQ_API_KEY', ' test-key ')
    const { fetch, calls } = recordingFetch(() =>
      jsonResponse({ text: 'Groq transcript.' })
    )

    const transcriber = GroqTranscriber.fromEnv({ fetch })
    await transcriber.transcribe(AUDIO, 'audio/wav')

    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-key')
  })

  it('raises when GROQ_API_KEY is missing', () => {
    vi.stubEnv('GROQ_API_KEY', '')

    let error: unknown
    try {
      GroqTranscriber.fromEnv()
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(MissingProviderKeyError)
    const message = (error as Error).message
    expect(message).toContain('GROQ_API_KEY')
    expect(message).toContain('KESTREL_ASR_PROVIDER=fake')
  })

  it('wraps provider failures in TranscriptionProviderError', async () => {
    const { fetch } = recordingFetch(
      () => new Response('nope', { status: 502 })
    )
    const transcriber = new GroqTranscriber('test-key', { fetch })

    await expect(
      transcriber.transcribe(AUDIO, 'audio/wav')
    ).rejects.toBeInstanceOf(TranscriptionProviderError)
  })
})
