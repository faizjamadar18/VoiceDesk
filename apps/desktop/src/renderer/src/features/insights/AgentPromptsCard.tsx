import { InsightCard } from './InsightCard'
import type { AgentPromptsData } from './types'

export interface AgentPromptsCardProps {
  data?: AgentPromptsData
  className?: string
}

export function AgentPromptsCard({ data, className = '' }: AgentPromptsCardProps) {
  const prompts = data?.prompts !== undefined ? data.prompts.toLocaleString() : '151'
  const timeSaved = data ? `${data.timeSavedMinutes}m` : '49m'
  const sessions = data?.sessions ?? 151
  const weekTime = data ? `${data.weekMinutes}m` : '49m'

  return (
    <InsightCard className={className}>
      <div className="flex flex-col">
        <span className="text-[32px] font-semibold text-gray-50 leading-none tracking-[-0.03em] tabular-nums">
          {prompts}
        </span>
        <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-[0.07em] mt-1.5">
          AGENT PROMPTS
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
            <span className="font-semibold text-gray-200 tabular-nums">{weekTime}</span>
          </div>
        </div>
      </div>
    </InsightCard>
  )
}
