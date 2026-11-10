import { describe, expect, it } from 'vitest'
import { durationMs, encodePcm16 } from './pcm'

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

describe('durationMs', () => {
  it('computes duration from samples and rate', () => {
    expect(durationMs(new Float32Array(16_000), 16_000)).toBe(1_000)
    expect(durationMs(new Float32Array(8_000), 16_000)).toBe(500)
    expect(durationMs(new Float32Array(2), 0)).toBe(0)
  })
})
