import type { InsightsData, StreakCell } from './types'

function generateDummyStreakWeeks(): StreakCell[][] {
  const weeks: StreakCell[][] = []
  const today = new Date(2026, 10, 14) // Nov 14, 2026
  const totalWeeks = 22

  for (let w = totalWeeks - 1; w >= 0; w--) {
    const week: StreakCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(today)
      date.setDate(today.getDate() - (w * 7 + (6 - d)))
      const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      const isPast5Days = diffDays >= 0 && diffDays < 5
      week.push({
        date: date.toISOString().split('T')[0],
        active: isPast5Days,
        count: isPast5Days ? 1 : 0,
        isFuture: diffDays < 0
      })
    }
    weeks.push(week)
  }
  return weeks
}

export const DUMMY_INSIGHTS_DATA: InsightsData = {
  percentile: {
    topPercent: 25,
    dailyAverageSessions: 31,
    nextTopPercent: 20,
    sessionsToNext: 4,
    litThrough: 4
  },
  words: {
    totalWords: 2717,
    timeSavedMinutes: 50,
    sessions: 157,
    weekWords: 2717
  },
  agent: {
    prompts: 151,
    timeSavedMinutes: 49,
    sessions: 151,
    weekMinutes: 49
  },
  apps: [
    { name: 'VoiceOS', sessions: 3, share: 0.5, icon: 'voiceos' },
    { name: 'explorer', sessions: 1, share: 0.17, icon: 'explorer' },
    { name: 'Antigravity IDE', sessions: 1, share: 0.17, icon: 'antigravity' },
    { name: 'msedge', sessions: 1, share: 0.17, icon: 'edge' }
  ],
  streak: {
    current: 5,
    longest: 5,
    activeToday: true,
    weeks: generateDummyStreakWeeks()
  },
  peakHours: {
    hourCounts: [
      2, 0, 0, 0, 0, 0, 0, 18, 0, 0, 0, 3, 0, 0, 4, 0, 0, 3, 0, 2, 0, 0, 0, 0
    ],
    busiestHour: 7
  },
  voiceType: {
    brand: 'VoiceOS.com',
    kicker: 'YOUR VOICE TYPE',
    typeName: 'The Agent Commander',
    stats: [
      { value: '2,717', label: 'Words dictated' },
      { value: '1h 39m', label: 'Time saved' },
      { value: '151', label: 'Agent tasks' }
    ]
  }
}
