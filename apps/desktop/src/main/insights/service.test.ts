import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db/connection'
import { runMigrations } from '../db/migrations'
import { insertSession, type NewSessionRecord } from '../db/sessions.repo'
import { appendTurn } from '../db/turns.repo'
import { getInsightsForUser } from './service'

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
    userId: 'user-a',
    prompt: 'hello there',
    reply: 'hi',
    wordCount: 2,
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

describe('getInsightsForUser', () => {
  it('returns a zeroed payload for an empty database', () => {
    const db = setup()
    const payload = getInsightsForUser('user-a', db)

    expect(payload.totalSessions).toBe(0)
    expect(payload.totalWords).toBe(0)
    expect(payload.topApps).toEqual([])
    expect(payload.appsUsed).toBe(0)
    expect(payload.agent.prompts).toBe(0)
    expect(payload.agent.sessions).toBe(0)
  })

  it('only aggregates the sessions owned by the requested user', () => {
    const db = setup()
    insertSession(session({ id: 'a-1', userId: 'user-a', wordCount: 3 }), db)
    insertSession(session({ id: 'a-2', userId: 'user-a', wordCount: 4 }), db)
    insertSession(
      session({ id: 'b-1', userId: 'user-b', wordCount: 10, appName: 'Other App' }),
      db
    )

    const forA = getInsightsForUser('user-a', db)
    const forB = getInsightsForUser('user-b', db)

    expect(forA.totalSessions).toBe(2)
    expect(forA.totalWords).toBe(7)
    expect(forA.topApps.map((app) => app.appName)).not.toContain('Other App')
    expect(forB.totalSessions).toBe(1)
    expect(forB.totalWords).toBe(10)
  })

  it('counts agent prompts from the stored user turns', () => {
    const db = setup()
    insertSession(
      session({ id: 'agent-1', userId: 'user-a', mode: 'agent', wordCount: 6 }),
      db
    )
    appendTurn({ sessionId: 'agent-1', role: 'user', content: 'one' }, db)
    appendTurn({ sessionId: 'agent-1', role: 'assistant', content: 'two' }, db)
    appendTurn({ sessionId: 'agent-1', role: 'user', content: 'three' }, db)
    appendTurn({ sessionId: 'agent-1', role: 'tool', content: 'four' }, db)
    appendTurn({ sessionId: 'agent-1', role: 'user', content: 'five' }, db)

    const payload = getInsightsForUser('user-a', db)

    expect(payload.agent.sessions).toBe(1)
    expect(payload.agent.prompts).toBe(3)
  })
})
