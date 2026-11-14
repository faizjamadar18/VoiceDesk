import { useState, type JSX } from 'react'
import type { InsightsData } from './types'
import { DUMMY_INSIGHTS_DATA } from './dummy-data'
import { VoiceTypeCard } from './VoiceTypeCard'
import { WordsDictatedCard } from './WordsDictatedCard'
import { AgentPromptsCard } from './AgentPromptsCard'
import { AppUsageCard } from './AppUsageCard'
import { StreakCard } from './StreakCard'
import { PeakHoursCard } from './PeakHoursCard'
import { VoiceTypeModal } from './VoiceTypeModal'

export interface InsightsPageProps {
  data?: InsightsData
}

export function InsightsPage({ data = DUMMY_INSIGHTS_DATA }: InsightsPageProps): JSX.Element {
  const [isVoiceTypeModalOpen, setIsVoiceTypeModalOpen] = useState(false)

  return (
    <div className="w-full pb-8">
      {/* Top Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-white/95">
          Insights
        </h1>

        <button
          type="button"
          onClick={() => setIsVoiceTypeModalOpen(true)}
          className="rounded-full px-3.5 py-1.5 bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10 cursor-pointer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="-mt-px"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Voice Type
        </button>
      </div>

      {/* Bento Grid Layout */}
      <div className="space-y-4">
        {/* Row 1: 3 Hero cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <VoiceTypeCard data={data.percentile} />
          <WordsDictatedCard data={data.words} />
          <AgentPromptsCard data={data.agent} />
        </div>

        {/* Row 2: 2 Middle cards (App usage & Streak) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          <AppUsageCard apps={data.apps} />
          <StreakCard data={data.streak} />
        </div>

        {/* Row 3: Peak hours */}
        <div className="grid grid-cols-1 gap-4">
          <PeakHoursCard data={data.peakHours} />
        </div>
      </div>

      {/* Voice Type Share Modal */}
      <VoiceTypeModal
        isOpen={isVoiceTypeModalOpen}
        onClose={() => setIsVoiceTypeModalOpen(false)}
        data={data.voiceType}
      />
    </div>
  )
}
