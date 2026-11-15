export const MIN_BAR_HEIGHT = 2
export const MAX_BAR_HEIGHT = 17
export const TICK_MS = 58
export const DICTATION_WAVEFORM_BAR_WIDTH = 2.5
export const DICTATION_WAVEFORM_BAR_GAP = 1.5
export const BAR_COUNT = 7

const GATE = 0.012
const KNEE = 0.08

export function compressVolume(raw: number, previousSmoothed: number): number {
  const gated = raw > GATE ? raw - GATE : 0
  const rooted = gated > 0 ? Math.sqrt(gated) : 0
  const compressed = rooted < KNEE ? (rooted * rooted) / KNEE : rooted
  const alpha = compressed > previousSmoothed ? 0.45 : 0.14
  return previousSmoothed + (compressed - previousSmoothed) * alpha
}

export function computeBarHeight(vol: number): number {
  const baseScale = Math.min(1, vol * 2.4)
  const jitter = vol > 0 ? 0.85 + Math.random() * 0.3 : 1
  const scale = Math.min(1, baseScale * jitter)
  return MIN_BAR_HEIGHT + scale * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT)
}

export function shiftHeights(currentHeights: number[], newHeight: number): number[] {
  const next = new Array<number>(currentHeights.length)
  for (let i = 0; i < currentHeights.length - 1; i++) {
    next[i] = currentHeights[i + 1]
  }
  next[next.length - 1] = newHeight
  return next
}

export function computeBarColor(
  height: number,
  minHeight: number = MIN_BAR_HEIGHT,
  maxHeight: number = MAX_BAR_HEIGHT
): string {
  const t = Math.min(1, Math.max(0, (height - minHeight) / (maxHeight - minHeight)))
  const eased = Math.pow(t, 1.5)
  const v = Math.round(110 + eased * (255 - 110))
  return `rgb(${v}, ${v}, ${v})`
}
