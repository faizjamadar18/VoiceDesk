import { describe, expect, it } from 'vitest'
import { StrokeTracker } from './stroke'

describe('StrokeTracker', () => {
  it('ignores sub-1.5 DIP jitter', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: 100, y: 100 })
    tracker.add({ x: 100.4, y: 100.4 })
    tracker.add({ x: 100.8, y: 100.1 })
    tracker.add({ x: 101.1, y: 100.9 })

    expect(tracker.points).toHaveLength(1)
    expect(tracker.marked).toBe(false)
  })

  it('does not mark a short accidental move', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: 100, y: 100 })
    tracker.add({ x: 112, y: 100 })

    expect(tracker.marked).toBe(false)
  })

  it('marks a deliberate line', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: 100, y: 100 })
    tracker.add({ x: 140, y: 100 })

    expect(tracker.marked).toBe(true)
  })

  it('marks a deliberate circle', () => {
    const tracker = new StrokeTracker()
    const radius = 30
    for (let step = 0; step <= 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2
      tracker.add({ x: 200 + Math.cos(angle) * radius, y: 200 + Math.sin(angle) * radius })
    }

    expect(tracker.marked).toBe(true)
  })

  it('returns a copy of the points', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: 0, y: 0 })
    tracker.add({ x: 10, y: 0 })

    const points = tracker.points as { x: number; y: number }[]
    points[0].x = 999

    expect(tracker.points[0]).toEqual({ x: 0, y: 0 })
  })

  it('resets points and the marked state', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: 0, y: 0 })
    tracker.add({ x: 40, y: 0 })
    expect(tracker.marked).toBe(true)

    tracker.reset()

    expect(tracker.points).toEqual([])
    expect(tracker.marked).toBe(false)
  })

  it('ignores non-finite points', () => {
    const tracker = new StrokeTracker()
    tracker.add({ x: Number.NaN, y: 10 })
    tracker.add({ x: 10, y: Number.POSITIVE_INFINITY })

    expect(tracker.points).toEqual([])
    expect(tracker.marked).toBe(false)
  })
})
