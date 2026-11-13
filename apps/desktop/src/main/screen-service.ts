import type { ScreenOverlayPoint } from '../shared/types'
import { StrokeTracker } from './stroke'

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenDisplay {
  id: number
  /** DIP bounds in the virtual screen coordinate space. */
  bounds: ScreenRect
  /** DIP size of the display. */
  size: { width: number; height: number }
  scaleFactor: number
}

export interface ScreenFrame {
  imageBase64: string
  mimeType: 'image/png'
}

export interface ScreenTurn {
  marked: boolean
  frame: ScreenFrame | null
  error: string | null
}

export interface ScreenService {
  begin(): void
  finish(): Promise<ScreenTurn>
  capture(): Promise<ScreenFrame>
  cancel(): void
}

/** The pure seam over the Electron overlay window. */
export interface ScreenOverlayController {
  show(bounds: ScreenRect, initialCursor?: ScreenOverlayPoint): void
  hide(): void
  point(point: ScreenOverlayPoint): void
  finish(): Promise<void>
  compose(image: Uint8Array): Promise<Uint8Array>
  cancel(): void
}

export interface OverlayScreenServiceOptions {
  overlay: ScreenOverlayController
  /** Cursor in virtual-screen DIP coordinates. */
  cursorPoint: () => ScreenOverlayPoint
  displayUnderCursor: () => ScreenDisplay
  /** Captures the full display in its physical pixel size. */
  captureDisplay: (display: ScreenDisplay) => Promise<Uint8Array>
  pollIntervalMs?: number
  overlayFinishTimeoutMs?: number
  captureTimeoutMs?: number
  composeTimeoutMs?: number
  overlaySettleMs?: number
  sleep?: (ms: number) => Promise<void>
}

export const SCREEN_POLL_INTERVAL_MS = 16
export const OVERLAY_FINISH_TIMEOUT_MS = 1_500
export const SCREEN_CAPTURE_TIMEOUT_MS = 5_000
export const OVERLAY_COMPOSE_TIMEOUT_MS = 5_000
export const OVERLAY_SETTLE_MS = 100

interface ActiveHold {
  display: ScreenDisplay
  timer: NodeJS.Timeout
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Orchestrates one hold across the display lock, the transparent overlay, a
 * clean capture, and full-resolution trail compositing. No Electron imports:
 * the window, cursor, display, capture, and timers are injected so the whole
 * flow is unit-testable.
 */
export class OverlayScreenService implements ScreenService {
  private readonly options: OverlayScreenServiceOptions
  private readonly tracker = new StrokeTracker()
  private readonly pollIntervalMs: number
  private readonly overlayFinishTimeoutMs: number
  private readonly captureTimeoutMs: number
  private readonly composeTimeoutMs: number
  private readonly overlaySettleMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private active: ActiveHold | null = null
  private lockedDisplay: ScreenDisplay | null = null
  private pendingFinish: Promise<ScreenTurn> | null = null

  constructor(options: OverlayScreenServiceOptions) {
    this.options = options
    this.pollIntervalMs = options.pollIntervalMs ?? SCREEN_POLL_INTERVAL_MS
    this.overlayFinishTimeoutMs = options.overlayFinishTimeoutMs ?? OVERLAY_FINISH_TIMEOUT_MS
    this.captureTimeoutMs = options.captureTimeoutMs ?? SCREEN_CAPTURE_TIMEOUT_MS
    this.composeTimeoutMs = options.composeTimeoutMs ?? OVERLAY_COMPOSE_TIMEOUT_MS
    this.overlaySettleMs = options.overlaySettleMs ?? OVERLAY_SETTLE_MS
    this.sleep =
      options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  }

  begin(): void {
    if (this.active) this.cancel()

    let display: ScreenDisplay
    try {
      display = this.options.displayUnderCursor()
    } catch (error) {
      console.error('[screen] could not find the display under the cursor', error)
      return
    }

    this.lockedDisplay = display
    this.tracker.reset()

    let initialCursor: ScreenOverlayPoint | undefined
    try {
      const rawCursor = this.options.cursorPoint()
      initialCursor = {
        x: rawCursor.x - display.bounds.x,
        y: rawCursor.y - display.bounds.y
      }
    } catch {
      // cursorPoint unavailable or failed
    }

    try {
      this.options.overlay.show(display.bounds, initialCursor)
    } catch (error) {
      console.error('[screen] could not show the overlay', error)
      this.lockedDisplay = null
      return
    }

    const timer = setInterval(() => {
      const active = this.active
      if (active) this.sampleCursor(active.display)
    }, this.pollIntervalMs)
    this.active = { display, timer }
    this.sampleCursor(display)
  }

  async finish(): Promise<ScreenTurn> {
    if (this.pendingFinish) return this.pendingFinish

    const pending = this.runFinish()
    this.pendingFinish = pending
    try {
      return await pending
    } finally {
      if (this.pendingFinish === pending) this.pendingFinish = null
    }
  }

  async capture(): Promise<ScreenFrame> {
    // A capture may follow an unmarked finish (the overlay was just hidden) or
    // interrupt an active hold. In both cases the window must be off the
    // compositor before Windows will hand back a clean frame.
    const overlayWasVisible = this.active !== null || this.lockedDisplay !== null
    if (this.active) {
      clearInterval(this.active.timer)
      this.active = null
      this.safeHideOverlay()
    }

    const display = this.lockedDisplay ?? this.options.displayUnderCursor()
    try {
      if (overlayWasVisible) await this.sleep(this.overlaySettleMs)
      const image = await withTimeout(
        this.options.captureDisplay(display),
        this.captureTimeoutMs,
        'Screen capture timed out. Try again.'
      )
      return { imageBase64: toBase64(image), mimeType: 'image/png' }
    } finally {
      this.lockedDisplay = null
    }
  }

  cancel(): void {
    if (this.active) {
      clearInterval(this.active.timer)
      this.active = null
    }
    this.tracker.reset()
    this.lockedDisplay = null
    try {
      this.options.overlay.cancel()
    } catch (error) {
      console.error('[screen] could not cancel the overlay', error)
    }
  }

  /** Quit-time cleanup: cancels the hold and lets the presenter dispose its window. */
  dispose(): void {
    this.cancel()
  }

  private async runFinish(): Promise<ScreenTurn> {
    const active = this.active
    if (!active) {
      this.tracker.reset()
      this.safeCancelOverlay()
      return { marked: false, frame: null, error: null }
    }

    clearInterval(active.timer)
    this.active = null

    // No mark means no capture and no vision request. This is the cheap path
    // for normal commands and for a hold that never drew anything.
    if (!this.tracker.marked) {
      this.tracker.reset()
      this.safeCancelOverlay()
      return { marked: false, frame: null, error: null }
    }

    try {
      // Let the renderer process every queued point before the trail is hidden.
      await withTimeout(
        this.options.overlay.finish(),
        this.overlayFinishTimeoutMs,
        'The screen overlay timed out while finishing.'
      )
      this.options.overlay.hide()

      // Windows needs a beat to composite the transparent window away before
      // the clean capture, otherwise a fade can leak into the screenshot.
      await this.sleep(this.overlaySettleMs)

      const clean = await withTimeout(
        this.options.captureDisplay(active.display),
        this.captureTimeoutMs,
        'Screen capture timed out. Try again.'
      )
      const annotated = await withTimeout(
        this.options.overlay.compose(clean),
        this.composeTimeoutMs,
        'Screen annotation timed out. Try again.'
      )
      if (annotated.length === 0) {
        throw new Error('The annotated screen image was empty.')
      }

      return {
        marked: true,
        frame: { imageBase64: toBase64(annotated), mimeType: 'image/png' },
        error: null
      }
    } catch (error) {
      return { marked: true, frame: null, error: errorMessage(error) }
    } finally {
      this.safeHideOverlay()
      this.tracker.reset()
      this.safeCancelOverlay()
    }
  }

  private sampleCursor(display: ScreenDisplay): void {
    let point: ScreenOverlayPoint
    try {
      point = this.options.cursorPoint()
    } catch (error) {
      console.error('[screen] could not read the cursor position', error)
      return
    }

    const relative = { x: point.x - display.bounds.x, y: point.y - display.bounds.y }
    if (
      relative.x < 0 ||
      relative.y < 0 ||
      relative.x >= display.bounds.width ||
      relative.y >= display.bounds.height
    ) {
      return
    }

    if (this.tracker.add(relative)) this.options.overlay.point(relative)
  }

  private safeCancelOverlay(): void {
    try {
      this.options.overlay.cancel()
    } catch (error) {
      console.error('[screen] could not clear the overlay', error)
    }
  }

  private safeHideOverlay(): void {
    try {
      this.options.overlay.hide()
    } catch (error) {
      console.error('[screen] could not hide the overlay', error)
    }
  }
}
