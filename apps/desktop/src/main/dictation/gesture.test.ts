import { describe, expect, it } from 'vitest'
import { HotkeyGesture } from './gesture'

describe('HotkeyGesture', () => {
  it('emits start, then cancel and summon for a tap shorter than the hold threshold', () => {
    let now = 0
    const gesture = new HotkeyGesture({ now: () => now })

    expect(gesture.press().map((event) => event.type)).toEqual(['start'])
    expect(gesture.state).toBe('recording')

    now = 200
    expect(gesture.release().map((event) => event.type)).toEqual(['cancel', 'summon'])
    expect(gesture.state).toBe('idle')
  })

  it('treats a release at exactly 250ms as a hold', () => {
    let now = 0
    const gesture = new HotkeyGesture({ now: () => now })

    gesture.press()
    now = 250

    expect(gesture.release().map((event) => event.type)).toEqual(['stop'])
    expect(gesture.state).toBe('idle')
  })

  it('reports the hold duration and elapsed time while recording', () => {
    let now = 1_000
    const gesture = new HotkeyGesture({ now: () => now })

    expect(gesture.holdElapsed()).toBeNull()

    gesture.press()
    now = 1_750

    expect(gesture.holdElapsed()).toBe(750)
    expect(gesture.release()).toEqual([{ type: 'stop', at: 1_750, holdMs: 750 }])
    expect(gesture.holdElapsed()).toBeNull()
  })

  it('ignores a second press while recording so auto-repeat cannot restart the hold', () => {
    let now = 0
    const gesture = new HotkeyGesture({ now: () => now })

    expect(gesture.press().map((event) => event.type)).toEqual(['start'])
    now = 100
    expect(gesture.press()).toEqual([])
    now = 500

    expect(gesture.release().map((event) => event.type)).toEqual(['stop'])
    expect(gesture.state).toBe('idle')
  })

  it('ignores release without a press and repeated releases', () => {
    const gesture = new HotkeyGesture({ now: () => 0 })

    expect(gesture.release()).toEqual([])
    expect(gesture.state).toBe('idle')

    gesture.press()
    expect(gesture.release().map((event) => event.type)).toEqual(['cancel', 'summon'])
    expect(gesture.release()).toEqual([])
    expect(gesture.state).toBe('idle')
  })
})
