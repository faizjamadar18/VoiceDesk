import React, { useEffect, useMemo, useRef } from 'react'

export const CHARGE_JOIN_SEC = 0.4
export const CHARGE_ASYMPTOTE = 0.975
export const openingProgress = (t: number): number =>
  0.75 * (1 - Math.exp(-t / 0.3)) + 0.225 * (1 - Math.exp(-t / 1.5))
export const JOIN_PROGRESS = openingProgress(CHARGE_JOIN_SEC)
export const JOIN_VELOCITY =
  (0.75 / 0.3) * Math.exp(-CHARGE_JOIN_SEC / 0.3) +
  (0.225 / 1.5) * Math.exp(-CHARGE_JOIN_SEC / 1.5)
export const JOIN_ACCELERATION =
  -8.333333333333334 * Math.exp(-CHARGE_JOIN_SEC / 0.3) -
  (0.225 / 1.5 ** 2) * Math.exp(-CHARGE_JOIN_SEC / 1.5)
export const SETTLE_DURATION_SEC = 0.25
export const CRUISE_END_PROGRESS = 0.88
export const TIMING_ANCHORS: Array<[number, number]> = [
  [0, 1.6],
  [10, 1.6],
  [22.5, 1.7],
  [45, 2.25],
  [90, 2.6],
  [180, 4.8],
  [600, 12]
]
export const RELEASE_TARGET = 1.05
export const RELEASE_RESPONSE = 20
export const RELEASE_MAX_ACCELERATION = 16
export const RELEASE_MAX_JERK = 240
export const DICTATION_COMPLETE_HOLD_MS = 100

export function getSettlingDistance(elapsedSec: number, cruiseVelocity: number): number {
  const u = elapsedSec / SETTLE_DURATION_SEC
  return (
    SETTLE_DURATION_SEC *
    (JOIN_VELOCITY * (u - Math.pow(u, 3) + Math.pow(u, 4) / 2) +
      SETTLE_DURATION_SEC *
        JOIN_ACCELERATION *
        (Math.pow(u, 2) / 2 - (2 * Math.pow(u, 3)) / 3 + Math.pow(u, 4) / 4) +
      cruiseVelocity * (Math.pow(u, 3) - Math.pow(u, 4) / 2))
  )
}

export interface DictationProgressMotionProfile {
  asymptote: number
  targetDurationSec: number
  cruiseVelocity: number
}

export function getDictationProgressMotionProfile(
  recordingDurationMs = 0
): DictationProgressMotionProfile {
  const durationSec = Number.isFinite(recordingDurationMs)
    ? Math.max(0, recordingDurationMs / 1000)
    : 0
  let targetDurationSec = TIMING_ANCHORS[TIMING_ANCHORS.length - 1][1]
  for (let i = 1; i < TIMING_ANCHORS.length; i++) {
    const [start, from] = TIMING_ANCHORS[i - 1]
    const [end, to] = TIMING_ANCHORS[i]
    if (durationSec <= end) {
      targetDurationSec = from + ((durationSec - start) / (end - start)) * (to - from)
      break
    }
  }
  const cruiseVelocity =
    (CRUISE_END_PROGRESS -
      JOIN_PROGRESS -
      (JOIN_VELOCITY * SETTLE_DURATION_SEC) / 2 -
      (JOIN_ACCELERATION * SETTLE_DURATION_SEC ** 2) / 12) /
    (targetDurationSec - CHARGE_JOIN_SEC - SETTLE_DURATION_SEC / 2)
  return {
    asymptote: CHARGE_ASYMPTOTE,
    targetDurationSec,
    cruiseVelocity
  }
}

export function getDictationChargeProgress(
  elapsedSec: number,
  recordingDurationMs = 0,
  profile: DictationProgressMotionProfile = getDictationProgressMotionProfile(recordingDurationMs)
): number {
  const elapsed = Math.max(0, elapsedSec)
  if (elapsed <= CHARGE_JOIN_SEC) return openingProgress(elapsed)
  const settlingElapsed = elapsed - CHARGE_JOIN_SEC
  if (settlingElapsed < SETTLE_DURATION_SEC) {
    return JOIN_PROGRESS + getSettlingDistance(settlingElapsed, profile.cruiseVelocity)
  }
  if (elapsed < profile.targetDurationSec) {
    return CRUISE_END_PROGRESS - profile.cruiseVelocity * (profile.targetDurationSec - elapsed)
  }
  const remaining = CHARGE_ASYMPTOTE - CRUISE_END_PROGRESS
  const overrun = elapsed - profile.targetDurationSec
  return (
    CRUISE_END_PROGRESS +
    ((2 * remaining) / Math.PI) *
      Math.atan((Math.PI * profile.cruiseVelocity * overrun) / (2 * remaining))
  )
}

export function getRoundCappedArcProgress(
  logicalProgress: number,
  circumference: number,
  strokeWidth: number
): number {
  const clampedProgress = Math.max(0, Math.min(1, logicalProgress))
  if (circumference <= 0) return clampedProgress
  if (clampedProgress === 1) return 1
  return Math.max(0, clampedProgress - Math.max(0, strokeWidth) / circumference)
}

export function scheduleSweepEndAfterPaint(
  callback: () => void,
  scheduleFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  scheduleDelay = setTimeout,
  cancelDelay = clearTimeout
): () => void {
  let delayHandle: ReturnType<typeof setTimeout> | null = null
  const frameHandle = scheduleFrame(() => {
    delayHandle = scheduleDelay(callback, DICTATION_COMPLETE_HOLD_MS)
  })
  return () => {
    cancelFrame(frameHandle)
    if (delayHandle !== null) cancelDelay(delayHandle)
  }
}

export interface ReleaseStepResult {
  progress: number
  velocity: number
  acceleration: number
  done: boolean
}

export function stepDictationRelease(
  progress: number,
  velocity: number,
  deltaSec: number,
  acceleration = 0
): ReleaseStepResult {
  const dt = Math.max(0, Math.min(0.05, deltaSec))
  const desiredVelocity = (RELEASE_TARGET - progress) * RELEASE_RESPONSE
  const desiredAcceleration = dt > 0 ? (desiredVelocity - velocity) / dt : 0
  const targetAcceleration = Math.max(
    -RELEASE_MAX_ACCELERATION,
    Math.min(RELEASE_MAX_ACCELERATION, desiredAcceleration)
  )
  const currentAcceleration = Math.max(
    -RELEASE_MAX_ACCELERATION,
    Math.min(RELEASE_MAX_ACCELERATION, acceleration)
  )
  const maxAccelerationChange = RELEASE_MAX_JERK * dt
  const nextAcceleration =
    currentAcceleration +
    Math.max(
      -maxAccelerationChange,
      Math.min(maxAccelerationChange, targetAcceleration - currentAcceleration)
    )
  const nextVelocity = Math.max(0, velocity + nextAcceleration * dt)
  const nextProgress = progress + Math.max(0, nextVelocity) * dt
  const done = nextProgress >= 1
  return {
    progress: done ? 1 : nextProgress,
    velocity: nextVelocity,
    acceleration: nextAcceleration,
    done
  }
}

export interface DictationProgressRingProps {
  size?: number
  strokeWidth?: number
  complete?: boolean
  insertionSucceeded?: boolean
  recordingDurationMs?: number
  onSweepEnd?: () => void
}

export function DictationProgressRing({
  size = 16,
  strokeWidth = 2.5,
  complete = false,
  insertionSucceeded = false,
  recordingDurationMs = 0,
  onSweepEnd
}: DictationProgressRingProps): React.JSX.Element {
  const motionProfile = useMemo(
    () => getDictationProgressMotionProfile(recordingDurationMs),
    [recordingDurationMs]
  )
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  const arcRef = useRef<SVGCircleElement | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const progressRef = useRef<number>(0)
  const velocityRef = useRef<number>(0)
  const accelerationRef = useRef<number>(0)
  const sweepEndCleanupRef = useRef<(() => void) | null>(null)
  const completeRef = useRef<boolean>(complete)
  completeRef.current = complete
  const insertionSucceededRef = useRef<boolean>(insertionSucceeded)
  insertionSucceededRef.current = insertionSucceeded
  const onSweepEndRef = useRef(onSweepEnd)
  onSweepEndRef.current = onSweepEnd
  const wasCompleteRef = useRef<boolean>(complete)

  useEffect(() => {
    const wasComplete = wasCompleteRef.current
    wasCompleteRef.current = complete
    if (!wasComplete || complete) return
    sweepEndCleanupRef.current?.()
    sweepEndCleanupRef.current = null
    startTimeRef.current = null
    lastFrameTimeRef.current = null
    progressRef.current = 0
    velocityRef.current = 0
    accelerationRef.current = 0
    if (arcRef.current) {
      arcRef.current.style.strokeDashoffset = `${circumference}`
    }
  }, [complete, circumference])

  useEffect(() => {
    let rafId: number
    const frame = (now: number): void => {
      if (startTimeRef.current === null) startTimeRef.current = now
      const previousProgress = progressRef.current
      const previousVelocity = velocityRef.current
      const deltaSec =
        lastFrameTimeRef.current === null
          ? 1 / 60
          : Math.max(1 / 240, Math.min(0.1, (now - lastFrameTimeRef.current) / 1000))
      lastFrameTimeRef.current = now

      let progress: number
      let snapDone = false
      let releaseControlsVelocity = false

      if (insertionSucceededRef.current) {
        progress = 1
        snapDone = true
        releaseControlsVelocity = true
      } else if (completeRef.current) {
        const release = stepDictationRelease(
          previousProgress,
          previousVelocity,
          deltaSec,
          accelerationRef.current
        )
        progress = release.progress
        velocityRef.current = release.velocity
        accelerationRef.current = release.acceleration
        releaseControlsVelocity = true
        snapDone = release.done
      } else {
        progress = Math.max(
          previousProgress,
          getDictationChargeProgress(
            (now - startTimeRef.current) / 1000,
            recordingDurationMs,
            motionProfile
          )
        )
      }

      if (!releaseControlsVelocity) {
        const instantaneousVelocity = Math.max(0, (progress - previousProgress) / deltaSec)
        const nextVelocity = previousVelocity * 0.35 + instantaneousVelocity * 0.65
        const instantaneousAcceleration = (nextVelocity - previousVelocity) / deltaSec
        accelerationRef.current =
          accelerationRef.current * 0.35 + instantaneousAcceleration * 0.65
        velocityRef.current = nextVelocity
      }

      progressRef.current = progress
      if (arcRef.current) {
        const renderedProgress = getRoundCappedArcProgress(progress, circumference, strokeWidth)
        arcRef.current.style.strokeDashoffset = `${circumference * (1 - renderedProgress)}`
      }

      if (snapDone) {
        sweepEndCleanupRef.current = scheduleSweepEndAfterPaint(() => {
          sweepEndCleanupRef.current = null
          onSweepEndRef.current?.()
        })
        return
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafId)
      sweepEndCleanupRef.current?.()
      sweepEndCleanupRef.current = null
    }
  }, [circumference, complete, recordingDurationMs, motionProfile, strokeWidth])

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0 }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.045)"
          strokeWidth={strokeWidth}
        />
        <circle
          ref={arcRef}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgb(185, 185, 185)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ willChange: 'stroke-dashoffset' }}
        />
      </svg>
    </div>
  )
}
