import React, { useEffect, useRef } from 'react'

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
  onSweepEnd
}: DictationProgressRingProps): React.JSX.Element {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  const arcRef = useRef<SVGCircleElement | null>(null)
  const progressRef = useRef<number>(0)
  const onSweepEndRef = useRef(onSweepEnd)
  onSweepEndRef.current = onSweepEnd

  useEffect(() => {
    let rafId: number
    const startTime = performance.now()

    const frame = (now: number): void => {
      const elapsed = (now - startTime) / 1000

      if (insertionSucceeded || complete) {
        progressRef.current = 1
      } else {
        // Charging curve: smooth asymptotic approach toward 90%
        progressRef.current = Math.min(0.9, 1 - Math.exp(-elapsed * 1.8))
      }

      const p = progressRef.current
      if (arcRef.current) {
        arcRef.current.style.strokeDashoffset = `${circumference * (1 - p)}`
      }

      if (p >= 1) {
        onSweepEndRef.current?.()
        return
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [circumference, complete, insertionSucceeded])

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

export default DictationProgressRing
