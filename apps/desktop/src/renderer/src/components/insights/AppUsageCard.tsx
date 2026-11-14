import type { JSX } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../features/profile/Card'
import voiceosAppIcon from '../../assets/voiceos-app-icon.png'
import type { InsightsData } from './types'

export interface AppUsageCardProps {
  data: InsightsData
  isDarkMode?: boolean
}

function ExplorerIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
      <rect width="20" height="16" x="2" y="4" rx="2" fill="#FFA000" />
      <path d="M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" fill="#FFCA28" />
      <path d="M2 6a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v2H2V6z" fill="#FFA000" />
    </svg>
  )
}

function AntigravityIcon(): JSX.Element {
  return (
    <div className="w-5 h-5 rounded-[5px] bg-[#1E1E24] border border-white/10 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.2" className="w-3.5 h-3.5" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </div>
  )
}

function EdgeIcon(): JSX.Element {
  return (
    <div className="w-5 h-5 rounded-[5px] bg-[#0078D7]/20 border border-[#0078D7]/30 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    </div>
  )
}

function AppIcon({ name }: { name: string }): JSX.Element {
  const lower = name.toLowerCase()
  if (lower.includes('voiceos')) {
    return (
      <img
        src={voiceosAppIcon}
        alt=""
        className="w-5 h-5 rounded-[5px] flex-shrink-0 object-contain"
      />
    )
  }
  if (lower.includes('explorer')) {
    return <ExplorerIcon />
  }
  if (lower.includes('antigravity')) {
    return <AntigravityIcon />
  }
  if (lower.includes('edge')) {
    return <EdgeIcon />
  }

  return (
    <div className="w-5 h-5 rounded-[5px] flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-white/10 text-gray-300">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function AppUsageCard({ data, isDarkMode = true }: AppUsageCardProps): JSX.Element {
  const barColor = (index: number): string => {
    const alpha = Math.max(0.32, 1 - index * 0.16)
    return isDarkMode ? `rgba(10, 132, 255, ${alpha})` : `rgba(0, 122, 255, ${alpha})`
  }

  return (
    <Card isDarkMode={isDarkMode} className="p-5 h-full">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3
          className={`text-[17px] font-semibold ${isDarkMode ? 'text-gray-50' : 'text-gray-900'}`}
          style={{ letterSpacing: '-0.02em' }}
        >
          App usage
        </h3>
        <span
          className={`text-[10px] font-semibold uppercase flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
          style={{ letterSpacing: '0.06em' }}
        >
          APPS USED | {data.appsUsed}
        </span>
      </div>

      <div className="space-y-2.5">
        {data.topApps.map((app, index) => {
          const percent = Math.round(app.share * 100)
          const color = barColor(index)
          const isLabelInside = percent >= 25

          return (
            <div key={app.appName} className="flex items-center gap-2.5">
              <AppIcon name={app.appName} />

              <div className="flex-1 min-w-0 relative h-[22px]">
                <div
                  className="absolute inset-0 rounded-md overflow-hidden"
                  style={{
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <motion.div
                    className="h-full rounded-md flex items-center justify-end overflow-hidden box-border px-2"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{
                      duration: 0.6,
                      delay: index * 0.08,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                  >
                    {isLabelInside && (
                      <span className="text-[11px] font-semibold tabular-nums text-white whitespace-nowrap">
                        {percent}%
                      </span>
                    )}
                  </motion.div>
                </div>

                {!isLabelInside && (
                  <span
                    className={`absolute z-10 top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}
                    style={{ left: `calc(${percent}% + 8px)` }}
                  >
                    {percent}%
                  </span>
                )}
              </div>

              <span
                className={`text-[11px] w-[124px] flex-shrink-0 truncate ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}
                title={app.appName}
              >
                <span
                  className={`font-semibold tabular-nums ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                >
                  {app.sessions.toLocaleString()}
                </span>{' '}
                {app.appName}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
