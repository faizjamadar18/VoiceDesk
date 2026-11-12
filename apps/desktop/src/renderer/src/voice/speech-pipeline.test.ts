import { describe, expect, it } from 'vitest'
import { splitSpeechChunks } from '../../../shared/speech-chunking'
import {
  SpeechPlayer,
  type DecodedSpeechAudio,
  type SpeechAudioSink
} from './speech-player'

const SCRIPT =
  "I'm Kestrel, your executive voice assistant on Windows. Think of me as a friendly, always-on-hand helper who can open apps, search files, check the weather, type for you, and even pull up information from Notion—all with a simple voice command. I'm here to keep your day running smoothly, so just tell me what you need and I'll take care of it."

const MS_PER_CHAR = 70
const REALTIME_FACTOR = 0.76
const LEAD_SECONDS = 0.05

/** Resolves after pending microtasks and the player's decode chain settle. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

interface ScheduledBuffer {
  at: number
  duration: number
}

const msOf = (bytes: Uint8Array): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true)

const bytesFor = (durationMs: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, durationMs, true)
  return bytes
}

class FakeSink implements SpeechAudioSink {
  clock = 0
  readonly scheduled: ScheduledBuffer[] = []
  cancels = 0

  now(): number {
    return this.clock
  }

  decode(bytes: Uint8Array): Promise<DecodedSpeechAudio> {
    return Promise.resolve({ handle: bytes, duration: msOf(bytes) / 1000 })
  }

  schedule(handle: unknown, at: number, _onEnded: () => void): void {
    this.scheduled.push({ at, duration: msOf(handle as Uint8Array) / 1000 })
  }

  cancel(): void {
    this.cancels += 1
  }
}

const gaps = (scheduled: ScheduledBuffer[]): number[] =>
  scheduled.slice(1).map((entry, index) => {
    const previous = scheduled[index]
    return entry.at - (previous.at + previous.duration)
  })

/**
 * Synthesis runs sequentially from request time 0, so chunk i arrives after
 * chunks 0..i are synthesised. The clock is rebased to the first arrival, so the
 * playback timeline starts when the first chunk is ready.
 */
async function simulate(
  chunks: string[]
): Promise<{ player: SpeechPlayer; sink: FakeSink }> {
  const sink = new FakeSink()
  const player = new SpeechPlayer(sink)
  let synthesisedMs = 0
  let firstArrivalMs = 0

  for (const [index, chunk] of chunks.entries()) {
    synthesisedMs += chunk.length * MS_PER_CHAR * REALTIME_FACTOR
    if (index === 0) firstArrivalMs = synthesisedMs
    sink.clock = (synthesisedMs - firstArrivalMs) / 1000
    player.enqueue(bytesFor(chunk.length * MS_PER_CHAR))
    await flush()
  }

  return { player, sink }
}

describe('speech pipeline scheduling', () => {
  it('schedules balanced chunks with no audible gaps', async () => {
    const chunks = splitSpeechChunks(SCRIPT)
    const { player, sink } = await simulate(chunks)

    expect(player.lateJoins).toBe(0)
    expect(sink.scheduled).toHaveLength(chunks.length)
    expect(Math.abs(sink.scheduled[0].at - LEAD_SECONDS)).toBeLessThan(1e-6)

    for (let index = 1; index < sink.scheduled.length; index += 1) {
      const previous = sink.scheduled[index - 1]
      const expected = previous.at + previous.duration
      expect(Math.abs(sink.scheduled[index].at - expected)).toBeLessThan(1e-6)
    }
  })

  it('splits the answer into small enough chunks to stay ahead', () => {
    const chunks = splitSpeechChunks(SCRIPT)

    expect(chunks.length).toBeGreaterThan(3)
    for (const chunk of chunks) {
      expect(chunk.split(' ').length).toBeLessThanOrEqual(16)
    }
  })

  it('catches the gap left by the old sentence splitter', async () => {
    // Mirrors the sentence splitter replaced by splitSpeechChunks.
    const legacyChunks = SCRIPT.split(/(?<=[.!?])\s+/)
    const { player, sink } = await simulate(legacyChunks)

    expect(player.lateJoins).toBeGreaterThan(0)
    const audibleGaps = gaps(sink.scheduled).filter((gap) => gap >= 3 && gap <= 8)
    expect(audibleGaps.length).toBeGreaterThan(0)
  })
})