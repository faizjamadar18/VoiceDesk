import React, { useEffect, useRef, useState } from 'react'
import {
  BAR_COUNT,
  DICTATION_WAVEFORM_BAR_GAP,
  DICTATION_WAVEFORM_BAR_WIDTH,
  MAX_BAR_HEIGHT,
  MIN_BAR_HEIGHT,
  TICK_MS,
  computeBarColor,
  computeBarHeight,
  compressVolume,
  shiftHeights
} from './audio-waveform'

export interface AudioBarsProps {
  volumeHistory: number[]
  barColor?: string
  barCount?: number
  direction?: 'right-to-left' | 'left-to-right'
  barWidth?: number
  barGap?: number
  maxBarHeight?: number
  marginLeft?: number
  marginRight?: number
}

export function AudioBars({
  volumeHistory,
  barColor = 'white',
  barCount = BAR_COUNT,
  direction = 'right-to-left',
  barWidth = DICTATION_WAVEFORM_BAR_WIDTH,
  barGap = DICTATION_WAVEFORM_BAR_GAP,
  maxBarHeight = 18,
  marginLeft = 0,
  marginRight = 0
}: AudioBarsProps): React.JSX.Element {
  const heightsRef = useRef<number[]>(new Array(barCount).fill(MIN_BAR_HEIGHT))
  const [, setRender] = useState<number>(0)
  const smoothedVolumeRef = useRef<number>(0)
  const volumeHistoryRef = useRef<number[]>(volumeHistory)
  volumeHistoryRef.current = volumeHistory

  if (heightsRef.current.length !== barCount) {
    heightsRef.current = new Array(barCount).fill(MIN_BAR_HEIGHT)
  }

  useEffect(() => {
    let last = performance.now()
    let rafId = 0

    const tick = (): void => {
      const now = performance.now()
      const history = volumeHistoryRef.current
      const raw = history.length > 0 ? history[history.length - 1] : 0

      smoothedVolumeRef.current = compressVolume(raw, smoothedVolumeRef.current)
      const vol = smoothedVolumeRef.current

      if (now - last >= TICK_MS) {
        const newHeight = computeBarHeight(vol)
        heightsRef.current = shiftHeights(heightsRef.current, newHeight)
        last = now
        setRender((r) => (r + 1) % 1_000_000)
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const buffer = heightsRef.current
  const heights = direction === 'left-to-right' ? [...buffer].reverse() : buffer
  const colors = heights.map((h) => computeBarColor(h, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT))

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        marginLeft: `${marginLeft}px`,
        marginRight: `${marginRight}px`
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
              background: colors[i] ?? barColor,
              borderRadius: height <= barWidth ? '50%' : `${barWidth / 2}px`,
              transition:
                'height 60ms linear, background 80ms linear, border-radius 0.1s ease-out'
            }}
          />
        </div>
      ))}
    </div>
  )
}

export default AudioBars
