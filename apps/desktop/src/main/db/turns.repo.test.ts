import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'
import { insertSession } from './sessions.repo'
import { appendTurn, deleteTurnsForSession, listTurns } from './turns.repo'

const databases: DatabaseSync[] = []

function setup(): DatabaseSync {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)
  insertSession(
    { id: 'session-1', userId: 'user-1', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z' },
    db
  )
  return db
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

describe('turns repository', () => {
  it('appends turns with increasing sequences', () => {
    const db = setup()

    const first = appendTurn({ sessionId: 'session-1', role: 'user', content: 'hello' }, db)
    const second = appendTurn(
      { sessionId: 'session-1', role: 'assistant', content: 'hi', toolName: 'gmail' },
      db
    )
    const third = appendTurn({ sessionId: 'session-1', role: 'tool', content: 'done' }, db)

    expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 3])
    expect(first.toolName).toBeNull()
    expect(second.toolName).toBe('gmail')
    expect(first.id).not.toBe('')
    expect(listTurns('session-1', db).map((turn) => turn.content)).toEqual([
      'hello',
      'hi',
      'done'
    ])
  })

  it('rejects a second turn with the same sequence', () => {
    const db = setup()
    appendTurn({ sessionId: 'session-1', role: 'user', content: 'hello' }, db)

    expect(() =>
      db
        .prepare(
          'INSERT INTO turns (id, session_id, sequence, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run('duplicate', 'session-1', 1, 'user', 'again', '2026-01-01T10:00:00.000Z')
    ).toThrow(/UNIQUE/)
  })

  it('deletes every turn of one session', () => {
    const db = setup()
    appendTurn({ sessionId: 'session-1', role: 'user', content: 'hello' }, db)
    appendTurn({ sessionId: 'session-1', role: 'assistant', content: 'hi' }, db)

    deleteTurnsForSession('session-1', db)

    expect(listTurns('session-1', db)).toEqual([])
  })

  it('cascades turns when the session row is deleted', () => {
    const db = setup()
    appendTurn({ sessionId: 'session-1', role: 'user', content: 'hello' }, db)

    expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1)
    db.prepare('DELETE FROM sessions WHERE id = ?').run('session-1')

    expect(listTurns('session-1', db)).toEqual([])
  })
})
