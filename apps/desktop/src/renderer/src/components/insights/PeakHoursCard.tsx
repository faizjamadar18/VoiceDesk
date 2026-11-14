import { useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../features/profile/Card'
import type { InsightsData } from './types'

export interface PeakHoursCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

interface TooltipState {
  x: number
  y: number
  title: string
  detail: string
}

const CHART_HEIGHT = 80

export function PeakHoursCard({ data, isDarkMode = true }: PeakHoursCardProps): JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const max = Math.max(...data.hourCounts, 1)
  const peakHour = data.hourCounts.indexOf(Math.max(...data.hourCounts))
  const accent = isDarkMode ? '#0A84FF' : '#007AFF'
  const neutral = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'

  const hourLabel = (hour: number): string => {
    if (hour === 0) return '12 AM'
    if (hour < 12) return `${hour} AM`
    if (hour === 12) return '12 PM'
    return `${hour - 12} PM`
  }

  const handleBarEnter = (
    event: ReactMouseEvent<HTMLDivElement>,
    hour: number,
    count: number,
    barHeight: number
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.bottom - barHeight,
      title: hourLabel(hour),
      detail: count === 1 ? '1 session' : `${count} sessions`
    })
  }

  return (
    <Card isDarkMode={isDarkMode} className="p-5 h-full relative">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3
          className={`text-[17px] font-semibold ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.02em' }}
        >
          Peak hours
        </h3>
        <span
          className={`text-[10px] font-semibold uppercase flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          style={{ letterSpacing: '0.06em' }}
        >
          BUSIEST | {hourLabel(peakHour)}
        </span>
      </div>

      <div
        className="flex items-end gap-[3px]"
        style={{ height: CHART_HEIGHT }}
        onMouseLeave={() => setTooltip(null)}
      >
        {data.hourCounts.map((count, hour) => {
          const height = Math.max((count / max) * CHART_HEIGHT, 2)
          const isPeak = hour === peakHour && count > 0

          return (
            <div
              key={hour}
              className="flex-1 h-full flex items-end cursor-default"
              onMouseEnter={(e) => handleBarEnter(e, hour, count, height)}
            >
              <motion.div
                className="w-full rounded-full"
                style={{
                  backgroundColor: isPeak ? accent : neutral
                }}
                initial={{ height: 2 }}
                animate={{ height }}
                transition={{
                  duration: 0.55,
                  delay: hour * 0.015,
                  ease: [0.22, 1, 0.36, 1]
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex mt-2">
        {[0, 6, 12, 18].map((hour) => (
          <span
            key={hour}
            className={`flex-1 text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          >
            {hourLabel(hour)}
          </span>
        ))}
      </div>

      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full mb-2 rounded-lg px-2.5 py-1.5 shadow-xl text-center"
          style={{
            left: tooltip.x,
            top: tooltip.y - 6,
            backgroundColor: isDarkMode ? '#1F2024' : '#FFFFFF',
            border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
            color: isDarkMode ? '#F3F4F6' : '#111827'
          }}
        >
          <div className="text-[11px] font-semibold">{tooltip.title}</div>
          <div className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {tooltip.detail}
          </div>
        </div>
      )}
    </Card>
  )
}
