import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

export interface AudioBarsProps {
  barCount?: number
  barColor?: string
  barWidth?: number
  barGap?: number
  maxBarHeight?: number
  isRecording?: boolean
}

const MIN_BAR_HEIGHT = 3
const MAX_BAR_HEIGHT = 18

export function AudioBars({
  barCount = 7,
  barColor = 'white',
  barWidth = 2.5,
  barGap = 2,
  maxBarHeight = MAX_BAR_HEIGHT,
  isRecording = true
}: AudioBarsProps): JSX.Element {
  const [heights, setHeights] = useState<number[]>(() =>
    Array(barCount).fill(MIN_BAR_HEIGHT)
  )
  const frameRef = useRef(0)

  useEffect(() => {
    if (!isRecording) {
      setHeights(Array(barCount).fill(MIN_BAR_HEIGHT))
      return undefined
    }

    const interval = setInterval(() => {
      frameRef.current += 1
      const f = frameRef.current
      setHeights((prev) =>
        prev.map((_, i) => {
          const envelope = 0.35 + 0.3 * Math.sin(f * 0.2 + i * 0.5)
          const flutter = 0.2 * Math.cos(f * 0.4 + i * 0.8)
          const noise = Math.random() * 0.15
          const factor = Math.max(0.1, Math.min(1, envelope + flutter + noise))
          return MIN_BAR_HEIGHT + factor * (maxBarHeight - MIN_BAR_HEIGHT)
        })
      )
    }, 70)

    return () => clearInterval(interval)
  }, [barCount, isRecording, maxBarHeight])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%'
      }}
    >
      {heights.map((height, i) => (
        <div
          key={i}
          style={{
            width: `${barWidth}px`,
            height: `${maxBarHeight}px`,
            margin: `0 ${barGap}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              width: `${barWidth}px`,
              height: `${height}px`,
              backgroundColor: barColor,
              borderRadius: `${barWidth / 2}px`,
              transition: 'height 60ms linear'
            }}
          />
        </div>
      ))}
    </div>
  )
}

