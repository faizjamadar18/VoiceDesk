import {
  IPC,
  type SpeechChunkPayload,
  type SpeechStreamDonePayload,
  type SpeechStreamErrorPayload
} from '../shared/types'
import type { SpeechChunk } from './speech-synthesizer'

export interface SpeechStreamBridgeOptions {
  synthesizeStream: (text: string) => AsyncIterable<SpeechChunk>
  send: (channel: string, payload: unknown) => void
}

interface ActiveStream {
  requestId: string
  iterator: AsyncIterator<SpeechChunk>
  cancelled: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Bridges a speech chunk stream to the renderer. Only one answer is spoken at a
 * time: starting a stream cancels whatever was already running.
 */
export class SpeechStreamBridge {
  private readonly synthesizeStream: SpeechStreamBridgeOptions['synthesizeStream']
  private readonly send: SpeechStreamBridgeOptions['send']
  private active: ActiveStream | null = null

  constructor(options: SpeechStreamBridgeOptions) {
    this.synthesizeStream = options.synthesizeStream
    this.send = options.send
  }

  start(requestId: string, text: string): void {
    this.stopActive()

    let iterator: AsyncIterator<SpeechChunk>
    try {
      iterator = this.synthesizeStream(text)[Symbol.asyncIterator]()
    } catch (error) {
      this.emit(IPC.speechStreamError, {
        requestId,
        message: errorMessage(error)
      } satisfies SpeechStreamErrorPayload)
      return
    }

    const state: ActiveStream = { requestId, iterator, cancelled: false }
    this.active = state
    void this.pump(state)
  }

  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) {
      this.stopActive()
    }
  }

  cancelAll(): void {
    this.stopActive()
  }

  private async pump(state: ActiveStream): Promise<void> {
    try {
      while (true) {
        const result = await state.iterator.next()
        if (state.cancelled) return
        if (result.done) break

        const chunk = result.value
        this.emit(IPC.speechChunk, {
          requestId: state.requestId,
          index: chunk.index,
          text: chunk.text,
          audio: chunk.audio
        } satisfies SpeechChunkPayload)
      }

      if (state.cancelled) return
      this.emit(IPC.speechStreamDone, {
        requestId: state.requestId
      } satisfies SpeechStreamDonePayload)
    } catch (error) {
      if (state.cancelled) return
      this.emit(IPC.speechStreamError, {
        requestId: state.requestId,
        message: errorMessage(error)
      } satisfies SpeechStreamErrorPayload)
    } finally {
      if (this.active === state) this.active = null
      if (!state.cancelled) this.close(state.iterator)
    }
  }

  private stopActive(): void {
    const state = this.active
    if (!state) return
    this.active = null
    state.cancelled = true
    this.close(state.iterator)
  }

  /** Runs the iterator's `return()` so a suspended generator runs its `finally`. */
  private close(iterator: AsyncIterator<SpeechChunk>): void {
    try {
      const result = iterator.return?.()
      if (result && typeof result.catch === 'function') {
        void result.catch(() => undefined)
      }
    } catch {
      // the generator is already closed
    }
  }

  private emit(channel: string, payload: unknown): void {
    try {
      this.send(channel, payload)
    } catch {
      // a dead renderer must not break the stream
    }
  }
}
