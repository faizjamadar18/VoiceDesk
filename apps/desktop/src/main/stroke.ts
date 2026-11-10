export interface ScreenPoint {
  x: number
  y: number
}

/** A point closer than this to the last accepted point is pointer jitter. */
export const MIN_POINT_DISTANCE_DIP = 1.5
/** A mark needs at least this much travel to be deliberate. */
export const MIN_PATH_LENGTH_DIP = 24
/** A mark needs a visible extent, so a tiny scribble cannot qualify. */
export const MIN_EXTENT_DIP = 12

function isFinitePoint(point: ScreenPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * Accumulates one freehand mark in display-relative DIP coordinates. Jitter is
 * filtered at add time; `marked` only turns true for a stroke that is both long
 * enough and wide enough to be intentional.
 */
export class StrokeTracker {
  private readonly tracked: ScreenPoint[] = []
  private last: ScreenPoint | null = null
  private pathLength = 0
  private minX = 0
  private minY = 0
  private maxX = 0
  private maxY = 0

  add(point: ScreenPoint): boolean {
    if (!isFinitePoint(point)) return false

    const last = this.last
    if (last === null) {
      this.accept(point)
      return true
    }

    const distance = Math.hypot(point.x - last.x, point.y - last.y)
    if (distance < MIN_POINT_DISTANCE_DIP) return false

    this.pathLength += distance
    this.accept(point)
    return true
  }

  get marked(): boolean {
    const extent = Math.max(this.maxX - this.minX, this.maxY - this.minY)
    return this.pathLength >= MIN_PATH_LENGTH_DIP && extent >= MIN_EXTENT_DIP
  }

  get points(): readonly ScreenPoint[] {
    return this.tracked.map((point) => ({ ...point }))
  }

  reset(): void {
    this.tracked.length = 0
    this.last = null
    this.pathLength = 0
    this.minX = 0
    this.minY = 0
    this.maxX = 0
    this.maxY = 0
  }

  private accept(point: ScreenPoint): void {
    const next = { x: point.x, y: point.y }
    if (this.last === null) {
      this.minX = next.x
      this.minY = next.y
      this.maxX = next.x
      this.maxY = next.y
    } else {
      this.minX = Math.min(this.minX, next.x)
      this.minY = Math.min(this.minY, next.y)
      this.maxX = Math.max(this.maxX, next.x)
      this.maxY = Math.max(this.maxY, next.y)
    }
    this.tracked.push(next)
    this.last = next
  }
}
