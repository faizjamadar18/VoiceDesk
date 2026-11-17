import type { InsightsAppUsage, InsightsPayload } from '../../shared/types'

/** Baseline human typing speed used to turn words into time saved. */
export const TYPING_WPM = 40

export interface InsightSession {
  id: string
  mode: 'dictate' | 'agent'
  appName: string | null
  /** ISO UTC timestamp. */
  createdAt: string
  durationSeconds: number | null
  /** 0 when unknown, so the prompt is counted instead. */
  wordCount: number
  prompt: string
  reply: string
  /** User messages in an agent session. */
  userTurnCount?: number
}

const MS_PER_DAY = 86_400_000
const SECONDS_PER_WORD = 60 / TYPING_WPM
const WEEK_DAYS = 7
const TOP_APP_LIMIT = 5

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export function aggregateInsights(sessions: InsightSession[], now: Date): InsightsPayload {
  const dayMap: Record<string, { sessions: number; words: number }> = {}
  const hourCounts: number[] = new Array(24).fill(0)
  const appTotals = new Map<string, { sessions: number; words: number }>()
  const weekKeys = new Set<string>()
  for (let offset = 0; offset < WEEK_DAYS; offset += 1) {
    weekKeys.add(localDayKey(shiftLocalDay(now, -offset)))
  }

  let totalSessions = 0
  let totalWords = 0
  let timeSavedSeconds = 0
  let weekSessions = 0
  let weekWords = 0
  let weekTimeSavedSeconds = 0
  let agentSessions = 0
  let agentPrompts = 0
  let agentTimeSavedSeconds = 0
  let agentWeekTimeSavedSeconds = 0
  let knownDurationSeconds = 0
  let knownDurationSessions = 0

  for (const session of sessions) {
    const created = new Date(session.createdAt)
    const dayKey = localDayKey(created)
    const words = session.wordCount > 0 ? session.wordCount : countWords(session.prompt)
    const saved = Math.max(0, words * SECONDS_PER_WORD - (session.durationSeconds ?? 0))
    const inWeek = weekKeys.has(dayKey)

    totalSessions += 1
    totalWords += words
    timeSavedSeconds += saved
    hourCounts[created.getHours()] += 1

    const day = dayMap[dayKey] ?? { sessions: 0, words: 0 }
    day.sessions += 1
    day.words += words
    dayMap[dayKey] = day

    if (inWeek) {
      weekSessions += 1
      weekWords += words
      weekTimeSavedSeconds += saved
    }

    if (session.durationSeconds !== null) {
      knownDurationSeconds += session.durationSeconds
      knownDurationSessions += 1
    }

    const appName = session.appName?.trim() ?? ''
    if (appName !== '') {
      const app = appTotals.get(appName) ?? { sessions: 0, words: 0 }
      app.sessions += 1
      app.words += words
      appTotals.set(appName, app)
    }

    if (session.mode === 'agent') {
      agentSessions += 1
      agentPrompts += Math.max(1, session.userTurnCount ?? 1)
      agentTimeSavedSeconds += saved
      if (inWeek) agentWeekTimeSavedSeconds += saved
    }
  }

  const topApps = rankApps(appTotals, totalSessions)
  const knownMinutes = knownDurationSeconds / 60
  const avgWPM =
    knownDurationSessions > 0 && knownMinutes > 0 ? totalWords / knownMinutes : null

  return {
    totalSessions,
    totalWords,
    timeSavedSeconds: Math.round(timeSavedSeconds),
    weekSessions,
    weekWords,
    weekTimeSavedSeconds: Math.round(weekTimeSavedSeconds),
    avgWPM,
    typingMultiple: avgWPM === null ? null : avgWPM / TYPING_WPM,
    dayMap,
    hourCounts,
    topApps,
    appsUsed: appTotals.size,
    agent: {
      prompts: agentPrompts,
      sessions: agentSessions,
      timeSavedSeconds: Math.round(agentTimeSavedSeconds),
      weekTimeSavedSeconds: Math.round(agentWeekTimeSavedSeconds),
      conversations: agentSessions
    },
    streak: {
      current: currentStreak(dayMap, now),
      longest: longestStreak(dayMap),
      activeToday: dayMap[localDayKey(now)] !== undefined
    }
  }
}

function rankApps(
  totals: Map<string, { sessions: number; words: number }>,
  totalSessions: number
): InsightsAppUsage[] {
  const ranked = [...totals.entries()].sort(
    (a, b) => b[1].sessions - a[1].sessions || b[1].words - a[1].words
  )
  const topSessions = ranked[0]?.[1].sessions ?? 0

  return ranked.slice(0, TOP_APP_LIMIT).map(([appName, app]) => ({
    appName,
    sessions: app.sessions,
    words: app.words,
    relative: topSessions === 0 ? 0 : app.sessions / topSessions,
    share: totalSessions === 0 ? 0 : app.sessions / totalSessions
  }))
}

function currentStreak(
  dayMap: Record<string, { sessions: number; words: number }>,
  now: Date
): number {
  const today = dayOrdinal(now)
  let cursor = dayMap[localDayKey(now)] !== undefined ? today : today - 1
  let streak = 0

  while (dayMap[ordinalDayKey(cursor)] !== undefined) {
    streak += 1
    cursor -= 1
  }

  return streak
}

function longestStreak(dayMap: Record<string, { sessions: number; words: number }>): number {
  const ordinals = Object.keys(dayMap)
    .map(keyOrdinal)
    .sort((a, b) => a - b)

  let longest = 0
  let run = 0
  let previous: number | null = null

  for (const ordinal of ordinals) {
    run = previous !== null && ordinal === previous + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = ordinal
  }

  return longest
}

function localDayKey(date: Date): string {
  return formatDayKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftLocalDay(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function dayOrdinal(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)
}

function keyOrdinal(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

function ordinalDayKey(ordinal: number): string {
  const date = new Date(ordinal * MS_PER_DAY)
  return formatDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}
