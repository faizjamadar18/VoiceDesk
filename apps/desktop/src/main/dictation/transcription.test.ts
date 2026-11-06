import { describe, expect, it } from 'vitest'
import { HttpTranscriptionClient, type FetchLike } from './transcription'

describe('HttpTranscriptionClient', () => {
  it('posts raw audio to /transcribe and returns the backend result', async () => {
    const audio = new Uint8Array([1, 2, 3, 4])
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return new Response(
        JSON.stringify({ text: 'Hello world', latencyMs: 42, provider: 'test-provider' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const client = new HttpTranscriptionClient({
      baseUrl: 'http://localhost:8000',
      fetch: fakeFetch
    })

    const result = await client.transcribe({ audio, mimeType: 'audio/webm' })

    expect(result).toEqual({
      text: 'Hello world',
      latencyMs: 42,
      provider: 'test-provider'
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://localhost:8000/transcribe')
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('audio/webm')
    expect(calls[0].init.body).toBe(audio)
  })

  it('throws the backend detail when the server rejects the audio', async () => {
    const client = new HttpTranscriptionClient({
      baseUrl: 'http://localhost:8000',
      fetch: async () =>
        new Response(JSON.stringify({ detail: 'Audio is too short' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        })
    })

    await expect(
      client.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })
    ).rejects.toThrow('Audio is too short')
  })

  it('aborts the request when it exceeds the timeout', async () => {
    let aborted = false
    const slowFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const fallback = setTimeout(() => reject(new Error('fetch is still waiting')), 100)
        init.signal?.addEventListener('abort', () => {
          aborted = true
          clearTimeout(fallback)
          reject(new Error('aborted'))
        })
      })
    const client = new HttpTranscriptionClient({
      baseUrl: 'http://localhost:8000',
      fetch: slowFetch,
      timeoutMs: 10
    })

    await expect(
      client.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })
    ).rejects.toThrow('timed out after 10ms')
    expect(aborted).toBe(true)
  })
})
