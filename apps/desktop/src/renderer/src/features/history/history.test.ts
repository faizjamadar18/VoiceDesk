import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { filterRecords, formatRelativeTime, HistoryPage } from './HistoryPage'
import type { HistoryRecord } from '../../../../shared/types'

const RECORDS: HistoryRecord[] = [
  {
    id: 'record-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    prompt: 'Book a meeting with Alice',
    reply: 'Done — the meeting is booked for Monday.',
    tool: 'calendar',
    mode: 'agent',
    appName: 'Google Calendar'
  },
  {
    id: 'record-2',
    createdAt: '2025-01-02T00:00:00.000Z',
    prompt: 'What is the weather?',
    reply: 'It is sunny today.',
    tool: null,
    mode: 'agent',
    appName: 'VoiceOS'
  },
  {
    id: 'record-3',
    createdAt: '2025-01-03T00:00:00.000Z',
    prompt: 'Hey team, here is the update on our progress.',
    reply: '',
    tool: null,
    mode: 'dictate',
    appName: 'Slack'
  }
]

const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES
const DAYS = 24 * HOURS

const isoAgo = (ms: number): string => new Date(Date.now() - ms).toISOString()

describe('filterRecords', () => {
  it('returns everything for an empty or whitespace-only query', () => {
    expect(filterRecords(RECORDS, '')).toBe(RECORDS)
    expect(filterRecords(RECORDS, '   ')).toBe(RECORDS)
    expect(filterRecords(RECORDS, '')).toHaveLength(RECORDS.length)
  })

  it('matches the prompt case-insensitively', () => {
    expect(filterRecords(RECORDS, 'ALICE')).toEqual([RECORDS[0]])
  })

  it('matches the reply case-insensitively', () => {
    expect(filterRecords(RECORDS, 'sunny')).toEqual([RECORDS[1]])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterRecords(RECORDS, 'nonexistent')).toEqual([])
  })

  it('filters by selectedApp', () => {
    expect(filterRecords(RECORDS, '', 'Slack')).toEqual([RECORDS[2]])
    expect(filterRecords(RECORDS, '', 'Google Calendar')).toEqual([RECORDS[0]])
  })

  it('filters by selectedMode', () => {
    expect(filterRecords(RECORDS, '', null, 'dictate')).toEqual([RECORDS[2]])
    expect(filterRecords(RECORDS, '', null, 'agent')).toEqual([RECORDS[0], RECORDS[1]])
  })

  it('combines query, selectedApp, and selectedMode', () => {
    expect(filterRecords(RECORDS, 'update', 'Slack', 'dictate')).toEqual([RECORDS[2]])
    expect(filterRecords(RECORDS, 'update', 'Slack', 'agent')).toEqual([])
  })
})

describe('formatRelativeTime', () => {
  it('reports the last few seconds as "just now"', () => {
    expect(formatRelativeTime(isoAgo(5 * SECONDS))).toBe('just now')
  })

  it('reports seconds ago', () => {
    expect(formatRelativeTime(isoAgo(30 * SECONDS))).toBe('30s ago')
  })

  it('reports minutes ago', () => {
    expect(formatRelativeTime(isoAgo(5 * MINUTES))).toBe('5m ago')
  })

  it('reports hours ago', () => {
    expect(formatRelativeTime(isoAgo(3 * HOURS))).toBe('3h ago')
  })

  it('reports the previous day as "yesterday"', () => {
    expect(formatRelativeTime(isoAgo(26 * HOURS))).toBe('yesterday')
  })

  it('reports a few days ago in days', () => {
    expect(formatRelativeTime(isoAgo(3 * DAYS))).toBe('3d ago')
  })

  it('falls back to an absolute date for an old timestamp', () => {
    expect(formatRelativeTime('2020-01-15T10:30:00.000Z')).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/
    )
  })
})

describe('HistoryPage component markup', () => {
  it('renders the empty state when records is empty', () => {
    const markup = renderToStaticMarkup(createElement(HistoryPage, { records: [] }))
    expect(markup).toContain('History')
    expect(markup).toContain('Search history')
    expect(markup).toContain('All Apps')
    expect(markup).toContain('All Modes')
    expect(markup).toContain('No voice sessions yet. Start using VoiceOS to see your history here.')
  })

  it('renders cards with correct mode subheaders, app names, prompts, and replies', () => {
    const markup = renderToStaticMarkup(createElement(HistoryPage, { records: RECORDS }))
    expect(markup).toContain('History')
    // Check dictate mode card
    expect(markup).toContain('Slack')
    expect(markup).toContain('Dictation Mode')
    expect(markup).toContain('Hey team, here is the update on our progress.')
    // Check agent mode card has Agent Mode header, prompt, globe icon and reply
    expect(markup).toContain('Agent Mode')
    expect(markup).toContain('Book a meeting with Alice')
    expect(markup).toContain('cloud-viewport')
    expect(markup).toContain('Done — the meeting is booked for Monday.')
  })
})
