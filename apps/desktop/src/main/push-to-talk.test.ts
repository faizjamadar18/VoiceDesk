import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HOLD_THRESHOLD_MS, PushToTalk } from './push-to-talk'

function setup(thresholdMs = DEFAULT_HOLD_THRESHOLD_MS) {
  const calls: string[] = []
  const instance = new PushToTalk(
    {
      onListeningStart: () => calls.push('start'),
      onListeningStop: (holdMs) => calls.push(`stop:${holdMs}`),
      onCancel: () => calls.push('cancel')
    },
    { thresholdMs }
  )
  return { instance, calls }
}

describe('PushToTalk', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing for a tap shorter than the threshold', () => {
    const { instance, calls } = setup()

    instance.press()
    expect(instance.phase).toBe('armed')

    vi.advanceTimersByTime(120)
    instance.release()
    vi.advanceTimersByTime(1_000)

    expect(calls).toEqual([])
    expect(instance.phase).toBe('idle')
  })

  it('starts only after the threshold and stops on release', () => {
    const { instance, calls } = setup()

    instance.press()
    vi.advanceTimersByTime(299)
    expect(calls).toEqual([])

    vi.advanceTimersByTime(1)
    expect(calls).toEqual(['start'])
    expect(instance.phase).toBe('listening')

    vi.advanceTimersByTime(700)
    instance.release()

    expect(calls).toEqual(['start', 'stop:1000'])
    expect(instance.phase).toBe('processing')
  })

  it('ignores key-repeat presses while armed or listening', () => {
    const { instance, calls } = setup()

    instance.press()
    instance.press()
    vi.advanceTimersByTime(300)
    instance.press()
    instance.press()

    expect(calls).toEqual(['start'])
  })

  it('ignores a new press while processing or showing a result', () => {
    const { instance, calls } = setup()

    instance.press()
    vi.advanceTimersByTime(300)
    instance.release()
    instance.press()
    vi.advanceTimersByTime(500)
    instance.release()

    expect(calls).toEqual(['start', 'stop:300'])
    expect(instance.phase).toBe('processing')

    instance.markResult()
    instance.press()
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['start', 'stop:300'])
  })

  it('cancels an armed hold without starting', () => {
    const { instance, calls } = setup()

    instance.press()
    vi.advanceTimersByTime(100)
    instance.cancel()
    vi.advanceTimersByTime(1_000)

    expect(calls).toEqual([])
    expect(instance.phase).toBe('idle')
  })

  it('cancels a live hold with Escape', () => {
    const { instance, calls } = setup()

    instance.press()
    vi.advanceTimersByTime(300)
    instance.cancel()

    expect(calls).toEqual(['start', 'cancel'])
    expect(instance.phase).toBe('idle')
  })

  it('transitions through acting and result, then resets', () => {
    const { instance } = setup()

    instance.press()
    vi.advanceTimersByTime(300)
    instance.release()
    instance.markActing()
    expect(instance.phase).toBe('acting')
    instance.markResult()
    expect(instance.phase).toBe('result')
    instance.reset()
    expect(instance.phase).toBe('idle')
    instance.press()
    expect(instance.phase).toBe('armed')
  })

  it('ignores release without a press', () => {
    const { instance, calls } = setup()

    instance.release()
    instance.cancel()

    expect(calls).toEqual([])
    expect(instance.phase).toBe('idle')
  })

  it('can be configured with a different threshold', () => {
    const { instance, calls } = setup(500)

    instance.press()
    vi.advanceTimersByTime(499)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual(['start'])
  })
})
