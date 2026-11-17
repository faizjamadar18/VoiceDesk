import { describe, expect, it } from 'vitest'
import { TYPING_WPM, aggregateInsights, countWords, type InsightSession } from './aggregate'

const NOW = new Date(2026, 10, 16, 12, 0, 0)

let nextId = 0

function dayIso(offset: number, hour = 12, minute = 0): string {
  return new Date(2026, 10, 16 - offset, hour, minute, 0).toISOString()
}

function localDayKey(offset: number): string {
  const date = new Date(2026, 10, 16 - offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function session(overrides: Partial<InsightSession> = {}): InsightSession {
  nextId += 1
  return {
    id: `session-${nextId}`,
    mode: 'dictate',
    appName: null,
    createdAt: dayIso(0, 9),
    durationSeconds: null,
    wordCount: 0,
    prompt: '',
    reply: '',
    ...overrides
  }
}

describe('countWords', () => {
  it('counts trimmed whitespace-separated tokens', () => {
    expect(countWords('  hello   world\n again ')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t ')).toBe(0)
  })
})

describe('aggregateInsights', () => {
  it('returns a fully formed payload for no sessions', () => {
    expect(aggregateInsights([], NOW)).toEqual({
      totalSessions: 0,
      totalWords: 0,
      timeSavedSeconds: 0,
      weekSessions: 0,
      weekWords: 0,
      weekTimeSavedSeconds: 0,
      avgWPM: null,
      typingMultiple: null,
      dayMap: {},
      hourCounts: new Array(24).fill(0),
      topApps: [],
      appsUsed: 0,
      agent: {
        prompts: 0,
        sessions: 0,
        timeSavedSeconds: 0,
        weekTimeSavedSeconds: 0,
        conversations: 0
      },
      streak: { current: 0, longest: 0, activeToday: false }
    })
  })

  it('aggregates a single dictation session', () => {
    const payload = aggregateInsights(
      [
        session({
          appName: 'Slack',
          createdAt: dayIso(0, 9, 30),
          durationSeconds: 45,
          wordCount: 40,
          prompt: 'ignored because word count is known'
        })
      ],
      NOW
    )

    expect(payload.totalSessions).toBe(1)
    expect(payload.totalWords).toBe(40)
    expect(payload.timeSavedSeconds).toBe(15)
    expect(payload.weekSessions).toBe(1)
    expect(payload.weekWords).toBe(40)
    expect(payload.weekTimeSavedSeconds).toBe(15)
    expect(payload.hourCounts[9]).toBe(1)
    expect(payload.dayMap[localDayKey(0)]).toEqual({ sessions: 1, words: 40 })
    expect(payload.appsUsed).toBe(1)
    expect(payload.topApps[0]).toMatchObject({ appName: 'Slack', sessions: 1, words: 40 })
    expect(payload.streak).toEqual({ current: 1, longest: 1, activeToday: true })
    expect(TYPING_WPM).toBe(40)
  })

  it('falls back to counting prompt words when wordCount is zero', () => {
    const payload = aggregateInsights(
      [session({ wordCount: 0, prompt: 'one two   three', durationSeconds: null })],
      NOW
    )

    expect(payload.totalWords).toBe(3)
    expect(payload.timeSavedSeconds).toBe(5)
  })

  it('includes day 6 but not day 7 in the week window', () => {
    const payload = aggregateInsights(
      [
        session({ createdAt: dayIso(0), wordCount: 5 }),
        session({ createdAt: dayIso(6), wordCount: 7 }),
        session({ createdAt: dayIso(7), wordCount: 11 })
      ],
      NOW
    )

    expect(payload.totalSessions).toBe(3)
    expect(payload.totalWords).toBe(23)
    expect(payload.weekSessions).toBe(2)
    expect(payload.weekWords).toBe(12)
    expect(Object.keys(payload.dayMap).sort()).toEqual([
      localDayKey(7),
      localDayKey(6),
      localDayKey(0)
    ])
  })

  it('keys dayMap by local date', () => {
    const payload = aggregateInsights(
      [session({ createdAt: dayIso(0, 0, 5) }), session({ createdAt: dayIso(1, 23, 55) })],
      NOW
    )

    expect(Object.keys(payload.dayMap).sort()).toEqual([
      localDayKey(1),
      localDayKey(0)
    ])
  })

  it('buckets sessions by local hour', () => {
    const payload = aggregateInsights(
      [
        session({ createdAt: dayIso(0, 0, 15) }),
        session({ createdAt: dayIso(0, 23, 45) }),
        session({ createdAt: dayIso(1, 23, 5) })
      ],
      NOW
    )

    expect(payload.hourCounts).toHaveLength(24)
    expect(payload.hourCounts[0]).toBe(1)
    expect(payload.hourCounts[23]).toBe(2)
    expect(payload.hourCounts.reduce((sum, count) => sum + count, 0)).toBe(3)
  })

  it('ranks apps by sessions then words and skips missing or blank names', () => {
    const payload = aggregateInsights(
      [
        session({ appName: 'Slack', wordCount: 2 }),
        session({ appName: 'Slack', wordCount: 2 }),
        session({ appName: 'Gmail', wordCount: 10 }),
        session({ appName: 'Gmail', wordCount: 10 }),
        session({ appName: null, wordCount: 5 }),
        session({ appName: '   ', wordCount: 5 })
      ],
      NOW
    )

    expect(payload.appsUsed).toBe(2)
    expect(payload.topApps.map((app) => app.appName)).toEqual(['Gmail', 'Slack'])
    expect(payload.topApps[0]).toEqual({
      appName: 'Gmail',
      sessions: 2,
      words: 20,
      relative: 1,
      share: 2 / 6
    })
    expect(payload.topApps[1]).toEqual({
      appName: 'Slack',
      sessions: 2,
      words: 4,
      relative: 1,
      share: 2 / 6
    })
  })

  it('counts the current streak back from today when today is active', () => {
    const payload = aggregateInsights(
      [
        session({ createdAt: dayIso(0) }),
        session({ createdAt: dayIso(1) }),
        session({ createdAt: dayIso(2) }),
        session({ createdAt: dayIso(4) })
      ],
      NOW
    )

    expect(payload.streak).toEqual({ current: 3, longest: 3, activeToday: true })
  })

  it('keeps the streak alive from yesterday when today is empty', () => {
    const payload = aggregateInsights(
      [session({ createdAt: dayIso(1) }), session({ createdAt: dayIso(2) })],
      NOW
    )

    expect(payload.streak).toEqual({ current: 2, longest: 2, activeToday: false })
  })

  it('reports the longest streak across the whole set', () => {
    const payload = aggregateInsights(
      [
        session({ createdAt: dayIso(0) }),
        session({ createdAt: dayIso(10) }),
        session({ createdAt: dayIso(11) }),
        session({ createdAt: dayIso(12) }),
        session({ createdAt: dayIso(13) })
      ],
      NOW
    )

    expect(payload.streak).toEqual({ current: 1, longest: 4, activeToday: true })
  })

  it('computes average WPM only from sessions with a known duration', () => {
    const unknown = aggregateInsights([session({ wordCount: 40, durationSeconds: null })], NOW)

    expect(unknown.avgWPM).toBeNull()
    expect(unknown.typingMultiple).toBeNull()

    const known = aggregateInsights(
      [
        session({ wordCount: 30, durationSeconds: 30 }),
        session({ wordCount: 30, durationSeconds: 30 })
      ],
      NOW
    )

    expect(known.avgWPM).toBe(60)
    expect(known.typingMultiple).toBe(1.5)
  })

  it('counts agent prompts with a floor of one per session', () => {
    const payload = aggregateInsights(
      [
        session({ mode: 'agent', userTurnCount: 0, prompt: 'one two' }),
        session({ mode: 'agent', userTurnCount: 3, prompt: 'one two' }),
        session({ mode: 'agent', prompt: 'one two' }),
        session({ mode: 'dictate', userTurnCount: 9, wordCount: 100 })
      ],
      NOW
    )

    expect(payload.agent).toEqual({
      prompts: 5,
      sessions: 3,
      conversations: 3,
      timeSavedSeconds: 9,
      weekTimeSavedSeconds: 9
    })
    expect(payload.totalWords).toBe(106)
  })
})
