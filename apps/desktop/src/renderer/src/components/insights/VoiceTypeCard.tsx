import type { JSX } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../features/profile/Card'
import { LADDER } from './mockData'
import type { InsightsData } from './types'

export interface VoiceTypeCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

export function VoiceTypeCard({ data, isDarkMode = true }: VoiceTypeCardProps): JSX.Element {
  const accent = isDarkMode ? '#0A84FF' : '#007AFF'
  const neutral = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'

  // top 25% corresponds to index 3 in LADDER [50, 40, 30, 25, 20, 15, 10, 7, 5, 3, 2, 1]
  const litThrough = 3
  const nextBand = LADDER[litThrough + 1] // top 20%
  const toNextSessions = nextBand ? Math.max(1, nextBand.minSessions - data.totalSessions) : null

  return (
    <Card isDarkMode={isDarkMode} className="flex min-h-[225px] flex-col p-5">
      <div className="min-h-[96px]">
        <p
          className={`text-[32px] font-semibold leading-none ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
        >
          Top 25%
        </p>
        <div className="mt-1.5">
          <p
            className={`text-[10px] font-semibold uppercase ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
            style={{ letterSpacing: '0.07em' }}
          >
            OF VOICEOS USERS
          </p>
        </div>

        {/* Percentile Ladder */}
        <div className="mt-3">
          <div className="flex items-center gap-[3px]">
            {LADDER.map((band, index) => {
              const isLit = index <= litThrough
              const isNext = index === litThrough + 1
              const visible = isLit || isNext ? 1 : 0

              return (
                <div key={band.topPercent} className="flex-1">
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
            31 sessions
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
