import { describe, expect, it } from 'vitest'
import {
  SpeechPlayer,
  type DecodedSpeechAudio,
  type SpeechAudioSink
} from './speech-player'

/** Resolves after the microtask queue drains. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface ScheduledBuffer {
  handle: unknown
  at: number
  onEnded: () => void
}

class FakeSink implements SpeechAudioSink {
  clock = 0
  readonly scheduled: ScheduledBuffer[] = []
  cancels = 0
  private readonly gates: Array<Deferred<DecodedSpeechAudio>> = []
  private gateRead = 0
  private readonly failures: unknown[] = []

  /** Hold the decode for this call until `release(index)` is called. */
  gateDecode(): void {
    this.gates.push(deferred<DecodedSpeechAudio>())
  }

  failDecode(error: unknown): void {
    this.failures.push(error)
  }

  release(index: number, duration: number): void {
    const gate = this.gates[index]
    gate.resolve({ handle: `gated-${index}`, duration })
  }

  now(): number {
    return this.clock
  }

  decode(_bytes: Uint8Array): Promise<DecodedSpeechAudio> {
    const failure = this.failures.shift()
    if (failure) return Promise.reject(failure)
    const gate = this.gates[this.gateRead]
    if (gate) {
      this.gateRead += 1
      return gate.promise
    }
    return Promise.resolve({ handle: 'decoded', duration: 1 })
  }

  schedule(handle: unknown, at: number, onEnded: () => void): void {
    this.scheduled.push({ handle, at, onEnded })
  }

  cancel(): void {
    this.cancels += 1
  }

  fireEnded(index: number): void {
    this.scheduled[index].onEnded()
  }
}

const chunk = (): Uint8Array => new Uint8Array([1])

describe('SpeechPlayer', () => {
  it('schedules contiguous chunks with a small lead', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    player.enqueue(chunk())
    player.enqueue(chunk())
    player.enqueue(chunk())
    await flush()

    expect(sink.scheduled.map((entry) => entry.at)).toEqual([0.05, 1.05, 2.05])
    expect(player.lateJoins).toBe(0)
  })

  it('keeps arrival order and waits for the first decode', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    sink.gateDecode()
    sink.gateDecode()
    player.enqueue(chunk())
    player.enqueue(chunk())
    await flush()

    // The first decode holds the slot; nothing may be scheduled yet.
    expect(sink.scheduled).toHaveLength(0)

    sink.release(0, 1)
    await flush()
    expect(sink.scheduled).toHaveLength(1)
    expect(sink.scheduled[0].handle).toBe('gated-0')

    sink.release(1, 1)
    await flush()
    expect(sink.scheduled).toHaveLength(2)
    expect(sink.scheduled[1].at).toBe(1.05)
  })

  it('counts a late join and still schedules after the queue ran dry', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    player.enqueue(chunk())
    await flush()
    expect(sink.scheduled[0].at).toBe(0.05)

    sink.clock = 5
    player.enqueue(chunk())
    await flush()

    expect(sink.scheduled).toHaveLength(2)
    expect(sink.scheduled[1].at).toBe(5.05)
    expect(player.lateJoins).toBe(1)
  })

  it('resolves finished() only after every onEnded fires', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    player.enqueue(chunk())
    player.enqueue(chunk())
    player.enqueue(chunk())
    await flush()

    let settled = false
    void player.finished().then(() => {
      settled = true
    })

    sink.fireEnded(0)
    await flush()
    expect(settled).toBe(false)

    sink.fireEnded(1)
    await flush()
    expect(settled).toBe(false)

    sink.fireEnded(2)
    await flush()
    expect(settled).toBe(true)
  })

  it('resolves finished() immediately when nothing was enqueued', async () => {
    const player = new SpeechPlayer(new FakeSink())
    await expect(player.finished()).resolves.toBeUndefined()
  })

  it('cancel resolves finished() immediately and ignores late onEnded', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    player.enqueue(chunk())
    await flush()

    let settled = false
    void player.finished().then(() => {
      settled = true
    })

    player.cancel()
    await flush()
    expect(settled).toBe(true)
    expect(sink.cancels).toBe(1)

    expect(() => sink.fireEnded(0)).not.toThrow()
    await expect(player.finished()).resolves.toBeUndefined()
  })

  it('skips a failed decode without hanging finished()', async () => {
    const sink = new FakeSink()
    const player = new SpeechPlayer(sink)

    sink.failDecode(new Error('bad audio'))
    player.enqueue(chunk())
    player.enqueue(chunk())
    await flush()

    expect(sink.scheduled).toHaveLength(1)
    expect(player.decodeFailures).toBe(1)
    expect(player.lateJoins).toBe(0)

    let settled = false
    void player.finished().then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)

    sink.fireEnded(0)
    await flush()
    expect(settled).toBe(true)
  })
})