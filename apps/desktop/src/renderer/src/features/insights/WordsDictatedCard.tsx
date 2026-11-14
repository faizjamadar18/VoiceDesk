import { InsightCard } from './InsightCard'
import type { WordsDictatedData } from './types'

export interface WordsDictatedCardProps {
  data?: WordsDictatedData
  className?: string
}

export function WordsDictatedCard({ data, className = '' }: WordsDictatedCardProps) {
  const totalWords = data?.totalWords !== undefined ? data.totalWords.toLocaleString() : '2,717'
  const timeSaved = data ? `${data.timeSavedMinutes}m` : '50m'
  const sessions = data?.sessions ?? 157
  const weekWords = data ? `${data.weekWords.toLocaleString()} words` : '2,717 words'

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        <span className="text-[32px] font-semibold text-gray-50 leading-none tracking-[-0.03em] tabular-nums">
          {totalWords}
        </span>
        <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.07em] mt-1.5">
          TOTAL WORDS DICTATED
        </span>

        {/* Divider line */}
        <div className="h-px w-full my-3 bg-white/[0.07]" />

        {/* Stat rows */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-gray-400">Time saved</span>
            <span className="font-semibold text-gray-200 tabular-nums">{timeSaved}</span>
          </div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-gray-400">Sessions</span>
            <span className="font-semibold text-gray-200 tabular-nums">{sessions}</span>
          </div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-gray-400">This week</span>
            <span className="font-semibold text-gray-200 tabular-nums">{weekWords}</span>
          </div>
        </div>
      </div>
    </InsightCard>
  )
}
