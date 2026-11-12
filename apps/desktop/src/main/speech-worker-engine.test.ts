import { describe, expect, it, vi } from 'vitest'
import type { SpeechSynthesizerEngine } from './speech-synthesizer'
import { WorkerSpeechEngine, type WorkerLike } from './speech-worker-engine'

class FakeWorker implements WorkerLike {
  readonly messages: unknown[] = []
  terminated = false
  private readonly messageListeners: Array<(message: unknown) => void> = []
  private readonly errorListeners: Array<(error: Error) => void> = []

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  on(event: 'message', listener: (message: unknown) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(
    event: 'message' | 'error',
    listener: ((message: unknown) => void) | ((error: Error) => void)
  ): void {
    if (event === 'message') {
      this.messageListeners.push(listener as (message: unknown) => void)
    } else {
      this.errorListeners.push(listener as (error: Error) => void)
    }
  }

  terminate(): Promise<number> {
    this.terminated = true
    return Promise.resolve(0)
  }

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message)
    }
  }

  emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error)
    }
  }
}

function streamIdOf(worker: FakeWorker): string {
  const message = worker.messages.find(
    (candidate) => (candidate as { type?: string }).type === 'stream'
  ) as { id: string } | undefined
  if (!message) {
    throw new Error('no stream message was posted')
  }
  return message.id
}

describe('WorkerSpeechEngine.stream', () => {
  it('yields chunks in order and ends on done', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker })

    const iterator = engine.stream('hello world')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    const id = streamIdOf(worker)
    expect(worker.messages).toContainEqual({
      type: 'stream',
      id,
      text: 'hello world',
      voice: undefined,
      speed: undefined
    })

    worker.emitMessage({ type: 'chunk', id, index: 0, text: 'hello', audio: new Uint8Array([1]) })
    worker.emitMessage({ type: 'chunk', id, index: 1, text: 'world', audio: new Uint8Array([2]) })
    worker.emitMessage({ type: 'done', id })

    await expect(firstPromise).resolves.toEqual({
      value: { text: 'hello', audio: new Uint8Array([1]) },
      done: false
    })
    await expect(iterator.next()).resolves.toEqual({
      value: { text: 'world', audio: new Uint8Array([2]) },
      done: false
    })
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('passes voice and speed through to the worker', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker })

    const iterator = engine.stream('hi', { voice: 'af_bella', speed: 1.25 })[Symbol.asyncIterator]()
    const pending = iterator.next()
    const id = streamIdOf(worker)
    expect(worker.messages).toContainEqual({
      type: 'stream',
      id,
      text: 'hi',
      voice: 'af_bella',
      speed: 1.25
    })

    worker.emitMessage({ type: 'done', id })
    await pending
  })

  it('posts cancel when the consumer stops early', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    const id = streamIdOf(worker)
    worker.emitMessage({ type: 'chunk', id, index: 0, text: 'hello', audio: new Uint8Array([1]) })
    await firstPromise

    await iterator.return?.(undefined)

    expect(worker.messages).toContainEqual({ type: 'cancel', id })
  })

  it('rejects when an error message arrives for the stream', async () => {
    const worker = new FakeWorker()
    const fallbackStream = vi.fn(async function* () {
      yield { text: 'fallback', audio: new Uint8Array([9]) }
    })
    const fallback: SpeechSynthesizerEngine = { synthesize: vi.fn(), stream: fallbackStream }
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, fallback })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    const id = streamIdOf(worker)
    worker.emitMessage({ type: 'error', id, message: 'boom' })

    await expect(firstPromise).rejects.toThrow('boom')
    expect(fallbackStream).not.toHaveBeenCalled()
  })

  it('falls back to the fallback engine when the worker errors before any chunk', async () => {
    const worker = new FakeWorker()
    const fallbackStream = vi.fn(async function* () {
      yield { text: 'fallback', audio: new Uint8Array([9]) }
    })
    const fallback: SpeechSynthesizerEngine = { synthesize: vi.fn(), stream: fallbackStream }
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, fallback })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    worker.emitError(new Error('worker crashed'))

    await expect(firstPromise).resolves.toEqual({
      value: { text: 'fallback', audio: new Uint8Array([9]) },
      done: false
    })
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
    expect(fallbackStream).toHaveBeenCalledWith('hello', undefined)
  })

  it('rejects without replaying when the worker errors after a chunk', async () => {
    const worker = new FakeWorker()
    const fallbackStream = vi.fn(async function* () {
      yield { text: 'fallback', audio: new Uint8Array([9]) }
    })
    const fallback: SpeechSynthesizerEngine = { synthesize: vi.fn(), stream: fallbackStream }
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, fallback })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    const id = streamIdOf(worker)
    worker.emitMessage({ type: 'chunk', id, index: 0, text: 'hello', audio: new Uint8Array([1]) })

    await expect(firstPromise).resolves.toEqual({
      value: { text: 'hello', audio: new Uint8Array([1]) },
      done: false
    })

    worker.emitError(new Error('late crash'))

    await expect(iterator.next()).rejects.toThrow('late crash')
    expect(fallbackStream).not.toHaveBeenCalled()
  })

  it('rejects on a worker error event when no fallback is configured', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const firstPromise = iterator.next()
    worker.emitError(new Error('no fallback'))

    await expect(firstPromise).rejects.toThrow('no fallback')
  })
})

describe('WorkerSpeechEngine.warmup', () => {
  it('posts warmup and resolves on ready', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, warmupTimeoutMs: 1000 })

    const warmup = engine.warmup()
    expect(worker.messages).toContainEqual({ type: 'warmup' })

    worker.emitMessage({ type: 'ready' })
    await expect(warmup).resolves.toBeUndefined()
  })

  it('resolves after the timeout when ready never arrives', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, warmupTimeoutMs: 10 })

    await expect(engine.warmup()).resolves.toBeUndefined()
  })

  it('resolves when a ready message arrives while other work is pending', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker, warmupTimeoutMs: 1000 })

    const warmup = engine.warmup()
    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const pending = iterator.next()
    const id = streamIdOf(worker)

    worker.emitMessage({ type: 'ready' })
    await expect(warmup).resolves.toBeUndefined()

    worker.emitMessage({ type: 'done', id })
    await expect(pending).resolves.toEqual({ value: undefined, done: true })
  })
})

describe('WorkerSpeechEngine.terminate', () => {
  it('terminates the worker and settles in-flight streams', async () => {
    const worker = new FakeWorker()
    const engine = new WorkerSpeechEngine({ createWorker: () => worker })

    const iterator = engine.stream('hello')[Symbol.asyncIterator]()
    const pending = iterator.next()

    await engine.terminate()

    await expect(pending).rejects.toThrow(/terminated/i)
    expect(worker.terminated).toBe(true)
  })

  it('is safe to call when no worker was ever created', async () => {
    const engine = new WorkerSpeechEngine({ createWorker: () => new FakeWorker() })
    await expect(engine.terminate()).resolves.toBeUndefined()
  })
})

describe('WorkerSpeechEngine.synthesize', () => {
  it('delegates to the fallback engine', async () => {
    const audio = new Uint8Array([7, 7])
    const fallback: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(audio)
    }
    const engine = new WorkerSpeechEngine({ createWorker: () => new FakeWorker(), fallback })

    await expect(engine.synthesize('hi')).resolves.toEqual(audio)
    expect(fallback.synthesize).toHaveBeenCalledWith('hi', undefined)
  })

  it('throws a clear error without a fallback engine', async () => {
    const engine = new WorkerSpeechEngine({ createWorker: () => new FakeWorker() })
    await expect(engine.synthesize('hi')).rejects.toThrow(/single-shot synthesis/)
  })
})
