import type { JSX } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../features/profile/Card'
import { LADDER } from './insightsData'
import type { InsightsData } from './types'
import { dailyAverageSessions, UNRANKED_VOICE_TYPE, voiceTypeBand } from './voiceType'

export interface VoiceTypeCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

export function VoiceTypeCard({ data, isDarkMode = true }: VoiceTypeCardProps): JSX.Element {
  const accent = isDarkMode ? '#0A84FF' : '#007AFF'
  const neutral = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'

  // Band the user has reached on the ladder; index -1 means outside the top 50%.
  const { band, index: litThrough, nextBand, toNextSessions } = voiceTypeBand(data)
  const dailyAverage = dailyAverageSessions(data)

  return (
    <Card isDarkMode={isDarkMode} className="flex min-h-[225px] flex-col p-5">
      <div className="min-h-[96px]">
        <p
          className={`text-[32px] font-semibold leading-none ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
        >
          {band ? `Top ${band.topPercent}%` : UNRANKED_VOICE_TYPE}
        </p>
        <div className="mt-1.5">
          <p
            className={`text-[10px] font-semibold uppercase ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
            style={{ letterSpacing: '0.07em' }}
          >
            {band ? 'OF VOICEOS USERS' : `NEED ${LADDER[0].minSessions}+ SESSIONS`}
          </p>
        </div>

        {/* Percentile Ladder */}
        <div className="mt-3">
          <div className="flex items-center gap-[3px]">
            {LADDER.map((ladderBand, index) => {
              const isLit = index <= litThrough
              const isNext = index === litThrough + 1
              const visible = isLit || isNext ? 1 : 0

              return (
                <div key={ladderBand.topPercent} className="flex-1">
                  <div
                    className="rounded-full"
                    style={{ height: 10, backgroundColor: neutral }}
                  >
                    <motion.div
                      className="w-full h-full rounded-full"
                      style={{
                        backgroundColor: isLit ? accent : 'transparent',
                        boxShadow: isNext ? `inset 0 0 0 1.5px ${accent}` : undefined
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: visible }}
                      transition={{
                        duration: 0.35,
                        delay: index * 0.04,
                        ease: [0.22, 1, 0.36, 1]
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Top 50%
            </span>
            <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Top 1%
            </span>
          </div>
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
            Daily average
          </span>
          <span className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {dailyAverage} sessions
          </span>
        </div>

        {nextBand && toNextSessions !== null && (
          <div className="flex items-baseline justify-between gap-3">
            <span className={`min-w-0 text-[12px] leading-snug ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Next: top {nextBand.topPercent}%
            </span>
            <span className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              +{toNextSessions} sessions
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
