export interface PercentileLadderData {
  topPercent: number
  dailyAverageSessions: number
  nextTopPercent: number
  sessionsToNext: number
  litThrough: number
}

export interface WordsDictatedData {
  totalWords: number
  timeSavedMinutes: number
  sessions: number
  weekWords: number
}

export interface AgentPromptsData {
  prompts: number
  timeSavedMinutes: number
  sessions: number
  weekMinutes: number
}

export interface AppUsageItem {
  name: string
  sessions: number
  share: number
  icon: 'voiceos' | 'explorer' | 'antigravity' | 'edge' | string
}

export interface StreakCell {
  date: string
  active: boolean
  count: number
  isFuture: boolean
}

export interface StreakData {
  current: number
  longest: number
  activeToday: boolean
  weeks: StreakCell[][]
}

export interface PeakHoursData {
  hourCounts: number[]
  busiestHour: number
}

export interface VoiceTypeStat {
  value: string
  label: string
}

export interface VoiceTypeData {
  brand: string
  kicker: string
  typeName: string
  stats: VoiceTypeStat[]
}

export interface InsightsData {
  percentile: PercentileLadderData
  words: WordsDictatedData
  agent: AgentPromptsData
  apps: AppUsageItem[]
  streak: StreakData
  peakHours: PeakHoursData
  voiceType: VoiceTypeData
}
