import type { JSX } from 'react'
import { Card } from '../../features/profile/Card'
import type { InsightsData } from './types'

export interface WordsDictatedCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

export function WordsDictatedCard({ data, isDarkMode = true }: WordsDictatedCardProps): JSX.Element {
  const totalMinutes = Math.round(data.timeSavedSeconds / 60)
  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  return (
    <Card isDarkMode={isDarkMode} className="flex min-h-[225px] flex-col p-5">
      <div className="min-h-[96px]">
        <p
          className={`text-[32px] font-semibold leading-none ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
        >
          {data.totalWords.toLocaleString()}
        </p>
        <div className="mt-1.5">
          <p
            className={`text-[10px] font-semibold uppercase ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
            style={{ letterSpacing: '0.07em' }}
          >
            TOTAL WORDS DICTATED
          </p>
        </div>
      </div>

      <div
        className="h-px w-full my-3"
        style={{
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)'
        }}
      />

      <div className="min-h-[64px] space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-[12px] leading-snug ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Time saved
          </span>
          <span className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {formatMinutes(totalMinutes)}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-[12px] leading-snug ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Sessions
          </span>
          <span className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {data.totalSessions.toLocaleString()}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-[12px] leading-snug ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            This week
          </span>
          <span className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {data.weekWords.toLocaleString()} words
          </span>
        </div>
      </div>
    </Card>
  )
}
