import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db/connection'
import { runMigrations } from '../db/migrations'
import { insertSession } from '../db/sessions.repo'
import { listTurns } from '../db/turns.repo'
import { importLegacyHistory } from './legacy-import'

const databases: DatabaseSync[] = []
const directories: string[] = []

function setup() {
  const db = openDatabase(':memory:')
  runMigrations(db)
  databases.push(db)

  const directory = mkdtempSync(join(tmpdir(), 'kestrel-legacy-'))
  directories.push(directory)
  return { db, file: join(directory, 'kestrel-history.json') }
}

function writeLegacy(file: string, records: unknown): void {
  writeFileSync(file, JSON.stringify(records), 'utf8')
}

afterEach(() => {
  for (const db of databases.splice(0)) {
    try {
      db.close()
    } catch {
      // already closed
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('importLegacyHistory', () => {
  it('imports every record, keeping ids and timestamps, and writes turns', () => {
    const { db, file } = setup()
    writeLegacy(file, [
      {
        id: 'legacy-1',
        createdAt: '2026-01-01T10:00:00.000Z',
        prompt: 'what time is it',
        reply: 'It is noon.',
        tool: null
      },
      {
        createdAt: '2026-01-01T11:00:00.000Z',
        prompt: 'open my email',
        reply: 'Opening Gmail.',
        tool: 'gmail',
        mode: 'agent',
        appName: 'Slack'
      }
    ])

    expect(importLegacyHistory(db, file, 'user-1')).toEqual({ imported: 2 })

    const rows = db
      .prepare('SELECT id, user_id, created_at, prompt FROM sessions ORDER BY created_at ASC')
      .all()
    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe('legacy-1')
    expect(rows[0]?.created_at).toBe('2026-01-01T10:00:00.000Z')
    expect(rows[0]?.user_id).toBe('user-1')
    expect(typeof rows[1]?.id).toBe('string')
    expect(rows[1]?.id).not.toBe('')
    expect(listTurns('legacy-1', db).map((turn) => turn.role)).toEqual(['user', 'assistant'])
  })

  it('does nothing when the sessions table already has rows', () => {
    const { db, file } = setup()
    insertSession(
      {
        id: 'existing',
        prompt: 'already here',
        reply: '',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      db
    )
    writeLegacy(file, [
      {
        id: 'legacy-1',
        createdAt: '2026-01-01T10:00:00.000Z',
        prompt: 'old',
        reply: 'older'
      }
    ])

    expect(importLegacyHistory(db, file, null)).toEqual({ imported: 0 })
    expect(existsSync(file)).toBe(true)
    expect(db.prepare('SELECT COUNT(*) AS total FROM sessions').get()?.total).toBe(1)
  })

  it('tolerates a malformed or missing file', () => {
    const { db, file } = setup()
    writeFileSync(file, '{not json', 'utf8')

    expect(importLegacyHistory(db, file, null)).toEqual({ imported: 0 })
    expect(importLegacyHistory(db, join(file, 'missing.json'), null)).toEqual({ imported: 0 })
  })

  it('renames the source file to .bak after importing', () => {
    const { db, file } = setup()
    writeLegacy(file, [{ id: 'legacy-1', createdAt: '2026-01-01T10:00:00.000Z', prompt: 'a', reply: 'b' }])

    importLegacyHistory(db, file, null)

    expect(existsSync(file)).toBe(false)
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8'))).toHaveLength(1)
  })
})
