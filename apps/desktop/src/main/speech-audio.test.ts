import { describe, expect, it } from 'vitest'
import { trimTrailingSilence, wavDurationMs } from './speech-audio'

interface WavSpec {
  format: 1 | 3
  sampleRate: number
  samples: Float32Array
  prefixChunk?: { id: string; size: number }
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index)
  }
}

/** Minimal mono WAV writer: fmt, an optional odd-sized prefix chunk, then data. */
function encodeWav(spec: WavSpec): Uint8Array {
  const channels = 1
  const bytesPerSample = spec.format === 3 ? 4 : 2
  const dataSize = spec.samples.length * bytesPerSample
  const prefixLen = spec.prefixChunk
    ? 8 + spec.prefixChunk.size + (spec.prefixChunk.size % 2)
    : 0
  const prefixStart = 12 + 24
  const dataStart = prefixStart + prefixLen
  const dataOffset = dataStart + 8

  const bytes = new Uint8Array(dataOffset + dataSize)
  const view = new DataView(bytes.buffer)

  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, spec.format, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, spec.sampleRate, true)
  view.setUint32(28, spec.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)

  if (spec.prefixChunk) {
    writeAscii(bytes, prefixStart, spec.prefixChunk.id)
    view.setUint32(prefixStart + 4, spec.prefixChunk.size, true)
  }

  writeAscii(bytes, dataStart, 'data')
  view.setUint32(dataStart + 4, dataSize, true)

  for (let index = 0; index < spec.samples.length; index += 1) {
    if (spec.format === 3) {
      view.setFloat32(dataOffset + index * 4, spec.samples[index], true)
    } else {
      const clamped = Math.max(-1, Math.min(1, spec.samples[index]))
      view.setInt16(dataOffset + index * 2, Math.round(clamped * 0x7fff), true)
    }
  }

  return bytes
}

function toneThenSilence(sampleRate: number, toneSeconds: number, silenceSeconds: number): Float32Array {
  const toneFrames = Math.round(sampleRate * toneSeconds)
  const silenceFrames = Math.round(sampleRate * silenceSeconds)
  const samples = new Float32Array(toneFrames + silenceFrames)

  for (let index = 0; index < toneFrames; index += 1) {
    samples[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)
  }

  return samples
}

describe('trimTrailingSilence', () => {
  it('trims float32 trailing silence and reports the shortened duration', () => {
    const sampleRate = 48000
    const wav = encodeWav({ format: 3, sampleRate, samples: toneThenSilence(sampleRate, 0.2, 0.8) })
    const original = wav.slice()

    const trimmed = trimTrailingSilence(wav)

    expect(trimmed).not.toBe(wav)
    expect(trimmed.length).toBeLessThan(wav.length)
    expect(wav).toEqual(original) // input is not mutated
    expect(wavDurationMs(trimmed)).toBeCloseTo(300, 3)

    const view = new DataView(trimmed.buffer, trimmed.byteOffset, trimmed.byteLength)
    expect(view.getUint32(4, true)).toBe(trimmed.length - 8) // RIFF size
    expect(view.getUint32(40, true)).toBe(trimmed.length - 44) // data size

    // the audible tone is preserved byte-for-byte
    const toneBytes = Math.round(sampleRate * 0.2) * 4
    expect(trimmed.subarray(44, 44 + toneBytes)).toEqual(wav.subarray(44, 44 + toneBytes))
  })

  it('trims int16 trailing silence the same way', () => {
    const sampleRate = 16000
    const wav = encodeWav({ format: 1, sampleRate, samples: toneThenSilence(sampleRate, 0.2, 0.8) })

    const trimmed = trimTrailingSilence(wav)

    expect(trimmed.length).toBeLessThan(wav.length)
    expect(wavDurationMs(trimmed)).toBeCloseTo(300, 3)

    const view = new DataView(trimmed.buffer, trimmed.byteOffset, trimmed.byteLength)
    expect(view.getUint32(4, true)).toBe(trimmed.length - 8)
    expect(view.getUint32(40, true)).toBe(trimmed.length - 44)

    const toneBytes = Math.round(sampleRate * 0.2) * 2
    expect(trimmed.subarray(44, 44 + toneBytes)).toEqual(wav.subarray(44, 44 + toneBytes))
  })

  it('honours a custom keepSilenceMs', () => {
    const sampleRate = 48000
    const wav = encodeWav({ format: 3, sampleRate, samples: toneThenSilence(sampleRate, 0.2, 0.8) })

    const trimmed = trimTrailingSilence(wav, { keepSilenceMs: 0 })
    expect(wavDurationMs(trimmed)).toBeCloseTo(200, 3)
  })

  it('returns a clip with no trailing silence unchanged', () => {
    const sampleRate = 48000
    const wav = encodeWav({ format: 3, sampleRate, samples: toneThenSilence(sampleRate, 0.2, 0) })
    expect(trimTrailingSilence(wav)).toBe(wav)
  })

  it('returns an all-silence clip unchanged', () => {
    const wav = encodeWav({ format: 3, sampleRate: 48000, samples: new Float32Array(4800) })
    expect(trimTrailingSilence(wav)).toBe(wav)
  })

  it('returns garbage or short input unchanged', () => {
    const short = new Uint8Array([1, 2, 3, 4])
    expect(trimTrailingSilence(short)).toBe(short)

    const garbage = new Uint8Array(200)
    for (let index = 0; index < garbage.length; index += 1) {
      garbage[index] = (index * 37) % 256
    }
    expect(trimTrailingSilence(garbage)).toBe(garbage)
  })

  it('returns input unchanged when data is not the last chunk', () => {
    const sampleRate = 48000
    const base = encodeWav({ format: 3, sampleRate, samples: toneThenSilence(sampleRate, 0.2, 0.8) })
    const trailing = new Uint8Array(8)
    writeAscii(trailing, 0, 'LIST')

    const combined = new Uint8Array(base.length + trailing.length)
    combined.set(base, 0)
    combined.set(trailing, base.length)

    expect(trimTrailingSilence(combined)).toBe(combined)
  })

  it('skips an odd-sized chunk before the data chunk', () => {
    const sampleRate = 48000
    const wav = encodeWav({
      format: 3,
      sampleRate,
      samples: toneThenSilence(sampleRate, 0.2, 0.8),
      prefixChunk: { id: 'LIST', size: 3 }
    })

    const trimmed = trimTrailingSilence(wav)

    expect(trimmed.length).toBeLessThan(wav.length)
    expect(wavDurationMs(trimmed)).toBeCloseTo(300, 3)
    // the odd LIST chunk (8 + 3 + 1 pad) shifts the data payload to offset 56
    const view = new DataView(trimmed.buffer, trimmed.byteOffset, trimmed.byteLength)
    expect(view.getUint32(4, true)).toBe(trimmed.length - 8) // RIFF size
    expect(view.getUint32(52, true)).toBe(trimmed.length - 56) // data size field
  })
})

describe('wavDurationMs', () => {
  it('reads the duration from the header', () => {
    const floatWav = encodeWav({
      format: 3,
      sampleRate: 48000,
      samples: toneThenSilence(48000, 0.2, 0.8)
    })
    expect(wavDurationMs(floatWav)).toBeCloseTo(1000, 3)

    const intWav = encodeWav({ format: 1, sampleRate: 16000, samples: new Float32Array(8000) })
    expect(wavDurationMs(intWav)).toBeCloseTo(500, 3)
  })

  it('returns null for garbage or short input', () => {
    expect(wavDurationMs(new Uint8Array([1, 2, 3]))).toBeNull()

    const garbage = new Uint8Array(200)
    for (let index = 0; index < garbage.length; index += 1) {
      garbage[index] = (index * 37) % 256
    }
    expect(wavDurationMs(garbage)).toBeNull()
  })
})
