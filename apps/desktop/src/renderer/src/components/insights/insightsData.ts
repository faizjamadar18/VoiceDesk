import type { InsightsPayload } from '../../../../shared/types'
import type { InsightsData, PercentileBand } from './types'

export const THRESHOLDS: PercentileBand[] = [
  { topPercent: 1, minSessions: 3833 },
  { topPercent: 2, minSessions: 1831 },
  { topPercent: 3, minSessions: 1275 },
  { topPercent: 5, minSessions: 784 },
  { topPercent: 7, minSessions: 610 },
  { topPercent: 10, minSessions: 438 },
  { topPercent: 15, minSessions: 276 },
  { topPercent: 20, minSessions: 161 },
  { topPercent: 25, minSessions: 105 },
  { topPercent: 30, minSessions: 62 },
  { topPercent: 40, minSessions: 29 },
  { topPercent: 50, minSessions: 15 }
]

export const LADDER = [...THRESHOLDS].reverse()

export function toDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const EMPTY_INSIGHTS_DATA: InsightsData = {
  totalSessions: 0,
  totalWords: 0,
  timeSavedSeconds: 0,
  weekSessions: 0,
  weekWords: 0,
  weekTimeSavedSeconds: 0,
  avgWPM: null,
  typingMultiple: null,
  dayMap: new Map(),
  hourCounts: Array.from({ length: 24 }, () => 0),
  topApps: [],
  appsUsed: 0,
  agent: {
    prompts: 0,
    sessions: 0,
    timeSavedSeconds: 0,
    weekTimeSavedSeconds: 0,
    conversations: 0
  },
  streak: {
    current: 0,
    longest: 0,
    activeToday: false
  }
}

export function toInsightsData(payload: InsightsPayload): InsightsData {
  return {
    ...payload,
    dayMap: new Map(Object.entries(payload.dayMap)),
    hourCounts: Array.from({ length: 24 }, (_, hour) => payload.hourCounts[hour] ?? 0)
  }
}
