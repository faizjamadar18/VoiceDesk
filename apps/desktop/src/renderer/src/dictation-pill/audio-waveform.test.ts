import { describe, expect, it } from 'vitest'
import {
  computeBarColor,
  computeBarHeight,
  compressVolume,
  shiftHeights,
  MIN_BAR_HEIGHT,
  MAX_BAR_HEIGHT,
  BAR_COUNT,
  AgcNormalizer,
  NORMALIZATION_TARGET,
  MIN_PEAK_FLOOR,
  normalizeNotchVolume
} from './audio-waveform'
import {
  TIMING_ANCHORS,
  CHARGE_ASYMPTOTE,
  CRUISE_END_PROGRESS,
  getDictationChargeProgress,
  getDictationProgressMotionProfile,
  getRoundCappedArcProgress,
  stepDictationRelease
} from './DictationProgressRing'

describe('audio-waveform shift-register and compression logic', () => {
  it('has BAR_COUNT equal to 5 (VoiceOS standard)', () => {
    expect(BAR_COUNT).toBe(5)
  })

  it('shifts heights left and appends newHeight to the end with 5 bars', () => {
    const initial = [2, 2, 2, 2, 2]
    const updated = shiftHeights(initial, 10)
    expect(updated).toEqual([2, 2, 2, 2, 10])
    expect(updated).toHaveLength(5)

    const next = shiftHeights(updated, 15)
    expect(next).toEqual([2, 2, 2, 10, 15])
    expect(next).toHaveLength(5)
  })

  it('gates audio volume below noise gate threshold (0.012)', () => {
    const gated = compressVolume(0.005, 0)
    expect(gated).toBe(0)
  })

  it('compresses audio volume above gate with soft knee (0.08) and dual attack/release filter', () => {
    const low = compressVolume(0.02, 0)
    expect(low).toBeGreaterThan(0)
    expect(low).toBeLessThan(0.1)

    const loud = compressVolume(0.5, 0)
    expect(loud).toBeGreaterThan(low)
    expect(loud).toBeLessThanOrEqual(1)

    // Release phase
    const decayed = compressVolume(0, loud)
    expect(decayed).toBeLessThan(loud)
    expect(decayed).toBeGreaterThan(0)
  })

  it('maps bar heights to non-linear rgb(110..255) colors', () => {
    const minColor = computeBarColor(MIN_BAR_HEIGHT, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(minColor).toBe('rgb(110, 110, 110)')

    const maxColor = computeBarColor(MAX_BAR_HEIGHT, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(maxColor).toBe('rgb(255, 255, 255)')

    const midColor = computeBarColor(10, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT)
    expect(midColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('normalizes raw volume using AGC running peak and warmup scaling', () => {
    const agc = new AgcNormalizer()
    const startTime = 1000
    agc.reset(startTime)

    // During warmup (first 400ms), volume is scaled down by elapsed / 400
    const rawInput = 0.05
    const warmupVol = agc.normalizeVolume(rawInput, startTime + 200)
    const expectedGain = NORMALIZATION_TARGET / Math.max(rawInput, MIN_PEAK_FLOOR)
    const expectedVol = Math.min(rawInput * expectedGain, 1) * (200 / 400)
    expect(warmupVol).toBeCloseTo(expectedVol, 4)

    // After warmup (> 400ms)
    const postWarmupVol = agc.normalizeVolume(rawInput, startTime + 500)
    expect(postWarmupVol).toBeCloseTo(Math.min(rawInput * expectedGain, 1), 4)

    // Running peak tracks higher signals
    agc.normalizeVolume(0.3, startTime + 600)
    expect(agc.getPeak()).toBeCloseTo(0.3, 4)
  })

  it('prevents Agent mode notch waveform from prematurely maxing out on small audio spikes', () => {
    const agc = new AgcNormalizer()
    const startTime = 1000
    agc.reset(startTime)

    // Simulate steady speaking level
    const speechRms = 0.05
    const normalizedSpeech = normalizeNotchVolume(speechRms, agc, startTime + 500)
    const compressedSpeech = compressVolume(normalizedSpeech, 0)
    const naturalHeight = computeBarHeight(compressedSpeech)

    // The old naive scaling (rms * 6 = 0.3) would result in:
    const oldBuggyRaw = Math.min(1, speechRms * 6)
    // After a couple smoothing ticks, old behavior maxed out:
    const oldSaturatedCompressed = Math.sqrt(oldBuggyRaw - 0.012)
    const oldMaxHeight = Math.min(MAX_BAR_HEIGHT, MIN_BAR_HEIGHT + Math.min(1, oldSaturatedCompressed * 2.4) * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT))

    // Old behavior is maxed out at MAX_BAR_HEIGHT
    expect(oldMaxHeight).toBe(MAX_BAR_HEIGHT)

    // New natural VoiceOS AGC scaling produces natural height with headroom
    expect(naturalHeight).toBeLessThan(MAX_BAR_HEIGHT)
    expect(naturalHeight).toBeGreaterThan(MIN_BAR_HEIGHT)

    // Small transient spike (e.g., breath or background tap rms = 0.02)
    const spikeRms = 0.02
    const normalizedSpike = normalizeNotchVolume(spikeRms, agc, startTime + 700)
    const compressedSpike = compressVolume(normalizedSpike, 0)
    const spikeHeight = computeBarHeight(compressedSpike)

    // Spike must remain well below peak height rather than blowing up
    expect(spikeHeight).toBeLessThan(12)
    expect(spikeHeight).toBeGreaterThanOrEqual(MIN_BAR_HEIGHT)
  })
})

describe('DictationProgressRing 5-phase mathematical model', () => {
  it('interpolates timing anchors correctly based on speech duration', () => {
    expect(TIMING_ANCHORS).toHaveLength(7)
    // 0ms recording -> 1.6s target duration
    const profile0 = getDictationProgressMotionProfile(0)
    expect(profile0.targetDurationSec).toBe(1.6)

    // 10s recording -> 1.6s
    const profile10 = getDictationProgressMotionProfile(10_000)
    expect(profile10.targetDurationSec).toBe(1.6)

    // 45s recording -> 2.25s
    const profile45 = getDictationProgressMotionProfile(45_000)
    expect(profile45.targetDurationSec).toBe(2.25)

    expect(profile0.asymptote).toBe(CHARGE_ASYMPTOTE)
    expect(profile0.cruiseVelocity).toBeGreaterThan(0)
  })

  it('computes 5-phase charging progress accurately without prematurely hitting 100%', () => {
    const profile = getDictationProgressMotionProfile(5_000)

    // Phase 1: t <= 0.4s fast expansion
    const p1 = getDictationChargeProgress(0.2, 5_000, profile)
    expect(p1).toBeGreaterThan(0)
    expect(p1).toBeLessThan(0.6)

    // Phase 2: polynomial blend at 0.5s
    const p2 = getDictationChargeProgress(0.5, 5_000, profile)
    expect(p2).toBeGreaterThan(p1)

    // Phase 3: linear cruise up to 88%
    const p3 = getDictationChargeProgress(profile.targetDurationSec, 5_000, profile)
    expect(p3).toBeCloseTo(CRUISE_END_PROGRESS, 2)

    // Phase 4: asymptotic arctan overrun approaching 97.5%
    const p4Long = getDictationChargeProgress(10, 5_000, profile)
    expect(p4Long).toBeGreaterThan(CRUISE_END_PROGRESS)
    expect(p4Long).toBeLessThan(CHARGE_ASYMPTOTE)
    expect(p4Long).toBeLessThan(1.0)
  })

  it('compensates round stroke caps so SVG stroke does not bleed at 0 or 1', () => {
    const circumference = 100
    const strokeWidth = 2.5
    expect(getRoundCappedArcProgress(0, circumference, strokeWidth)).toBe(0)
    expect(getRoundCappedArcProgress(0.5, circumference, strokeWidth)).toBeCloseTo(
      0.5 - strokeWidth / circumference,
      5
    )
    expect(getRoundCappedArcProgress(1, circumference, strokeWidth)).toBe(1)
  })

  it('sweeps to 100% on release via jerk-limited spring', () => {
    let progress = 0.8
    let velocity = 0.5
    let acceleration = 0

    for (let step = 0; step < 20; step++) {
      const res = stepDictationRelease(progress, velocity, 0.016, acceleration)
      progress = res.progress
      velocity = res.velocity
      acceleration = res.acceleration
      if (res.done) break
    }

    expect(progress).toBe(1)
  })
})

