import { describe, expect, it } from 'vitest'
import { decodeWav, durationMs, encodePcm16, encodeWav } from './pcm'

describe('encodePcm16', () => {
  it('writes little-endian, clamped 16-bit samples', () => {
    const bytes = encodePcm16(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]))
    const view = new DataView(bytes.buffer)

    expect(bytes.byteLength).toBe(14)
    expect(view.getInt16(0, true)).toBe(0)
    expect(view.getInt16(2, true)).toBe(16384)
    expect(view.getInt16(4, true)).toBe(-16384)
    expect(view.getInt16(6, true)).toBe(32767)
    expect(view.getInt16(8, true)).toBe(-32768)
    expect(view.getInt16(10, true)).toBe(32767)
    expect(view.getInt16(12, true)).toBe(-32768)
  })

  it('encodes empty audio as an empty buffer', () => {
    expect(encodePcm16(new Float32Array(0)).byteLength).toBe(0)
  })
})

describe('encodeWav', () => {
  it('wraps PCM in a canonical 44-byte RIFF/WAVE header', () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6])
    const wav = encodeWav(pcm, 16_000, 1)
    const view = new DataView(wav.buffer)
    const ascii = (start: number, end: number): string =>
      String.fromCharCode(...wav.slice(start, end))

    expect(wav.byteLength).toBe(44 + pcm.byteLength)
    expect(ascii(0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + pcm.byteLength)
    expect(ascii(8, 12)).toBe('WAVE')
    expect(ascii(12, 16)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16) // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1) // PCM format
    expect(view.getUint16(22, true)).toBe(1) // channels
    expect(view.getUint32(24, true)).toBe(16_000) // sample rate
    expect(view.getUint32(28, true)).toBe(16_000 * 2) // byte rate
    expect(view.getUint16(32, true)).toBe(2) // block align
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(ascii(36, 40)).toBe('data')
    expect(view.getUint32(40, true)).toBe(pcm.byteLength)
    expect(Array.from(wav.slice(44))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('uses the given sample rate and channel count for byte rate and block align', () => {
    const wav = encodeWav(new Uint8Array(0), 44_100, 2)
    const view = new DataView(wav.buffer)

    expect(wav.byteLength).toBe(44)
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint32(28, true)).toBe(44_100 * 2 * 2)
    expect(view.getUint16(32, true)).toBe(4)
    expect(view.getUint32(40, true)).toBe(0)
  })
})

describe('decodeWav', () => {
  it('round-trips samples and sample rate through encodeWav', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25, -1])
    const wav = encodeWav(encodePcm16(samples), 16_000)

    const decoded = decodeWav(wav)

    expect(decoded.sampleRate).toBe(16_000)
    expect(decoded.samples).toBeInstanceOf(Float32Array)
    expect(decoded.samples.length).toBe(samples.length)
    for (let index = 0; index < samples.length; index += 1) {
      expect(decoded.samples[index]).toBeCloseTo(samples[index], 3)
    }
  })

  it('reads the sample rate from the fmt chunk', () => {
    const wav = encodeWav(encodePcm16(new Float32Array([0.1, 0.2])), 48_000)
    expect(decodeWav(wav).sampleRate).toBe(48_000)
  })

  it('rejects a buffer that is not a RIFF/WAVE file', () => {
    expect(() => decodeWav(new Uint8Array([1, 2, 3, 4]))).toThrow(/RIFF/i)
    expect(() => decodeWav(new Uint8Array(0))).toThrow(/RIFF/i)
  })
})

describe('durationMs', () => {
  it('computes duration from samples and rate', () => {
    expect(durationMs(new Float32Array(16_000), 16_000)).toBe(1_000)
    expect(durationMs(new Float32Array(8_000), 16_000)).toBe(500)
    expect(durationMs(new Float32Array(2), 0)).toBe(0)
  })
})
