import { InsightCard } from './InsightCard'
import type { PeakHoursData } from './types'

export interface PeakHoursCardProps {
  data?: PeakHoursData
  className?: string
}

const DEFAULT_HOUR_COUNTS: number[] = [
  2, 0, 0, 0, 0, 0, 1, 18, 3, 2, 1, 4, 3, 1, 5, 2, 1, 4, 2, 3, 1, 0, 0, 0
]

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

export function PeakHoursCard({ data, className = '' }: PeakHoursCardProps) {
  const counts = data?.hourCounts && data.hourCounts.length === 24
    ? data.hourCounts
    : DEFAULT_HOUR_COUNTS
  const busiestHour = data?.busiestHour ?? 7
  const busiestLabel = formatHour(busiestHour)

  const nonPeakMax = Math.max(
    ...counts.filter((_, idx) => idx !== busiestHour),
    1
  )

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-gray-50">Peak hours</h3>
          <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.06em]">
            BUSIEST | {busiestLabel}
          </span>
        </div>

        {/* 24 Bar Chart Columns */}
        <div className="h-[80px] flex items-end gap-[3px] mt-4">
          {counts.map((count, hour) => {
            const isBusiest = hour === busiestHour
            // Hour 7 is tall vibrant blue bar (~95% height)
            // Other hours are subtle neutral bars with heights 2-25%
            const heightPercent = isBusiest
              ? 95
              : count === 0
                ? 3
                : Math.min(25, Math.max(4, Math.round((count / nonPeakMax) * 22) + 3))

            return (
              <div
                key={hour}
                className={`flex-1 rounded-full transition-all ${
                  isBusiest ? 'bg-[#0A84FF]' : 'bg-white/[0.12]'
                }`}
                style={{ height: `${heightPercent}%` }}
                title={`${formatHour(hour)}: ${count} sessions`}
              />
            )
          })}
        </div>

        {/* Time labels underneath */}
        <div className="text-[10px] text-gray-500 flex justify-between mt-2 select-none">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
        </div>
      </div>
    </InsightCard>
  )
}
