import type { ReactNode } from 'react'
import { InsightCard } from './InsightCard'
import type { AppUsageItem } from './types'

export interface AppUsageCardProps {
  apps?: AppUsageItem[]
  className?: string
}

const DEFAULT_APPS: AppUsageItem[] = [
  { name: 'VoiceOS', sessions: 3, share: 0.5, icon: 'voiceos' },
  { name: 'explorer', sessions: 1, share: 0.17, icon: 'explorer' },
  { name: 'Antigravity IDE', sessions: 1, share: 0.17, icon: 'antigravity' },
  { name: 'msedge', sessions: 1, share: 0.17, icon: 'edge' }
]

function renderAppIcon(icon: string): ReactNode {
  switch (icon) {
    case 'voiceos':
      return (
        <div className="w-5 h-5 rounded-[5px] bg-[#0A84FF] flex items-center justify-center flex-shrink-0 shadow-sm">
          <svg
            className="w-3 h-3 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4l6 14 6-14" />
          </svg>
        </div>
      )
    case 'explorer':
      return (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 5h-8.586L9.707 3.293A1 1 0 009 3H4a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2z" />
          </svg>
        </div>
      )
    case 'antigravity':
      return (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-purple-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)" />
            <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)" />
          </svg>
        </div>
      )
    case 'edge':
    case 'msedge':
    default:
      return (
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-cyan-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3.6 9h16.8M3.6 15h16.8" />
            <path d="M12 3a14.5 14.5 0 000 18 14.5 14.5 0 000-18" />
          </svg>
        </div>
      )
  }
}

export function AppUsageCard({ apps = DEFAULT_APPS, className = '' }: AppUsageCardProps) {
  const items = apps.length > 0 ? apps : DEFAULT_APPS

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] font-semibold text-gray-50">App usage</h3>
          <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.06em]">
            APPS USED | {items.length}
          </span>
        </div>

        {/* App rows */}
        <div className="flex flex-col gap-2.5">
          {items.map((app, index) => {
            const isVoiceOS = app.name.toLowerCase().includes('voiceos') || app.icon === 'voiceos'
            const percentage = Math.round(app.share * 100)

            return (
              <div key={`${app.name}-${index}`} className="flex items-center gap-3">
                {/* App icon */}
                {renderAppIcon(app.icon)}

                {/* Progress bar */}
                <div className="flex-1 h-5 bg-white/[0.04] rounded flex items-center overflow-hidden">
                  <div
                    className={`h-full rounded flex items-center justify-end px-2 text-[10px] font-medium leading-none ${
                      isVoiceOS ? 'bg-[#0A84FF] text-white' : 'bg-white/10 text-gray-300'
                    }`}
                    style={{
                      width: `${percentage}%`,
                      minWidth: '32px'
                    }}
                  >
                    {percentage}%
                  </div>
                </div>

                {/* Text on right */}
                <div className="w-[124px] truncate flex-shrink-0 text-[11px] text-gray-400">
                  {app.sessions} {app.name}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </InsightCard>
  )
}
