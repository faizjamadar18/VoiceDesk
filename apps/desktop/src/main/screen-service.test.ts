import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScreenOverlayPoint } from '../shared/types'
import {
  OverlayScreenService,
  type ScreenDisplay,
  type ScreenOverlayController,
  type ScreenRect
} from './screen-service'

const DISPLAY: ScreenDisplay = {
  id: 7,
  bounds: { x: 100, y: 50, width: 800, height: 600 },
  size: { width: 800, height: 600 },
  scaleFactor: 1
}

const OTHER_DISPLAY: ScreenDisplay = {
  id: 9,
  bounds: { x: -1_200, y: 0, width: 1_200, height: 900 },
  size: { width: 1_200, height: 900 },
  scaleFactor: 1
}

const CLEAN_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const ANNOTATED_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6])

class FakeOverlay implements ScreenOverlayController {
  readonly shown: ScreenRect[] = []
  readonly points: ScreenOverlayPoint[] = []
  readonly composeInputs: Uint8Array[] = []
  hideCalls = 0
  cancelCalls = 0
  finishCalls = 0
  finishError: Error | null = null
  composeError: Error | null = null
  hangFinish = false
  composedImage = ANNOTATED_PNG

  show(bounds: ScreenRect): void {
    this.shown.push({ ...bounds })
  }

  hide(): void {
    this.hideCalls += 1
  }

  point(point: ScreenOverlayPoint): void {
    this.points.push({ ...point })
  }

  async finish(): Promise<void> {
    this.finishCalls += 1
    if (this.finishError) throw this.finishError
    if (this.hangFinish) return new Promise<void>(() => undefined)
  }

  async compose(image: Uint8Array): Promise<Uint8Array> {
    this.composeInputs.push(new Uint8Array(image))
    if (this.composeError) throw this.composeError
    return this.composedImage
  }

  cancel(): void {
    this.cancelCalls += 1
  }
}

function setup(overrides: {
  captureDisplay?: (display: ScreenDisplay) => Promise<Uint8Array>
  displayUnderCursor?: () => ScreenDisplay
  overlay?: FakeOverlay
  sleep?: (ms: number) => Promise<void>
} = {}) {
  const overlay = overrides.overlay ?? new FakeOverlay()
  const captures: ScreenDisplay[] = []
  const sleeps: number[] = []
  let cursor: ScreenOverlayPoint = { x: DISPLAY.bounds.x, y: DISPLAY.bounds.y }
  let display = DISPLAY

  const service = new OverlayScreenService({
    overlay,
    cursorPoint: () => cursor,
    displayUnderCursor: overrides.displayUnderCursor ?? (() => display),
    captureDisplay:
      overrides.captureDisplay ??
      (async (target) => {
        captures.push(target)
        return CLEAN_PNG
      }),
    sleep:
      overrides.sleep ??
      (async (ms) => {
        sleeps.push(ms)
      })
  })

  return {
    service,
    overlay,
    captures,
    sleeps,
    moveCursor(point: ScreenOverlayPoint) {
      cursor = point
    },
    setDisplay(next: ScreenDisplay) {
      display = next
    }
  }
}

async function drawLine(target: ReturnType<typeof setup>): Promise<void> {
  target.moveCursor({ x: DISPLAY.bounds.x + 20, y: DISPLAY.bounds.y })
  await vi.advanceTimersByTimeAsync(16)
  target.moveCursor({ x: DISPLAY.bounds.x + 120, y: DISPLAY.bounds.y + 20 })
  await vi.advanceTimersByTimeAsync(16)
}

describe('OverlayScreenService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the locked display overlay and feeds relative points', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()

    expect(target.overlay.shown).toEqual([DISPLAY.bounds])
    expect(target.overlay.points).toEqual([{ x: 0, y: 0 }])

    target.moveCursor({ x: 140, y: 70 })
    await vi.advanceTimersByTimeAsync(16)

    expect(target.overlay.points.at(-1)).toEqual({ x: 40, y: 20 })
    target.service.cancel()
  })

  it('clips points that leave the locked display', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    target.overlay.points.length = 0
    target.moveCursor({ x: 40, y: 50 })
    await vi.advanceTimersByTimeAsync(16)

    expect(target.overlay.points).toEqual([])
    target.service.cancel()
  })

  it('captures, composites, and returns an annotated PNG for a marked finish', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    await drawLine(target)

    const turn = await target.service.finish()

    expect(turn.marked).toBe(true)
    expect(turn.error).toBeNull()
    expect(turn.frame).toEqual({
      imageBase64: Buffer.from(ANNOTATED_PNG).toString('base64'),
      mimeType: 'image/png'
    })
    expect(target.overlay.finishCalls).toBe(1)
    expect(target.overlay.hideCalls).toBeGreaterThanOrEqual(1)
    expect(target.captures).toEqual([DISPLAY])
    expect(target.overlay.composeInputs).toEqual([CLEAN_PNG])
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
  })

  it('never captures or composes when the mark is too small', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    target.moveCursor({ x: DISPLAY.bounds.x + 8, y: DISPLAY.bounds.y })
    await vi.advanceTimersByTimeAsync(16)

    const turn = await target.service.finish()

    expect(turn).toEqual({ marked: false, frame: null, error: null })
    expect(target.captures).toEqual([])
    expect(target.overlay.composeInputs).toEqual([])
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
  })

  it('stops polling after finish', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    await drawLine(target)
    const pointCount = target.overlay.points.length
    await target.service.finish()

    target.moveCursor({ x: DISPLAY.bounds.x + 300, y: DISPLAY.bounds.y })
    await vi.advanceTimersByTimeAsync(64)

    expect(target.overlay.points).toHaveLength(pointCount)
  })

  it('returns a clean error when the overlay finish times out', async () => {
    vi.useFakeTimers()
    const overlay = new FakeOverlay()
    overlay.hangFinish = true
    const target = setup({ overlay })

    target.service.begin()
    await drawLine(target)
    const pending = target.service.finish()
    await vi.advanceTimersByTimeAsync(1_500)
    const turn = await pending

    expect(turn.marked).toBe(true)
    expect(turn.frame).toBeNull()
    expect(turn.error).toMatch(/timed out/i)
    expect(target.captures).toEqual([])
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
    expect(target.overlay.hideCalls).toBeGreaterThanOrEqual(1)
  })

  it('returns a clean error when capture fails', async () => {
    vi.useFakeTimers()
    const target = setup({
      captureDisplay: async () => {
        throw new Error('No screen source matched this monitor.')
      }
    })

    target.service.begin()
    await drawLine(target)
    const turn = await target.service.finish()

    expect(turn.marked).toBe(true)
    expect(turn.frame).toBeNull()
    expect(turn.error).toContain('No screen source matched this monitor.')
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
    expect(target.overlay.hideCalls).toBeGreaterThanOrEqual(1)
  })

  it('returns a clean error when capture hangs', async () => {
    vi.useFakeTimers()
    const target = setup({
      captureDisplay: () => new Promise<Uint8Array>(() => undefined)
    })

    target.service.begin()
    await drawLine(target)
    const pending = target.service.finish()
    await vi.advanceTimersByTimeAsync(5_000)
    const turn = await pending

    expect(turn.marked).toBe(true)
    expect(turn.frame).toBeNull()
    expect(turn.error).toMatch(/timed out/i)
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
  })

  it('returns a clean error when composing fails', async () => {
    vi.useFakeTimers()
    const overlay = new FakeOverlay()
    overlay.composeError = new Error('The overlay renderer crashed.')
    const target = setup({ overlay })

    target.service.begin()
    await drawLine(target)
    const turn = await target.service.finish()

    expect(turn.marked).toBe(true)
    expect(turn.frame).toBeNull()
    expect(turn.error).toContain('The overlay renderer crashed.')
    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
  })

  it('captures the locked display for a no-mark screen question', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    target.setDisplay(OTHER_DISPLAY)

    const frame = await target.service.capture()

    expect(frame.mimeType).toBe('image/png')
    expect(frame.imageBase64).toBe(Buffer.from(CLEAN_PNG).toString('base64'))
    expect(target.captures.at(-1)).toEqual(DISPLAY)
    target.service.cancel()
  })

  it('waits for the overlay to settle before capturing an active hold', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    await target.service.capture()

    expect(target.overlay.hideCalls).toBeGreaterThanOrEqual(1)
    expect(target.sleeps).toEqual([100])
  })

  it('waits for the overlay to settle after an unmarked finish', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    const turn = await target.service.finish()
    expect(turn.marked).toBe(false)

    await target.service.capture()

    expect(target.sleeps).toEqual([100])
  })

  it('uses the display under the cursor when there is no active hold', async () => {
    const target = setup()
    target.setDisplay(OTHER_DISPLAY)

    await target.service.capture()

    expect(target.captures).toEqual([OTHER_DISPLAY])
  })

  it('cancel clears the trail, hides the overlay, and stops polling', async () => {
    vi.useFakeTimers()
    const target = setup()

    target.service.begin()
    await drawLine(target)
    const points = target.overlay.points.length
    target.service.cancel()
    target.moveCursor({ x: DISPLAY.bounds.x + 400, y: DISPLAY.bounds.y })
    await vi.advanceTimersByTimeAsync(64)

    expect(target.overlay.cancelCalls).toBeGreaterThanOrEqual(1)
    expect(target.overlay.points).toHaveLength(points)
    expect(target.captures).toEqual([])
  })
})
