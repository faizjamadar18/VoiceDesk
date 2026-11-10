/**
 * The renderer owns layout, so it reports the results card rectangle in CSS
 * pixels (Electron DIP). The main process decides whether the global cursor is
 * inside it and toggles click-through accordingly.
 */
import type { NotchInteractiveRegion } from '../shared/types'

export interface ScreenPoint {
  x: number
  y: number
}

export interface ScreenBounds {
  x: number
  y: number
  width: number
  height: number
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeInteractiveRegion(value: unknown): NotchInteractiveRegion | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const { left, top, width, height } = record
  if (!finite(left) || !finite(top) || !finite(width) || !finite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}

export function pointInInteractiveRegion(
  point: ScreenPoint,
  bounds: ScreenBounds,
  region: NotchInteractiveRegion | null
): boolean {
  if (region === null) return false
  const x = point.x - bounds.x
  const y = point.y - bounds.y
  return (
    x >= region.left &&
    x < region.left + region.width &&
    y >= region.top &&
    y < region.top + region.height
  )
}
