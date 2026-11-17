import type { DatabaseSync } from 'node:sqlite'
import { V1_SCHEMA } from './schema'

export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: readonly Migration[] = [{ id: '001_initial', sql: V1_SCHEMA }]

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)
`

/** Applies every migration that is not recorded yet, one transaction each. */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS
): void {
  db.exec(MIGRATIONS_TABLE)
  const applied = new Set(
    db.prepare('SELECT id FROM migrations').all().map((row) => String(row.id))
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    try {
      applyMigration(db, migration)
    } catch (error) {
      if (!isDuplicateColumn(error)) throw error
      // A partially applied migration is rolled back but still counts as done.
      recordMigration(db, migration.id)
    }
  }
}

function applyMigration(db: DatabaseSync, migration: Migration): void {
  runInTransaction(db, () => {
    db.exec(migration.sql)
    insertMigrationId(db, migration.id)
  })
}

function recordMigration(db: DatabaseSync, id: string): void {
  runInTransaction(db, () => insertMigrationId(db, id))
}

function runInTransaction(db: DatabaseSync, work: () => void): void {
  db.exec('BEGIN')
  try {
    work()
    db.exec('COMMIT')
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

function insertMigrationId(db: DatabaseSync, id: string): void {
  db.prepare('INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?, ?)').run(
    id,
    new Date().toISOString()
  )
}

function isDuplicateColumn(error: unknown): boolean {
  return error instanceof Error && error.message.includes('duplicate column name')
}
