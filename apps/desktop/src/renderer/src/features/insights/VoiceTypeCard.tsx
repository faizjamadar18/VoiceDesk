import { InsightCard } from './InsightCard'
import type { PercentileLadderData } from './types'

export interface VoiceTypeCardProps {
  data?: PercentileLadderData
  className?: string
}

export function VoiceTypeCard({ data, className = '' }: VoiceTypeCardProps) {
  const topPercent = data?.topPercent ?? 25
  const dailyAverage = data?.dailyAverageSessions ?? 31
  const nextTopPercent = data?.nextTopPercent ?? 20
  const sessionsToNext = data?.sessionsToNext ?? 4

  const totalPills = 15
  const litCount = data?.litThrough !== undefined ? data.litThrough + 1 : 5

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        <span className="text-[32px] font-semibold text-gray-50 leading-none tracking-[-0.03em] tabular-nums">
          Top {topPercent}%
        </span>
        <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.07em] mt-1.5">
          OF VOICEOS USERS
        </span>

        {/* Percentile ladder */}
        <div className="flex items-center gap-1 mt-4">
          {Array.from({ length: totalPills }).map((_, index) => {
            if (index < litCount) {
              return (
                <div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-[#0A84FF]"
                />
              )
            }
            if (index === litCount) {
              return (
                <div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-transparent"
                  style={{ boxShadow: 'inset 0 0 0 1.5px #0A84FF' }}
                />
              )
            }
            return (
              <div
                key={index}
                className="h-1.5 flex-1 rounded-full bg-white/[0.14]"
              />
            )
          })}
        </div>

        {/* Bottom band labels */}
        <div className="text-[10px] text-gray-500 mt-2 flex justify-between">
          <span>Top 50%</span>
          <span>Top 1%</span>
        </div>

        {/* Divider line */}
        <div className="h-px w-full my-3 bg-white/[0.07]" />

        {/* Stat rows */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-gray-400">Daily average</span>
            <span className="font-semibold text-gray-200 tabular-nums">
              {dailyAverage} sessions
            </span>
          </div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-gray-400">Next: top {nextTopPercent}%</span>
            <span className="font-semibold text-gray-200 tabular-nums">
              +{sessionsToNext} sessions
            </span>
          </div>
        </div>
      </div>
    </InsightCard>
  )
}
