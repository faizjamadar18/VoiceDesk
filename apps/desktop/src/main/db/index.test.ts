import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  getDatabase,
  initializeDatabase,
  resetDatabaseForTests
} from './index'

let directory: string | null = null

function databaseFile(): string {
  directory = mkdtempSync(join(tmpdir(), 'kestrel-db-'))
  return join(directory, 'kestrel.db')
}

beforeEach(() => {
  resetDatabaseForTests()
})

afterEach(() => {
  resetDatabaseForTests()
  if (directory !== null) rmSync(directory, { recursive: true, force: true })
  directory = null
})

describe('database lifecycle', () => {
  it('throws a clear error before initialisation', () => {
    expect(() => getDatabase()).toThrow(/initializeDatabase/)
  })

  it('initialises a file database with the schema applied', () => {
    initializeDatabase({ filePath: databaseFile() })
    const db = getDatabase()

    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => String(row.name))

    expect(names).toContain('sessions')
    expect(names).toContain('turns')
    expect(names).toContain('session_insights')
    expect(getDatabase()).toBe(db)
  })

  it('closes safely twice and reopens the same file', () => {
    const filePath = databaseFile()
    initializeDatabase({ filePath })
    closeDatabase()

    expect(() => closeDatabase()).not.toThrow()
    expect(() => getDatabase()).toThrow(/initializeDatabase/)

    initializeDatabase({ filePath })
    const total = getDatabase().prepare('SELECT COUNT(*) AS total FROM sessions').get()?.total
    expect(total).toBe(0)
  })
})
