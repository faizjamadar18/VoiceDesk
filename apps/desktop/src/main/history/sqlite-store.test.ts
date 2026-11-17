import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db/connection'
import { runMigrations } from '../db/migrations'
import { listTurns } from '../db/turns.repo'
import { MAX_HISTORY_RECORDS, SqliteHistoryStore } from './sqlite-store'

const databases: DatabaseSync[] = []

function setup(userId: string | null = 'user-1') {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)
  return { db, store: new SqliteHistoryStore(db, () => userId) }
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

describe('SqliteHistoryStore', () => {
  it('records a turn and lists it newest first', () => {
    const { store } = setup()

    const first = store.record(
      { prompt: 'what time is it', reply: 'It is noon.' },
      new Date('2026-01-01T10:00:00.000Z')
    )
    const second = store.record(
      { prompt: 'open my email', reply: 'Opening Gmail.', tool: 'gmail' },
      new Date('2026-01-01T11:00:00.000Z')
    )

    expect(first.id).not.toBe('')
    expect(first.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(store.list().map((record) => record.id)).toEqual([second.id, first.id])
    expect(store.count()).toBe(2)
  })

  it('caps the list without deleting the rows insights need', () => {
    const { store } = setup()

    for (let index = 0; index < MAX_HISTORY_RECORDS + 1; index += 1) {
      store.record(
        { prompt: `prompt ${index}`, reply: `reply ${index}` },
        new Date(Date.UTC(2026, 0, 1, 0, 0, index))
      )
    }

    const records = store.list()
    expect(records).toHaveLength(MAX_HISTORY_RECORDS)
    expect(records.at(0)?.prompt).toBe(`prompt ${MAX_HISTORY_RECORDS}`)
    expect(store.count()).toBe(MAX_HISTORY_RECORDS + 1)
  })

  it('soft deletes a record and reports unknown ids', () => {
    const { db, store } = setup()
    const saved = store.record({ prompt: 'a', reply: 'b' })

    expect(store.delete(saved.id)).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.count()).toBe(0)
    expect(store.delete('does-not-exist')).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS total FROM sessions').get()?.total).toBe(1)
  })

  it('writes a user turn and an assistant turn per record', () => {
    const { db, store } = setup()

    const saved = store.record({ prompt: 'what time is it', reply: 'It is noon.' })
    store.record({ prompt: 'dictated words', reply: '' })

    expect(listTurns(saved.id, db).map((turn) => [turn.role, turn.content])).toEqual([
      ['user', 'what time is it'],
      ['assistant', 'It is noon.']
    ])
    const dictated = store.list().find((record) => record.prompt === 'dictated words')
    expect(dictated && listTurns(dictated.id, db).map((turn) => turn.role)).toEqual(['user'])
  })

  it('claims only orphan rows when a user id arrives', () => {
    const { db, store } = setup(null)
    const orphan = store.record({ prompt: 'before login', reply: '' })

    expect(store.adoptOrphanSessions('user-1')).toBe(1)
    expect(store.adoptOrphanSessions('user-1')).toBe(0)
    expect(
      db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(orphan.id)?.user_id
    ).toBe('user-1')
  })
})
