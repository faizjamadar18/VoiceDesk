import { describe, expect, it } from 'vitest'
import {
  FakeLiveTranscriber,
  NemoStreamingTranscriber,
  type RealtimeSocket,
  type SocketEvent
} from './live-asr'

class FakeSocket implements RealtimeSocket {
  binaryType = 'blob'
  sent: (string | ArrayBufferLike | ArrayBufferView)[] = []
  closed: number | null = null
  private readonly listeners = new Map<string, Set<(event: SocketEvent) => void>>()

  addEventListener(type: string, listener: (event: SocketEvent) => void): void {
    const bucket = this.listeners.get(type) ?? new Set()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    this.sent.push(data)
  }

  close(code = 1000): void {
    this.closed = code
  }

  emit(type: string, event: SocketEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function setup() {
  const socket = new FakeSocket()
  const transcriber = new NemoStreamingTranscriber({
    baseUrl: 'http://127.0.0.1:8090',
    socketFactory: () => socket
  })
  return { socket, transcriber }
}

describe('NemoStreamingTranscriber', () => {
  it('streams PCM16 and turns server deltas into partials and a final transcript', async () => {
    const { socket, transcriber } = setup()
    const partials: string[] = []
    const turn = transcriber.startTurn({ onPartial: (text) => partials.push(text) })

    turn.push(new Float32Array([0, 0.5, -0.5]), 16_000)
    expect(socket.sent).toHaveLength(0)

    socket.emit('open')
    const update = JSON.parse(socket.sent[0] as string)
    expect(update).toEqual({
      type: 'session.update',
      session: { sample_rate: 16_000, language: 'en', automatic_punctuation: true }
    })
    expect(socket.sent[1]).toBeInstanceOf(Uint8Array)
    expect((socket.sent[1] as Uint8Array).byteLength).toBe(6)

    const delta = (text: string): void => {
      socket.emit('message', {
        data: JSON.stringify({
          type: 'conversation.item.input_audio_transcription.delta',
          delta: text
        })
      })
    }
    delta('open')
    delta(' notepad')
    expect(partials).toEqual(['open', 'open notepad'])

    const finished = turn.finish()
    await Promise.resolve()
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'input_audio_buffer.commit' }))

    socket.emit('message', {
      data: JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Open notepad.'
      })
    })
    socket.emit('message', {
      data: JSON.stringify({ type: 'input_audio_buffer.committed' })
    })

    await expect(finished).resolves.toMatchObject({
      text: 'Open notepad.',
      provider: 'nemo-speech'
    })
    expect(socket.closed).not.toBeNull()
  })

  it('rejects the final transcript when the server reports an error', async () => {
    const { socket, transcriber } = setup()
    const turn = transcriber.startTurn()
    turn.push(new Float32Array([0.1]), 16_000)
    socket.emit('open')

    const finished = turn.finish()
    const assertion = expect(finished).rejects.toThrow('model failed')

    socket.emit('message', {
      data: JSON.stringify({
        type: 'error',
        error: { message: 'model failed', code: 'internal_error' }
      })
    })

    await assertion
  })

  it('closes the socket when a turn is cancelled', () => {
    const { socket, transcriber } = setup()
    const turn = transcriber.startTurn()
    turn.push(new Float32Array([0.1]), 16_000)
    socket.emit('open')

    turn.cancel()

    expect(socket.closed).not.toBeNull()
  })
})

describe('FakeLiveTranscriber', () => {
  it('reveals words as audio arrives and returns the full sentence on finish', async () => {
    const transcriber = new FakeLiveTranscriber('open notepad now', 500)
    const partials: string[] = []
    const turn = transcriber.startTurn({ onPartial: (text) => partials.push(text) })

    turn.push(new Float32Array(8_000), 16_000)

    expect(partials).toEqual(['open'])
    await expect(turn.finish()).resolves.toMatchObject({ text: 'open notepad now' })
  })
})
