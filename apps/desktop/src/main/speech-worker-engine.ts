import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { SpeechSynthesizerEngine } from './speech-synthesizer'

/**
 * Minimal surface of a `node:worker_threads` Worker that the proxy needs.
 * Injectable so tests can supply a fake without spawning a real thread.
 */
export interface WorkerLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (message: unknown) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  terminate(): Promise<number> | void
}

export interface WorkerSpeechEngineOptions {
  /** Factory for the worker. Defaults to spawning speech-worker.js next to this module. */
  createWorker?: () => WorkerLike
  /** In-process engine used only when the worker fails before producing any chunk. */
  fallback?: SpeechSynthesizerEngine
  /** How long warmup waits for `ready` before resolving anyway. */
  warmupTimeoutMs?: number
}

interface PendingStream {
  queue: Array<{ text: string; audio: Uint8Array }>
  receivedChunk: boolean
  done: boolean
  error: Error | null
  fallback: boolean
  wake: (() => void) | null
}

const DEFAULT_WARMUP_TIMEOUT_MS = 30_000

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function defaultCreateWorker(): WorkerLike {
  return new Worker(join(__dirname, 'speech-worker.js')) as unknown as WorkerLike
}

/**
 * Main-thread proxy that runs Kokoro synthesis on a worker thread so a long
 * sentence never blocks the Electron main process.
 *
 * Single-shot `synthesize()` is not supported here: buffering the whole stream
 * would defeat the point of the worker. It delegates to `fallback` when present.
 */
export class WorkerSpeechEngine implements SpeechSynthesizerEngine {
  private readonly createWorker: () => WorkerLike
  private readonly fallback?: SpeechSynthesizerEngine
  private readonly warmupTimeoutMs: number

  private worker: WorkerLike | null = null
  private sequence = 0
  private readonly pending = new Map<string, PendingStream>()
  private readonly warmupWaiters = new Set<() => void>()

  constructor(options: WorkerSpeechEngineOptions = {}) {
    this.createWorker = options.createWorker ?? defaultCreateWorker
    this.fallback = options.fallback
    this.warmupTimeoutMs = options.warmupTimeoutMs ?? DEFAULT_WARMUP_TIMEOUT_MS
  }

  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number }
  ): Promise<Uint8Array | null> {
    if (this.fallback) {
      return this.fallback.synthesize(text, options)
    }
    throw new Error(
      'WorkerSpeechEngine single-shot synthesis is unavailable; provide a fallback engine or use stream()'
    )
  }

  warmup(): Promise<void> {
    let worker: WorkerLike
    try {
      worker = this.ensureWorker()
    } catch {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const done = () => {
        if (!this.warmupWaiters.delete(done)) {
          return
        }
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(done, this.warmupTimeoutMs)
      this.warmupWaiters.add(done)

      try {
        worker.postMessage({ type: 'warmup' })
      } catch {
        done()
      }
    })
  }

  async *stream(
    text: string,
    options?: { voice?: string; speed?: number }
  ): AsyncIterable<{ text: string; audio: Uint8Array }> {
    let worker: WorkerLike
    try {
      worker = this.ensureWorker()
    } catch (error) {
      if (this.canFallback()) {
        console.warn('[speech-worker-engine] Could not start worker; using fallback engine:', error)
        yield* this.streamFallback(text, options)
        return
      }
      throw toError(error)
    }

    const id = `speech-${++this.sequence}`
    const pending: PendingStream = {
      queue: [],
      receivedChunk: false,
      done: false,
      error: null,
      fallback: false,
      wake: null
    }
    this.pending.set(id, pending)

    try {
      worker.postMessage({ type: 'stream', id, text, voice: options?.voice, speed: options?.speed })
    } catch (error) {
      this.pending.delete(id)
      if (this.canFallback()) {
        console.warn('[speech-worker-engine] Worker postMessage failed; using fallback engine:', error)
        yield* this.streamFallback(text, options)
        return
      }
      throw toError(error)
    }

    try {
      while (true) {
        if (pending.fallback) {
          yield* this.streamFallback(text, options)
          return
        }

        const item = pending.queue.shift()
        if (item) {
          yield item
          continue
        }
        if (pending.error) {
          throw pending.error
        }
        if (pending.done) {
          return
        }
        await new Promise<void>((resolve) => {
          pending.wake = resolve
        })
      }
    } finally {
      this.pending.delete(id)
      const settled = pending.done || pending.error !== null || pending.fallback
      if (!settled) {
        this.postCancel(worker, id)
      }
    }
  }

  async terminate(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.settleWarmup()

    const error = new Error('Speech worker terminated')
    for (const pending of this.pending.values()) {
      pending.error = error
      this.wake(pending)
    }
    this.pending.clear()

    if (worker) {
      try {
        await worker.terminate()
      } catch {
        // the worker is already gone
      }
    }
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      const worker = this.createWorker()
      worker.on('message', (message) => this.handleMessage(message))
      worker.on('error', (error) => this.handleWorkerError(toError(error)))
      this.worker = worker
    }
    return this.worker
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message) || typeof message.type !== 'string') {
      return
    }

    switch (message.type) {
      case 'ready':
        this.settleWarmup()
        return
      case 'chunk': {
        const pending = this.pending.get(message.id as string)
        if (!pending) {
          return
        }
        pending.receivedChunk = true
        pending.queue.push({ text: message.text as string, audio: message.audio as Uint8Array })
        this.wake(pending)
        return
      }
      case 'done': {
        const pending = this.pending.get(message.id as string)
        if (!pending) {
          return
        }
        pending.done = true
        this.wake(pending)
        return
      }
      case 'error': {
        const pending = this.pending.get(message.id as string)
        if (!pending) {
          return
        }
        pending.error = new Error(String(message.message))
        this.wake(pending)
        return
      }
      default:
        return
    }
  }

  private handleWorkerError(error: Error): void {
    const worker = this.worker
    this.worker = null
    this.settleWarmup()

    for (const pending of this.pending.values()) {
      if (!pending.receivedChunk && this.canFallback()) {
        pending.fallback = true
      } else {
        pending.error = error
      }
      this.wake(pending)
    }

    if (worker) {
      try {
        void worker.terminate()
      } catch {
        // the worker is already gone
      }
    }
  }

  private canFallback(): boolean {
    return typeof this.fallback?.stream === 'function'
  }

  private async *streamFallback(
    text: string,
    options?: { voice?: string; speed?: number }
  ): AsyncIterable<{ text: string; audio: Uint8Array }> {
    const fallback = this.fallback
    if (!fallback || typeof fallback.stream !== 'function') {
      throw new Error('Speech worker failed and no streaming fallback engine is available')
    }
    yield* fallback.stream(text, options)
  }

  private postCancel(worker: WorkerLike, id: string): void {
    try {
      worker.postMessage({ type: 'cancel', id })
    } catch {
      // the worker is already gone
    }
  }

  private wake(pending: PendingStream): void {
    if (!pending.wake) {
      return
    }
    const wake = pending.wake
    pending.wake = null
    wake()
  }

  private settleWarmup(): void {
    for (const done of [...this.warmupWaiters]) {
      done()
    }
  }
}
