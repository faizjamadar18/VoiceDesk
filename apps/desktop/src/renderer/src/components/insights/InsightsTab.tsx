import { useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { motion } from 'framer-motion'
import { useSystemTheme } from '../../context/ThemeContext'
import { DashboardButton } from '../ui/DashboardButton'
import { AgentPromptsCard } from './AgentPromptsCard'
import { AppUsageCard } from './AppUsageCard'
import { MOCK_INSIGHTS_DATA } from './mockData'
import { PeakHoursCard } from './PeakHoursCard'
import { StreakCard } from './StreakCard'
import { VoiceTypeCard } from './VoiceTypeCard'
import { VoiceTypeModal } from './VoiceTypeModal'
import { WordsDictatedCard } from './WordsDictatedCard'

export interface InsightsTabProps {
  className?: string
}

function ShareIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

export function InsightsTab({ className = '' }: InsightsTabProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()
  const [isVoiceTypeModalOpen, setIsVoiceTypeModalOpen] = useState(false)
  const data = MOCK_INSIGHTS_DATA

  const sectionAnimation = (index: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.45,
      delay: index * 0.07,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number]
    }
  })

  return (
    <div className={`w-full transition-colors duration-200 ${className}`}>
      {/* Header */}
      <div className="relative z-[80] mb-6 flex items-center justify-between gap-4">
        <h1
          className="text-xl font-bold"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : '#000000',
            letterSpacing: '-0.02em'
          }}
        >
          Insights
        </h1>

        <DashboardButton
          type="button"
          variant="secondary"
          isDarkMode={isDarkMode}
          onClick={() => setIsVoiceTypeModalOpen(true)}
          className="relative z-[80] !rounded-full !px-3.5 !py-1.5 active:scale-[0.98] [&::before]:!rounded-full [&::after]:!rounded-full cursor-pointer select-none"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          <span className="inline-flex items-center gap-1.5 font-semibold tracking-[-0.01em]">
            <ShareIcon className="w-3.5 h-3.5 -mt-px" />
            <span>Voice Type</span>
          </span>
        </DashboardButton>
      </div>

      {/* Bento Grid */}
      <div className="space-y-4">
        {/* Row 1: Top 3 Hero Cards */}
        <motion.div {...sectionAnimation(0)} className="grid gap-4 lg:grid-cols-3">
          <VoiceTypeCard data={data} isDarkMode={isDarkMode} />
          <WordsDictatedCard data={data} isDarkMode={isDarkMode} />
          <AgentPromptsCard data={data} isDarkMode={isDarkMode} />
        </motion.div>

        {/* Row 2: Middle 2 Cards (App Usage & Streak) */}
        <motion.div {...sectionAnimation(1)} className="grid gap-4 lg:grid-cols-2 items-stretch">
          <AppUsageCard data={data} isDarkMode={isDarkMode} />
          <StreakCard data={data} isDarkMode={isDarkMode} />
        </motion.div>

        {/* Row 3: Bottom Full-Width Card (Peak Hours) */}
        <motion.div {...sectionAnimation(2)}>
          <PeakHoursCard data={data} isDarkMode={isDarkMode} />
        </motion.div>
      </div>

      {/* Voice Type Share Modal */}
      <VoiceTypeModal
        isOpen={isVoiceTypeModalOpen}
        onClose={() => setIsVoiceTypeModalOpen(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  )
}
