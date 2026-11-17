import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'
import {
  countSessions,
  getSession,
  insertSession,
  listSessions,
  listSessionsForInsights,
  softDeleteSession,
  updateSession,
  type NewSessionRecord
} from './sessions.repo'

const databases: DatabaseSync[] = []

function setup(): DatabaseSync {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)
  return db
}

function session(overrides: Partial<NewSessionRecord> = {}): NewSessionRecord {
  return {
    id: 'session-1',
    userId: 'user-1',
    prompt: 'what time is it',
    reply: 'it is noon',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) {
    try {
      db.close()
    } catch {
      // already closed
    }
  }
})

describe('sessions repository', () => {
  it('round-trips a session with a null user id', () => {
    const db = setup()

    insertSession(session({ userId: null }), db)

    const found = getSession('session-1', db)
    expect(found).toEqual({
      id: 'session-1',
      userId: null,
      mode: 'dictate',
      appName: null,
      appIcon: null,
      prompt: 'what time is it',
      reply: 'it is noon',
      tool: null,
      durationSeconds: null,
      wordCount: 0,
      language: null,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      deletedAt: null
    })
    expect(countSessions(undefined, db)).toBe(1)
    expect(countSessions(null, db)).toBe(1)
    expect(countSessions('user-1', db)).toBe(0)
    expect(getSession('missing', db)).toBeNull()
  })

  it('lists the newest sessions first and honours the limit', () => {
    const db = setup()
    insertSession(session({ id: 'a', createdAt: '2026-01-01T10:00:00.000Z' }), db)
    insertSession(session({ id: 'b', createdAt: '2026-01-02T10:00:00.000Z' }), db)
    insertSession(session({ id: 'c', createdAt: '2026-01-03T10:00:00.000Z' }), db)
    insertSession(session({ id: 'other', userId: 'user-2' }), db)

    expect(listSessions({ userId: 'user-1' }, db).map((row) => row.id)).toEqual(['c', 'b', 'a'])
    expect(listSessions({ userId: 'user-1', limit: 2 }, db).map((row) => row.id)).toEqual([
      'c',
      'b'
    ])
    expect(countSessions('user-1', db)).toBe(3)
  })

  it('updates fields and bumps the timestamp', () => {
    const db = setup()
    insertSession(session(), db)

    const updated = updateSession(
      'session-1',
      { reply: 'it is midnight', wordCount: 4, tool: null, appName: 'Slack' },
      db
    )

    expect(updated?.reply).toBe('it is midnight')
    expect(updated?.wordCount).toBe(4)
    expect(updated?.tool).toBeNull()
    expect(updated?.appName).toBe('Slack')
    expect(updated?.updatedAt).not.toBe('2026-01-01T10:00:00.000Z')
    expect(updateSession('missing', { reply: 'x' }, db)).toBeNull()
  })

  it('hides soft-deleted sessions from lists and insights', () => {
    const db = setup()
    insertSession(session({ id: 'a' }), db)
    insertSession(session({ id: 'b' }), db)
    insertSession(session({ id: 'empty-prompt', prompt: '' }), db)

    expect(softDeleteSession('a', db)).toBe(true)
    expect(softDeleteSession('missing', db)).toBe(false)

    expect(listSessions({ userId: 'user-1' }, db).map((row) => row.id)).toEqual([
      'empty-prompt',
      'b'
    ])
    expect(listSessionsForInsights('user-1', db).map((row) => row.id)).toEqual(['b'])
    expect(getSession('a', db)?.deletedAt).not.toBeNull()
  })
})
