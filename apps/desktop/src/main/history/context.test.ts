import { describe, expect, it } from 'vitest'
import type { HistoryRecord } from '../../shared/types'
import { RECENT_TURN_LIMIT, buildRecentContext, formatAge } from './context'

const NOW = new Date('2026-01-01T12:00:00.000Z')

function record(
  overrides: Partial<HistoryRecord> & { id?: string } = {}
): HistoryRecord {
  return {
    id: overrides.id ?? 'id',
    createdAt: overrides.createdAt ?? NOW.toISOString(),
    prompt: overrides.prompt ?? 'hello',
    reply: overrides.reply ?? 'hi',
    tool: overrides.tool ?? null
  }
}

describe('formatAge', () => {
  it.each([
    ['2026-01-01T11:59:30.000Z', 'just now'],
    ['2026-01-01T11:59:00.000Z', '1 minute ago'],
    ['2026-01-01T11:58:00.000Z', '2 minutes ago'],
    ['2026-01-01T11:00:00.000Z', '1 hour ago'],
    ['2026-01-01T09:00:00.000Z', '3 hours ago'],
    ['2025-12-31T11:00:00.000Z', 'yesterday'],
    ['2025-12-30T12:00:00.000Z', '2 days ago'],
    ['2025-12-26T12:00:00.000Z', '6 days ago']
  ])('labels %s as %s', (createdAt, expected) => {
    expect(formatAge(createdAt, NOW)).toBe(expected)
  })

  it('uses an absolute short date at a week or more', () => {
    const label = formatAge('2025-12-20T12:00:00.000Z', NOW)

    expect(label).not.toContain('ago')
    expect(label).not.toBe('yesterday')
    // The day may shift with the machine's timezone; the year must not.
    expect(label).toContain('2025')
    expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
  })

  it('treats a future timestamp as just now', () => {
    expect(formatAge('2026-01-01T13:00:00.000Z', NOW)).toBe('just now')
  })

  it('treats an unparsable timestamp as just now without throwing', () => {
    expect(() => formatAge('not-a-date', NOW)).not.toThrow()
    expect(formatAge('not-a-date', NOW)).toBe('just now')
  })
})

describe('buildRecentContext', () => {
  it('replays fewer than the limit, oldest first', () => {
    const records = [
      record({
        id: 'a',
        createdAt: '2026-01-01T11:00:00.000Z',
        prompt: 'first',
        reply: 'r1'
      }),
      record({
        id: 'b',
        createdAt: '2026-01-01T11:30:00.000Z',
        prompt: 'second',
        reply: 'r2'
      })
    ]

    expect(buildRecentContext(records, NOW)).toEqual([
      { role: 'user', content: '[1 hour ago] first' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: '[30 minutes ago] second' },
      { role: 'assistant', content: 'r2' }
    ])
  })

  it('keeps only the newest five, oldest first', () => {
    const records = Array.from({ length: 7 }, (_, index) =>
      record({
        id: `p${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 11, index)).toISOString(),
        prompt: `p${index + 1}`,
        reply: `r${index + 1}`
      })
    )

    const turns = buildRecentContext(records, NOW)
    const prompts = turns
      .filter((turn) => turn.role === 'user')
      .map((turn) => turn.content.replace(/^\[.*?\] /, ''))

    expect(turns).toHaveLength(RECENT_TURN_LIMIT * 2)
    expect(prompts).toEqual(['p3', 'p4', 'p5', 'p6', 'p7'])
  })

  it('labels the user turn with the age of the record', () => {
    const records = [
      record({
        createdAt: '2026-01-01T11:57:00.000Z',
        prompt: 'open calc',
        reply: 'Opening Calculator.'
      })
    ]

    const turns = buildRecentContext(records, NOW)

    expect(turns[0]?.content).toBe('[3 minutes ago] open calc')
  })

  it('replays the reply verbatim and unlabelled as the assistant turn', () => {
    const records = [
      record({
        createdAt: '2026-01-01T11:00:00.000Z',
        prompt: 'what time is it',
        reply: "It's 09:41, and here is a longer answer."
      })
    ]

    const turns = buildRecentContext(records, NOW)

    expect(turns[1]).toEqual({
      role: 'assistant',
      content: "It's 09:41, and here is a longer answer."
    })
  })

  it('skips records with an empty prompt or reply', () => {
    const records = [
      record({
        id: 'keep',
        createdAt: '2026-01-01T11:00:00.000Z',
        prompt: 'keep',
        reply: 'yes'
      }),
      record({
        id: 'blank-reply',
        createdAt: '2026-01-01T11:15:00.000Z',
        prompt: 'blank reply',
        reply: '   '
      }),
      record({
        id: 'blank-prompt',
        createdAt: '2026-01-01T11:30:00.000Z',
        prompt: '',
        reply: 'blank prompt'
      })
    ]

    expect(buildRecentContext(records, NOW)).toEqual([
      { role: 'user', content: '[1 hour ago] keep' },
      { role: 'assistant', content: 'yes' }
    ])
  })

  it('does not let a blank record consume one of the recent slots', () => {
    const records = Array.from({ length: 7 }, (_, index) =>
      record({
        id: `p${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 11, index)).toISOString(),
        prompt: `p${index + 1}`,
        reply: index === 3 ? '   ' : `r${index + 1}`
      })
    )

    const turns = buildRecentContext(records, NOW)
    const prompts = turns
      .filter((turn) => turn.role === 'user')
      .map((turn) => turn.content.replace(/^\[.*?\] /, ''))

    expect(turns).toHaveLength(RECENT_TURN_LIMIT * 2)
    expect(prompts).toEqual(['p2', 'p3', 'p5', 'p6', 'p7'])
    expect(turns.some((turn) => turn.content.includes('blank'))).toBe(false)
  })

  it('replays newest-first input oldest-first', () => {
    const records = [
      record({
        id: 'b',
        createdAt: '2026-01-01T11:30:00.000Z',
        prompt: 'second',
        reply: 'r2'
      }),
      record({
        id: 'a',
        createdAt: '2026-01-01T11:00:00.000Z',
        prompt: 'first',
        reply: 'r1'
      })
    ]

    expect(buildRecentContext(records, NOW).map((turn) => turn.content)).toEqual([
      '[1 hour ago] first',
      'r1',
      '[30 minutes ago] second',
      'r2'
    ])
  })

  it('returns nothing for a non-positive limit', () => {
    const records = [
      record({ createdAt: '2026-01-01T11:00:00.000Z', prompt: 'a', reply: 'b' })
    ]

    expect(buildRecentContext(records, NOW, 0)).toEqual([])
  })
})
