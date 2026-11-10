import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpActionClient } from './action-client'

describe('HttpActionClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts the transcript and returns the action response', async () => {
    let seenUrl = ''
    let seenInit: RequestInit | undefined
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765/',
      fetch: async (url, init) => {
        seenUrl = url
        seenInit = init
        return new Response(
          JSON.stringify({
            status: 'ok',
            action: 'open_app',
            message: 'Opening Notepad.',
            text: null,
            dryRun: false
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })

    const result = await client.act('open notepad')

    expect(seenUrl).toBe('http://127.0.0.1:8765/act')
    expect(seenInit?.method).toBe('POST')
    expect(seenInit?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(seenInit?.body).toBe(JSON.stringify({ transcript: 'open notepad' }))
    expect(result.action).toBe('open_app')
    expect(result.message).toBe('Opening Notepad.')
  })

  it('includes the backend detail when the request fails', async () => {
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: async () =>
        new Response(JSON.stringify({ detail: 'Notepad is not installed.' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        })
    })

    await expect(client.act('open notepad')).rejects.toThrow(
      'Action request failed (502): Notepad is not installed.'
    )
  })

  it('times out a hanging request', async () => {
    vi.useFakeTimers()
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      timeoutMs: 50,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    })

    const pending = client.act('open notepad')
    const assertion = expect(pending).rejects.toThrow('Action request timed out after 50ms')
    await vi.advanceTimersByTimeAsync(60)

    await assertion
  })

  it('posts an approval decision for a pending write', async () => {
    let seenUrl = ''
    let seenBody = ''
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765/',
      fetch: async (url, init) => {
        seenUrl = url
        seenBody = String(init.body)
        return new Response(
          JSON.stringify({
            status: 'ok',
            action: 'delete_file',
            message: 'Moved "report.pdf" to the Recycle Bin.',
            dryRun: false
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })

    const result = await client.confirm('plan-1', true)

    expect(seenUrl).toBe('http://127.0.0.1:8765/act/confirm')
    expect(seenBody).toBe(JSON.stringify({ planId: 'plan-1', approved: true }))
    expect(result.message).toContain('Recycle Bin')
  })

  it('posts the cancellation of a pending write', async () => {
    let seenBody = ''
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: async (_url, init) => {
        seenBody = String(init.body)
        return new Response(
          JSON.stringify({ status: 'cancelled', action: 'none', message: 'Cancelled.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })

    const result = await client.confirm('plan-2', false)

    expect(seenBody).toBe(JSON.stringify({ planId: 'plan-2', approved: false }))
    expect(result.status).toBe('cancelled')
  })

  it('posts an undo for a completed write', async () => {
    let seenUrl = ''
    let seenBody = ''
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: async (url, init) => {
        seenUrl = url
        seenBody = String(init.body)
        return new Response(
          JSON.stringify({ status: 'ok', action: 'undo', message: 'Undone.', dryRun: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })

    const result = await client.undo('plan-3')

    expect(seenUrl).toBe('http://127.0.0.1:8765/act/undo')
    expect(seenBody).toBe(JSON.stringify({ planId: 'plan-3' }))
    expect(result.action).toBe('undo')
  })

  it('surfaces the backend detail when a decision fails', async () => {
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: async () =>
        new Response(JSON.stringify({ detail: 'Unknown or expired plan.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
    })

    await expect(client.confirm('plan-9', true)).rejects.toThrow(
      'Action request failed (404): Unknown or expired plan.'
    )
  })

  it('posts a screen question to /screen/ask with the expected body', async () => {
    let seenUrl = ''
    let seenBody = ''
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765/',
      fetch: async (url, init) => {
        seenUrl = url
        seenBody = String(init.body)
        return new Response(
          JSON.stringify({
            answer: 'The error says the file is missing.',
            model: 'qwen/qwen3.8-27b',
            latencyMs: 840
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })

    const result = await client.askScreen({
      question: 'What does this error mean?',
      imageBase64: 'iVBORw0KGgo=',
      marked: true
    })

    expect(seenUrl).toBe('http://127.0.0.1:8765/screen/ask')
    expect(seenBody).toBe(
      JSON.stringify({
        question: 'What does this error mean?',
        image: 'iVBORw0KGgo=',
        marked: true
      })
    )
    expect(result.answer).toContain('file is missing')
    expect(result.latencyMs).toBe(840)
  })

  it('uses a friendly timeout for screen reading', async () => {
    vi.useFakeTimers()
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    })

    const pending = client.askScreen({
      question: 'What is this?',
      imageBase64: 'iVBORw0KGgo=',
      marked: false
    })
    const assertion = expect(pending).rejects.toThrow('Screen reading timed out. Try again.')
    await vi.advanceTimersByTimeAsync(45_001)

    await assertion
  })

  it('surfaces the backend detail when a screen request fails', async () => {
    const client = new HttpActionClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetch: async () =>
        new Response(JSON.stringify({ detail: 'Image is too large.' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' }
        })
    })

    await expect(
      client.askScreen({
        question: 'What is this?',
        imageBase64: 'iVBORw0KGgo=',
        marked: false
      })
    ).rejects.toThrow("Couldn't read your screen: Image is too large.")
  })
})
