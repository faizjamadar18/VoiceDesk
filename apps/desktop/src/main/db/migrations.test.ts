import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { MIGRATIONS, runMigrations } from './migrations'

const databases: ReturnType<typeof openDatabase>[] = []

function setup() {
  const db = openDatabase(':memory:')
  databases.push(db)
  return db
}

function tableNames(db: ReturnType<typeof openDatabase>) {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
  return rows.map((row) => String(row.name)).sort()
}

function appliedIds(db: ReturnType<typeof openDatabase>) {
  return db
    .prepare('SELECT id FROM migrations ORDER BY id')
    .all()
    .map((row) => String(row.id))
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

describe('runMigrations', () => {
  it('creates every table on an empty database', () => {
    const db = setup()

    runMigrations(db)

    expect(tableNames(db)).toEqual([
      'migrations',
      'session_insights',
      'sessions',
      'turns'
    ])
    expect(appliedIds(db)).toEqual(MIGRATIONS.map((migration) => migration.id))
  })

  it('is a no-op the second time it runs', () => {
    const db = setup()
    runMigrations(db)
    const before = appliedIds(db)

    expect(() => runMigrations(db)).not.toThrow()
    expect(appliedIds(db)).toEqual(before)
    expect(new Set(before).size).toBe(before.length)
  })

  it('records a migration that fails with a duplicate column as applied', () => {
    const db = setup()

    runMigrations(db, [
      { id: 'probe_create', sql: 'CREATE TABLE probe (value TEXT)' },
      { id: 'probe_duplicate', sql: 'ALTER TABLE probe ADD COLUMN value TEXT' }
    ])

    expect(appliedIds(db)).toEqual(['probe_create', 'probe_duplicate'])
    expect(tableNames(db)).toContain('probe')
  })
})
