import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'

export { openDatabase } from './connection'
export { MIGRATIONS, runMigrations, type Migration } from './migrations'
export { V1_SCHEMA } from './schema'

let database: DatabaseSync | null = null

/** Opens the app database once and brings its schema up to date. */
export function initializeDatabase(options: { filePath: string }): void {
  if (database !== null) return
  database = openDatabase(options.filePath)
  runMigrations(database)
}

export function getDatabase(): DatabaseSync {
  if (database === null) {
    throw new Error('[db] database is not initialised — call initializeDatabase() first')
  }
  return database
}

/** Closes the connection. Safe to call when nothing is open. */
export function closeDatabase(): void {
  if (database === null) return
  const open = database
  database = null
  try {
    open.close()
  } catch (error) {
    console.warn('[db] failed to close the database:', error)
  }
}

export function resetDatabaseForTests(): void {
  closeDatabase()
}
