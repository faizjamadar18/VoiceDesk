import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db/connection'
import { runMigrations } from '../db/migrations'
import { insertSession } from '../db/sessions.repo'
import { appendTurn } from '../db/turns.repo'
import { deleteAccount } from './delete-account'

const databases: DatabaseSync[] = []

function setup(): DatabaseSync {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)
  insertSession(
    {
      id: 'session-1',
      userId: 'user-a',
      prompt: 'hi',
      reply: 'hello',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z'
    },
    db
  )
  appendTurn({ sessionId: 'session-1', role: 'user', content: 'hi' }, db)
  return db
}

function countSessions(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM sessions').get()
  const value = row?.total
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function countTurns(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM turns').get()
  const value = row?.total
  return typeof value === 'number' ? value : Number(value ?? 0)
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

describe('deleteAccount', () => {
  it('clears local data and signs out after the API confirms deletion', async () => {
    const db = setup()
    const signOut = vi.fn(async () => {})
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))

    const result = await deleteAccount({
      userId: 'user-a',
      auth: { signOut },
      db,
      apiBaseUrl: 'http://api.test',
      fetch: fetchImpl
    })

    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/api/users/user-a',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(countSessions(db)).toBe(0)
    expect(countTurns(db)).toBe(0)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('keeps local data and reports the failure when the API errors', async () => {
    const db = setup()
    const signOut = vi.fn(async () => {})
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))

    const result = await deleteAccount({
      userId: 'user-a',
      auth: { signOut },
      db,
      apiBaseUrl: 'http://api.test',
      fetch: fetchImpl
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(countSessions(db)).toBe(1)
    expect(countTurns(db)).toBe(1)
    expect(signOut).not.toHaveBeenCalled()
  })
})
