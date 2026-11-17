import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db/connection'
import { runMigrations } from '../db/migrations'
import { insertSession } from '../db/sessions.repo'
import { appendTurn, listTurns } from '../db/turns.repo'
import { deleteLocalData } from './delete-local-data'

const databases: DatabaseSync[] = []

function setup(): DatabaseSync {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)
  return db
}

function seedSession(db: DatabaseSync, id: string, userId: string): void {
  insertSession(
    {
      id,
      userId,
      prompt: `prompt for ${id}`,
      reply: 'reply',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z'
    },
    db
  )
  appendTurn({ sessionId: id, role: 'user', content: 'hi' }, db)
  appendTurn({ sessionId: id, role: 'assistant', content: 'hello' }, db)
}

function countRows(db: DatabaseSync, sql: string, userId: string): number {
  const row = db.prepare(sql).get(userId)
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

describe('deleteLocalData', () => {
  it('deletes only the target user rows and cascades their turns', () => {
    const db = setup()
    seedSession(db, 'a-1', 'user-a')
    seedSession(db, 'a-2', 'user-a')
    seedSession(db, 'b-1', 'user-b')
    db.prepare(
      "INSERT INTO session_insights (id, user_id, source_updated_at, metrics_json) VALUES ('i-a', 'user-a', 'now', '{}')"
    ).run()
    db.prepare(
      "INSERT INTO session_insights (id, user_id, source_updated_at, metrics_json) VALUES ('i-b', 'user-b', 'now', '{}')"
    ).run()

    const result = deleteLocalData('user-a', db)

    expect(result.sessions).toBe(2)
    expect(result.turns).toBe(4)
    expect(
      countRows(db, 'SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?', 'user-a')
    ).toBe(0)
    expect(countRows(db, 'SELECT COUNT(*) AS total FROM turns WHERE session_id LIKE ?', 'a-%')).toBe(0)
    expect(
      countRows(
        db,
        'SELECT COUNT(*) AS total FROM session_insights WHERE user_id = ?',
        'user-a'
      )
    ).toBe(0)

    // The other user is untouched, including their turns and insight rows.
    expect(
      countRows(db, 'SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?', 'user-b')
    ).toBe(1)
    expect(listTurns('b-1', db)).toHaveLength(2)
    expect(
      countRows(
        db,
        'SELECT COUNT(*) AS total FROM session_insights WHERE user_id = ?',
        'user-b'
      )
    ).toBe(1)
  })
})
