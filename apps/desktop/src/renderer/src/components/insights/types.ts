export interface AppUsageItem {
  appName: string
  sessions: number
  words: number
  relative: number
  share: number
}

export interface DayMetric {
  sessions: number
  words: number
}

export interface AgentMetrics {
  prompts: number
  sessions: number
  timeSavedSeconds: number
  weekTimeSavedSeconds: number
  conversations: number
}

export interface StreakMetrics {
  current: number
  longest: number
  activeToday: boolean
}

export interface InsightsData {
  totalSessions: number
  totalWords: number
  timeSavedSeconds: number
  weekSessions: number
  weekWords: number
  weekTimeSavedSeconds: number
  avgWPM: number | null
  typingMultiple: number | null
  dayMap: Map<string, DayMetric>
  hourCounts: number[]
  topApps: AppUsageItem[]
  appsUsed: number
  agent: AgentMetrics
  streak: StreakMetrics
}

export interface VoiceTypeStat {
  label: string
  value: string
}

export interface VoiceTypeCardModel {
  brand: string
  kicker: string
  typeName: string
  stats: VoiceTypeStat[]
}

export interface PercentileBand {
  topPercent: number
  minSessions: number
}
