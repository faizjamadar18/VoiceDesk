import { parentPort } from 'node:worker_threads'
import { KokoroSynthesizerEngine } from './speech-synthesizer'

type InboundMessage =
  | { type: 'warmup' }
  | { type: 'stream'; id: string; text: string; voice?: string; speed?: number }
  | { type: 'cancel'; id: string }

const engine = new KokoroSynthesizerEngine()
const active = new Map<string, { cancelled: boolean }>()

function post(message: unknown): void {
  parentPort?.postMessage(message)
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleWarmup(): Promise<void> {
  try {
    await engine.warmup()
  } catch (error) {
    console.warn('[speech-worker] warmup failed:', error)
  }
  post({ type: 'ready' })
}

async function handleStream(message: Extract<InboundMessage, { type: 'stream' }>): Promise<void> {
  const state = { cancelled: false }
  active.set(message.id, state)

  let index = 0
  try {
    for await (const chunk of engine.stream(message.text, {
      voice: message.voice,
      speed: message.speed
    })) {
      if (state.cancelled) {
        return
      }
      post({ type: 'chunk', id: message.id, index: index++, text: chunk.text, audio: chunk.audio })
    }

    if (state.cancelled) {
      return
    }
    post({ type: 'done', id: message.id })
  } catch (error) {
    if (state.cancelled) {
      return
    }
    post({ type: 'error', id: message.id, message: toMessage(error) })
  } finally {
    active.delete(message.id)
  }
}

function handleMessage(message: InboundMessage): void {
  if (!message || typeof message !== 'object') {
    return
  }

  switch (message.type) {
    case 'warmup':
      void handleWarmup()
      return
    case 'stream':
      void handleStream(message)
      return
    case 'cancel': {
      const state = active.get(message.id)
      if (state) {
        state.cancelled = true
      }
      return
    }
    default:
      return
  }
}

if (parentPort) {
  parentPort.on('message', (message) => handleMessage(message as InboundMessage))
}
