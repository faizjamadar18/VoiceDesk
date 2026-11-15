export const MIN_BAR_HEIGHT = 2
export const MAX_BAR_HEIGHT = 18
export const TICK_MS = 58
export const DICTATION_WAVEFORM_BAR_WIDTH = 2.5
export const DICTATION_WAVEFORM_BAR_GAP = 1.5
export const BAR_COUNT = 5

export const NOISE_GATE = 0.012
export const SOFT_KNEE = 0.08
export const ATTACK_FILTER = 0.45
export const RELEASE_FILTER = 0.14

export const PEAK_HALF_LIFE_SECONDS = 5
export const NORMALIZATION_TARGET = 0.15
export const MIN_PEAK_FLOOR = 0.02
export const WARMUP_MS = 400

export class AgcNormalizer {
  private runningPeak = 0
  private lastVolumeTime = 0
  private captureStartTime = 0

  reset(now = Date.now()): void {
    this.runningPeak = 0
    this.lastVolumeTime = 0
    this.captureStartTime = now
  }

  normalizeVolume(rawVolume: number, now = Date.now()): number {
    const dt = this.lastVolumeTime > 0 ? (now - this.lastVolumeTime) / 1000 : 0
    this.lastVolumeTime = now
    if (dt > 0 && dt < 2) {
      this.runningPeak *= Math.pow(0.5, dt / PEAK_HALF_LIFE_SECONDS)
    }
    if (rawVolume > this.runningPeak) {
      this.runningPeak = rawVolume
    }
    const effectivePeak = Math.max(this.runningPeak, MIN_PEAK_FLOOR)
    const gain = NORMALIZATION_TARGET / effectivePeak
    let volume = Math.min(rawVolume * gain, 1)
    const elapsed = now - this.captureStartTime
    if (elapsed < WARMUP_MS) {
      volume *= elapsed / WARMUP_MS
    }
    return volume
  }

  getPeak(): number {
    return this.runningPeak
  }
}

export function normalizeNotchVolume(
  rms: number,
  agc: AgcNormalizer,
  now = Date.now()
): number {
  return agc.normalizeVolume(rms, now)
}

export function compressVolume(raw: number, previousSmoothed: number): number {
  const gated = raw > NOISE_GATE ? raw - NOISE_GATE : 0
  const rooted = gated > 0 ? Math.sqrt(gated) : 0
  const compressed = rooted < SOFT_KNEE ? (rooted * rooted) / SOFT_KNEE : rooted
  const alpha = compressed > previousSmoothed ? ATTACK_FILTER : RELEASE_FILTER
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
