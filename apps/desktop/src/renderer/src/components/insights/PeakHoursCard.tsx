import { useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../features/profile/Card'
import type { InsightsData } from './types'
import { ChartTooltip, type TooltipData } from './ChartTooltip'

export interface PeakHoursCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

const CHART_HEIGHT = 80

export function PeakHoursCard({ data, isDarkMode = true }: PeakHoursCardProps): JSX.Element {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
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
              className="flex-1 h-full flex items-end cursor-pointer group py-1"
              onMouseEnter={(e) => handleBarEnter(e, hour, count, height)}
            >
              <motion.div
                className="w-full rounded-full transition-all duration-150 group-hover:brightness-125 group-hover:shadow-[0_0_8px_rgba(10,132,255,0.5)]"
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

      {/* Tooltip via createPortal */}
      <ChartTooltip tooltip={tooltip} isDarkMode={isDarkMode} />
    </Card>
  )
}
