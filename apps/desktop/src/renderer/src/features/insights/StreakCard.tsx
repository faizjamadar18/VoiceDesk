import { InsightCard } from './InsightCard'
import type { StreakCell, StreakData } from './types'

export interface StreakCardProps {
  data?: StreakData
  className?: string
}

function getDefaultWeeks(): StreakCell[][] {
  const weeks: StreakCell[][] = []
  for (let w = 0; w < 22; w++) {
    const week: StreakCell[] = []
    for (let d = 0; d < 7; d++) {
      // 5-day active streak at the very end
      const isActive = w === 21 && d >= 2
      week.push({
        date: `2026-11-w${w}-d${d}`,
        active: isActive,
        count: isActive ? 1 : 0,
        isFuture: false
      })
    }
    weeks.push(week)
  }
  return weeks
}

export function StreakCard({ data, className = '' }: StreakCardProps) {
  const currentStreak = data?.current ?? 5
  const longestStreak = data?.longest ?? 5
  const weeks = data?.weeks && data.weeks.length > 0 ? data.weeks : getDefaultWeeks()

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] font-semibold text-gray-50">
            {currentStreak} day streak
          </h3>
          <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.06em]">
            LONGEST | {longestStreak} DAYS
          </span>
        </div>

        {/* Heatmap Section */}
        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* Month labels along top */}
          <div className="flex pl-5 pr-2 justify-between text-[10px] text-gray-500 mb-1.5 select-none">
            <span>Jun</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
            <span>Nov</span>
          </div>

          <div className="flex gap-[3px]">
            {/* Weekday labels on left: M, W, F */}
            <div className="flex flex-col gap-[3px] text-[10px] text-gray-500 select-none w-4 flex-shrink-0">
              <div className="h-[10px] leading-[10px]" />
              <div className="h-[10px] leading-[10px] flex items-center justify-center">M</div>
              <div className="h-[10px] leading-[10px]" />
              <div className="h-[10px] leading-[10px] flex items-center justify-center">W</div>
              <div className="h-[10px] leading-[10px]" />
              <div className="h-[10px] leading-[10px] flex items-center justify-center">F</div>
              <div className="h-[10px] leading-[10px]" />
            </div>

            {/* Grid of ~22 columns x 7 rows */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-[3px]">
                  {week.map((cell, dIndex) => (
                    <div
                      key={dIndex}
                      className={`w-[10px] h-[10px] rounded-[2px] transition-colors ${
                        cell.active ? 'bg-[#0A84FF]' : 'bg-white/[0.04]'
                      }`}
                      title={cell.date}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer legend */}
        <div className="flex items-center justify-between text-[10px] text-gray-500 mt-3 pt-1 select-none">
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            <div className="flex items-center gap-[3px]">
              <div className="w-[10px] h-[10px] rounded-[2px] bg-white/[0.04]" />
              <div className="w-[10px] h-[10px] rounded-[2px] bg-[#0A84FF]/30" />
              <div className="w-[10px] h-[10px] rounded-[2px] bg-[#0A84FF]/65" />
              <div className="w-[10px] h-[10px] rounded-[2px] bg-[#0A84FF]" />
            </div>
            <span>More</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-[10px] h-[10px] rounded-[2px] border border-gray-500 bg-transparent" />
            <span>Today</span>
          </div>
        </div>
      </div>
    </InsightCard>
  )
}
