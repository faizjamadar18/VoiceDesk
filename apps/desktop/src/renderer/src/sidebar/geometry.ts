/*
 * VoiceOS Side Notch geometry & math - VERBATIM PORT.
 *
 * Formulas and constants extracted from VoiceOS 0.1.40 renderer bundle.
 */

/** Visual width of the expanded sidebar notch panel. */
export const NOTCH_EXPANDED_WIDTH_PX = 232

/** Visual height of the expanded sidebar notch panel. */
export const NOTCH_EXPANDED_HEIGHT_PX = 580

/** Radius of the rounded right edge corners. */
export const NOTCH_RIGHT_RADIUS_PX = 31

/** Shoulder depth of the top and bottom concave transitions to the screen edge. */
export const NOTCH_SHOULDER_PX = 31

/** Number of sample points for each bezier arc in the clip-path polygon. */
export const NOTCH_ARC_SAMPLES = 10

/** Height of the header section containing search and pin controls. */
export const NOTCH_HEADER_HEIGHT_PX = NOTCH_SHOULDER_PX + 60 // 91px

/** Bottom safe area padding for the list shell. */
export const NOTCH_BOTTOM_SAFE_AREA_PX = 0

/** Scroll end padding to clear the bottom shoulder curve. */
export const NOTCH_SCROLL_END_PADDING_PX = NOTCH_SHOULDER_PX + 42 // 73px

/** Width of the resting collapsed sliver handle. */
export const SLIVER_WIDTH = 16

/** Width of the sliver handle when hovered ("pops back out"). */
export const SLIVER_HOVER_WIDTH = 18

/** Shoulder radius for the collapsed sliver handle. */
export const SLIVER_SHOULDER = 4

/** Minimum vertical height of the sliver handle. */
export const SLIVER_MIN_HEIGHT = 48

/** Diameter of each activity indicator dot in the sliver. */
export const SLIVER_DOT_SIZE = 6

/** Vertical gap between activity indicator dots. */
export const SLIVER_DOT_GAP = 8

/** Maximum number of activity dots displayed in the sliver. */
export const SLIVER_MAX_DOTS = 5

/** Pointer movement threshold in pixels before initiating vertical drag. */
export const SLIVER_DRAG_THRESHOLD = 4

/** LocalStorage key for persisting the normalized sliver position. */
export const SLIVER_POSITION_KEY = 'kestrel.sideNotch.sliverPosition'

/** Maximum title characters displayed in history list rows. */
export const ROW_TITLE_MAX_CHARS = 74

/** Session gap in milliseconds (1 hour) used to group consecutive turns. */
export const SESSION_GAP_MS = 60 * 60 * 1000

/** Horizontal offset in pixels for positioning the sliver popover. */
export const SLIVER_POPOVER_LEFT = 26

/** Transition timing curves from VoiceOS. */
export const NOTCH_SIZE_TRANSITION_BEZIER = [0.45, 0, 0.55, 1] as const
export const NOTCH_SIZE_TRANSITION_EASING = `cubic-bezier(${NOTCH_SIZE_TRANSITION_BEZIER.join(', ')})`

export const OPENING_BEZIER = [0.2, 0.8, 0.2, 1] as const
export const OPENING_TIMING = {
  durationMs: 280,
  bezier: OPENING_BEZIER,
  easing: `cubic-bezier(${OPENING_BEZIER.join(', ')})`
} as const

export const CLOSING_TIMING = {
  durationMs: 200,
  bezier: NOTCH_SIZE_TRANSITION_BEZIER,
  easing: NOTCH_SIZE_TRANSITION_EASING
} as const

export const SLIVER_VISIBILITY_TRANSITION_MS = 180
export const SLIVER_DOT_REVEAL_DELAY_MS = 45
export const SLIVER_VISIBILITY_BEZIER = [0.4, 0, 0.2, 1] as const
export const SLIVER_VISIBILITY_EASING = `cubic-bezier(${SLIVER_VISIBILITY_BEZIER.join(', ')})`

/**
 * Builds the CSS polygon clip-path string for the side notch silhouette.
 * Follows the exact VoiceOS formula sampling arcs for the concave shoulders and convex right corners.
 */
export const buildSideNotchClipPath = (
  width: number,
  height: number,
  shoulder: number,
  radius: number,
  top: number = (NOTCH_EXPANDED_HEIGHT_PX - height) / 2
): string => {
  const W2 = width
  const H2 = height
  const S2 = shoulder
  const R2 = radius
  const Sy = W2 === 0 ? Math.min(12, H2 / 4) : W2 <= SLIVER_HOVER_WIDTH ? S2 * 1.5 : S2
  const Ry = Math.max(0, Math.min(W2 === 0 ? NOTCH_RIGHT_RADIUS_PX : R2, H2 / 2 - Sy))
  const pts: [string, string][] = []
  const point2 = (value: number) => `${value.toFixed(3)}px`

  pts.push([point2(0), point2(top)])
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = Math.PI - (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    pts.push([
      point2(S2 + S2 * Math.cos(theta)),
      point2(top + Sy * Math.sin(theta))
    ])
  }
  pts.push([point2(W2 - R2), point2(top + Sy)])
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -Math.PI / 2 + (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    pts.push([
      point2(W2 - R2 + R2 * Math.cos(theta)),
      point2(top + Sy + Ry + Ry * Math.sin(theta))
    ])
  }
  pts.push([point2(W2), point2(top + H2 - (Sy + Ry))])
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    pts.push([
      point2(W2 - R2 + R2 * Math.cos(theta)),
      point2(top + H2 - (Sy + Ry - Ry * Math.sin(theta)))
    ])
  }
  pts.push([point2(S2), point2(top + H2 - Sy)])
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -Math.PI / 2 - (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    pts.push([
      point2(S2 + S2 * Math.cos(theta)),
      point2(top + H2 + Sy * Math.sin(theta))
    ])
  }
  return `polygon(${pts.map(([x, y]) => `${x} ${y}`).join(', ')})`
}

/**
 * Calculates the dynamic height of the sliver handle based on dot count.
 */
export function sliverHeight(dotCount: number): number {
  const count = Math.max(0, Math.min(SLIVER_MAX_DOTS, dotCount))
  return Math.max(
    SLIVER_MIN_HEIGHT,
    count * SLIVER_DOT_SIZE + Math.max(0, count - 1) * SLIVER_DOT_GAP + 32
  )
}

/**
 * Normalizes a vertical sliver position into the [0, 1] range.
 */
export function normalizeSliverPosition(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5
}

/**
 * Clamps the sliver top coordinate so it does not collide with the top or bottom edges.
 */
export function clampSliverTop(
  top: number,
  height: number,
  panelHeight: number,
  edgeInset: number
): number {
  return Math.max(edgeInset, Math.min(panelHeight - edgeInset - height, top))
}

/**
 * Computes the top pixel coordinate of the sliver given normalized position.
 */
export function sliverTop(
  position: number,
  height: number,
  panelHeight: number,
  edgeInset: number
): number {
  return clampSliverTop(
    normalizeSliverPosition(position) * panelHeight - height / 2,
    height,
    panelHeight,
    edgeInset
  )
}

/**
 * Calculates the new normalized sliver position during dragging.
 */
export function dragSliverPosition({
  startTop,
  deltaY,
  height,
  panelHeight,
  edgeInset
}: {
  startTop: number
  deltaY: number
  height: number
  panelHeight: number
  edgeInset: number
}): number {
  const top = clampSliverTop(startTop + deltaY, height, panelHeight, edgeInset)
  return (top + height / 2) / panelHeight
}

/**
 * Tests whether a point falls within the sliver bounding box.
 */
export function isPointInSliver(
  x: number,
  y: number,
  width: number,
  height: number,
  top: number
): boolean {
  return x >= 0 && x <= width && y >= top && y <= top + height
}

/**
 * Tests whether a point (x, y) in viewport coordinates lies inside the curved expanded notch contour.
 */
export const isPointInExpandedNotch = (
  x: number,
  y: number,
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800
): boolean => {
  const localY = y - (viewportHeight - NOTCH_EXPANDED_HEIGHT_PX) / 2
  const W2 = NOTCH_EXPANDED_WIDTH_PX
  const H2 = NOTCH_EXPANDED_HEIGHT_PX
  const S2 = NOTCH_SHOULDER_PX
  const R2 = NOTCH_RIGHT_RADIUS_PX

  if (x < 0 || x > W2 || localY < 0 || localY > H2) return false

  // Top concave shoulder
  if (localY < S2) {
    const boundaryX = S2 - Math.sqrt(Math.max(0, S2 * S2 - localY * localY))
    return x <= boundaryX
  }

  // Bottom concave shoulder
  if (localY > H2 - S2) {
    const dy = H2 - localY
    const boundaryX = S2 - Math.sqrt(Math.max(0, S2 * S2 - dy * dy))
    return x <= boundaryX
  }

  // Top-right convex corner
  const topRightCx = W2 - R2
  const topRightCy = S2 + R2
  if (x > topRightCx && localY < topRightCy) {
    return (
      (x - topRightCx) * (x - topRightCx) + (localY - topRightCy) * (localY - topRightCy) <= R2 * R2
    )
  }

  // Bottom-right convex corner
  const bottomRightCx = W2 - R2
  const bottomRightCy = H2 - S2 - R2
  if (x > bottomRightCx && localY > bottomRightCy) {
    return (
      (x - bottomRightCx) * (x - bottomRightCx) +
        (localY - bottomRightCy) * (localY - bottomRightCy) <=
      R2 * R2
    )
  }

  return true
}

/**
 * Formats a timestamp into a human-readable date header.
 * E.g. "Today, 1:02 PM", "Yesterday, 5:06 PM", "Mon, Oct 12, 1:02 PM".
 */
export const formatSessionHeader = (
  timestamp: number | string,
  nowMs: number = Date.now()
): string => {
  const timestampMs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 'Earlier'

  const date = new Date(timestampMs)
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(new Date(nowMs)) - startOfDay(date)) / 864e5)

  if (dayDiff <= 0) return `Today, ${time}`
  if (dayDiff === 1) return `Yesterday, ${time}`

  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
  return `${dateStr}, ${time}`
}

/**
 * Cleans and truncates a prompt or title string to a maximum number of characters.
 */
export function truncateTitle(text: string, maxChars: number = ROW_TITLE_MAX_CHARS): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxChars) return cleaned
  return cleaned.slice(0, maxChars).trimEnd() + '…'
}
