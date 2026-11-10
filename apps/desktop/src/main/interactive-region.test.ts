import { describe, expect, it } from 'vitest'
import {
  normalizeInteractiveRegion,
  pointInInteractiveRegion
} from './interactive-region'

const BOUNDS = { x: 1_000, y: 0, width: 660, height: 620 }
const REGION = { left: 50, top: 120, width: 560, height: 240 }

describe('notch interactive region', () => {
  it('accepts only points inside the reported card rectangle', () => {
    expect(pointInInteractiveRegion({ x: 1_050, y: 120 }, BOUNDS, REGION)).toBe(true)
    expect(pointInInteractiveRegion({ x: 1_609, y: 359 }, BOUNDS, REGION)).toBe(true)

    expect(pointInInteractiveRegion({ x: 1_049, y: 120 }, BOUNDS, REGION)).toBe(false)
    expect(pointInInteractiveRegion({ x: 1_610, y: 120 }, BOUNDS, REGION)).toBe(false)
    expect(pointInInteractiveRegion({ x: 1_050, y: 360 }, BOUNDS, REGION)).toBe(false)
    expect(pointInInteractiveRegion({ x: 1_050, y: 119 }, BOUNDS, REGION)).toBe(false)
  })

  it('keeps the window click-through until the renderer reports a region', () => {
    expect(pointInInteractiveRegion({ x: 1_100, y: 200 }, BOUNDS, null)).toBe(false)
  })

  it('rejects malformed renderer payloads', () => {
    expect(normalizeInteractiveRegion(null)).toBeNull()
    expect(normalizeInteractiveRegion({})).toBeNull()
    expect(normalizeInteractiveRegion({ left: 1, top: 2, width: 0, height: 40 })).toBeNull()
    expect(
      normalizeInteractiveRegion({
        left: 1,
        top: 2,
        width: 40,
        height: Number.NaN
      })
    ).toBeNull()
  })

  it('keeps a valid region unchanged', () => {
    expect(normalizeInteractiveRegion(REGION)).toEqual(REGION)
  })
})
