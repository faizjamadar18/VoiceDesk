import type { InsightsData, PercentileBand, VoiceTypeCardModel } from './types'

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

function buildMockDayMap(): Map<string, { sessions: number; words: number }> {
  const map = new Map<string, { sessions: number; words: number }>()
  const today = new Date()

  // 5-day active streak ending today:
  // Day 0 (today): 31 sessions, 540 words
  // Day -1: 32 sessions, 550 words
  // Day -2: 30 sessions, 520 words
  // Day -3: 33 sessions, 567 words
  // Day -4: 31 sessions, 540 words
  // Total: 157 sessions, 2717 words
  const streakSessions = [31, 32, 30, 33, 31]
  const streakWords = [540, 550, 520, 567, 540]

  for (let i = 0; i < 5; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    map.set(toDayKey(d), {
      sessions: streakSessions[i],
      words: streakWords[i]
    })
  }

  return map
}

export const MOCK_INSIGHTS_DATA: InsightsData = {
  totalSessions: 157,
  totalWords: 2717,
  timeSavedSeconds: 3000, // 50m
  weekSessions: 157,
  weekWords: 2717,
  weekTimeSavedSeconds: 3000,
  avgWPM: null,
  typingMultiple: null,
  appsUsed: 4,
  agent: {
    prompts: 151,
    sessions: 151,
    timeSavedSeconds: 2940, // 49m
    weekTimeSavedSeconds: 2940,
    conversations: 151
  },
  streak: {
    current: 5,
    longest: 5,
    activeToday: true
  },
  topApps: [
    { appName: 'VoiceOS', sessions: 78, words: 1350, relative: 1.0, share: 0.5 },
    { appName: 'explorer', sessions: 27, words: 450, relative: 0.35, share: 0.17 },
    { appName: 'Antigravity IDE', sessions: 26, words: 460, relative: 0.33, share: 0.17 },
    { appName: 'msedge', sessions: 26, words: 457, relative: 0.33, share: 0.17 }
  ],
  // 24 hours: peak at 7 AM (52 sessions)
  hourCounts: [
    0, 1, 0, 0, 0, 2, 8, 52, 24, 18, 12, 10, 8, 5, 6, 4, 3, 2, 1, 1, 0, 0, 0, 0
  ],
  dayMap: buildMockDayMap()
}

export const MOCK_VOICE_TYPE_MODEL: VoiceTypeCardModel = {
  brand: 'VoiceOS',
  kicker: 'YOUR VOICE TYPE',
  typeName: 'The Agent Commander',
  stats: [
    { label: 'Words dictated', value: '2,717' },
    { label: 'Time saved', value: '1h 39m' },
    { label: 'Agent tasks', value: '151' }
  ]
}
