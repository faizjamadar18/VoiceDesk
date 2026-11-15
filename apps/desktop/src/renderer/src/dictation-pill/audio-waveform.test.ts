import { describe, expect, it } from 'vitest'
import {
  computeBarColor,
  compressVolume,
  shiftHeights,
  MIN_BAR_HEIGHT,
  MAX_BAR_HEIGHT,
  BAR_COUNT
} from './audio-waveform'

describe('audio-waveform shift-register and compression logic', () => {
  it('shifts heights left and appends newHeight to the end', () => {
    const initial = [2, 2, 2, 2, 2, 2, 2]
    const updated = shiftHeights(initial, 10)
    expect(updated).toEqual([2, 2, 2, 2, 2, 2, 10])
    expect(updated).toHaveLength(BAR_COUNT)

    const next = shiftHeights(updated, 15)
    expect(next).toEqual([2, 2, 2, 2, 2, 10, 15])
  })

  it('gates audio volume below noise gate threshold', () => {
    const gated = compressVolume(0.005, 0)
    expect(gated).toBe(0)
  })

  it('compresses audio volume above gate with fast attack', () => {
    const compressed = compressVolume(0.5, 0)
    expect(compressed).toBeGreaterThan(0)
    expect(compressed).toBeLessThanOrEqual(1)
  })

  it('maps bar heights to non-linear rgb(110..255) colors', () => {
    const minColor = computeBarColor(MIN_BAR_HEIGHT, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(minColor).toBe('rgb(110, 110, 110)')

    const maxColor = computeBarColor(MAX_BAR_HEIGHT, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(maxColor).toBe('rgb(255, 255, 255)')

    const midColor = computeBarColor(9.5, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(midColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})
