import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Opens a local database with the pragmas the app relies on. */
export function openDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })

  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}
