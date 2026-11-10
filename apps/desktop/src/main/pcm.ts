/** In-memory PCM helpers. No audio is ever written to disk. */

export const ASR_SAMPLE_RATE = 16_000

export function durationMs(samples: Float32Array, sampleRate: number): number {
  if (sampleRate <= 0) return 0
  return (samples.length / sampleRate) * 1000
}

/** Encode mono Float32 PCM as little-endian 16-bit PCM for the realtime socket. */
export function encodePcm16(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    view.setInt16(index * 2, Math.round(value), true)
  }

  return new Uint8Array(buffer)
}
