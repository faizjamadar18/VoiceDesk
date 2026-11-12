import { describe, expect, it } from 'vitest'
import { IPC } from '../shared/types'
import type { SpeechChunk } from './speech-synthesizer'
import { SpeechStreamBridge } from './speech-stream'

interface Sent {
  channel: string
  payload: unknown
}

function recorder(): { sent: Sent[]; send: (channel: string, payload: unknown) => void } {
  const sent: Sent[] = []
  return { sent, send: (channel, payload) => sent.push({ channel, payload }) }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function chunk(index: number, text: string, byte: number): SpeechChunk {
  return { index, text, audio: new Uint8Array([byte]) }
}

describe('SpeechStreamBridge', () => {
  it('forwards chunks in order with the request id, then stream-done', async () => {
    const { sent, send } = recorder()
    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        yield chunk(0, 'one', 1)
        yield chunk(1, 'two', 2)
      },
      send
    })

    bridge.start('req-1', 'one two')
    await flush()

    expect(sent).toEqual([
      {
        channel: IPC.speechChunk,
        payload: { requestId: 'req-1', index: 0, text: 'one', audio: new Uint8Array([1]) }
      },
      {
        channel: IPC.speechChunk,
        payload: { requestId: 'req-1', index: 1, text: 'two', audio: new Uint8Array([2]) }
      },
      { channel: IPC.speechStreamDone, payload: { requestId: 'req-1' } }
    ])
  })

  it('sends stream-done after the last chunk', async () => {
    const { sent, send } = recorder()
    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        yield chunk(0, 'only', 1)
      },
      send
    })

    bridge.start('req-1', 'only')
    await flush()

    expect(sent.map((entry) => entry.channel)).toEqual([IPC.speechChunk, IPC.speechStreamDone])
  })

  it('sends stream-error with the message when the generator throws', async () => {
    const { sent, send } = recorder()
    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        yield chunk(0, 'one', 1)
        throw new Error('boom')
      },
      send
    })

    bridge.start('req-1', 'one')
    await flush()

    expect(sent).toEqual([
      {
        channel: IPC.speechChunk,
        payload: { requestId: 'req-1', index: 0, text: 'one', audio: new Uint8Array([1]) }
      },
      { channel: IPC.speechStreamError, payload: { requestId: 'req-1', message: 'boom' } }
    ])
    expect(sent.some((entry) => entry.channel === IPC.speechStreamDone)).toBe(false)
  })

  it('sends stream-done for an empty stream', async () => {
    const { sent, send } = recorder()
    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {},
      send
    })

    bridge.start('req-1', 'nothing')
    await flush()

    expect(sent).toEqual([{ channel: IPC.speechStreamDone, payload: { requestId: 'req-1' } }])
  })

  it('cancel stops further sends and closes the iterator', async () => {
    const { sent, send } = recorder()
    let finalized = false
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })

    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        try {
          yield chunk(0, 'one', 1)
          await gate
          yield chunk(1, 'two', 2)
        } finally {
          finalized = true
        }
      },
      send
    })

    bridge.start('req-1', 'one two')
    await flush()
    expect(sent).toHaveLength(1)

    bridge.cancel('req-1')
    releaseGate()
    await flush()

    expect(finalized).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent.some((entry) => entry.channel === IPC.speechStreamDone)).toBe(false)
  })

  it('ignores a cancel for a different request', async () => {
    const { sent, send } = recorder()
    let finalized = false
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })

    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        try {
          yield chunk(0, 'one', 1)
          await gate
          yield chunk(1, 'two', 2)
        } finally {
          finalized = true
        }
      },
      send
    })

    bridge.start('req-1', 'one two')
    await flush()

    bridge.cancel('other')
    releaseGate()
    await flush()

    expect(finalized).toBe(true)
    expect(sent.some((entry) => entry.channel === IPC.speechStreamDone)).toBe(true)
  })

  it('starting a new stream cancels the running one', async () => {
    const { sent, send } = recorder()
    let firstFinalized = false
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })

    const bridge = new SpeechStreamBridge({
      synthesizeStream: (text) => {
        if (text === 'first') {
          return (async function* () {
            try {
              yield chunk(0, 'first-a', 1)
              await gate
              yield chunk(1, 'first-b', 2)
            } finally {
              firstFinalized = true
            }
          })()
        }
        return (async function* () {
          yield chunk(0, 'second-a', 3)
        })()
      },
      send
    })

    bridge.start('req-1', 'first')
    await flush()
    expect(sent).toHaveLength(1)

    bridge.start('req-2', 'second')
    releaseGate()
    await flush()

    expect(firstFinalized).toBe(true)
    expect(sent).toEqual([
      {
        channel: IPC.speechChunk,
        payload: { requestId: 'req-1', index: 0, text: 'first-a', audio: new Uint8Array([1]) }
      },
      {
        channel: IPC.speechChunk,
        payload: { requestId: 'req-2', index: 0, text: 'second-a', audio: new Uint8Array([3]) }
      },
      { channel: IPC.speechStreamDone, payload: { requestId: 'req-2' } }
    ])
  })

  it('never throws out of start and reports a synchronous failure', async () => {
    const { sent, send } = recorder()
    const bridge = new SpeechStreamBridge({
      synthesizeStream: () => {
        throw new Error('sync boom')
      },
      send
    })

    expect(() => bridge.start('req-1', 'x')).not.toThrow()
    await flush()

    expect(sent).toEqual([
      { channel: IPC.speechStreamError, payload: { requestId: 'req-1', message: 'sync boom' } }
    ])
  })

  it('cancelAll stops the running stream', async () => {
    const { sent, send } = recorder()
    let finalized = false
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })

    const bridge = new SpeechStreamBridge({
      synthesizeStream: async function* () {
        try {
          yield chunk(0, 'one', 1)
          await gate
          yield chunk(1, 'two', 2)
        } finally {
          finalized = true
        }
      },
      send
    })

    bridge.start('req-1', 'one two')
    await flush()

    bridge.cancelAll()
    releaseGate()
    await flush()

    expect(finalized).toBe(true)
    expect(sent).toHaveLength(1)
  })
})
