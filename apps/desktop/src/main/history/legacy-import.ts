import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { insertSession, type SessionMode } from '../db/sessions.repo'
import { appendTurn } from '../db/turns.repo'
import { countWords } from '../insights/aggregate'

interface LegacyRecord {
  id: string | null
  createdAt: string | null
  prompt: string
  reply: string
  tool: string | null
  mode: SessionMode
  appName: string | null
  appIcon: string | null
  durationSeconds: number | null
  language: string | null
}

/**
 * Moves the old JSON history into SQLite exactly once. Records keep their id
 * and timestamp, and the file is renamed to `.bak` so it is never read again.
 */
export function importLegacyHistory(
  db: DatabaseSync,
  filePath: string,
  userId: string | null
): { imported: number } {
  if (hasSessions(db)) return { imported: 0 }

  const records = readLegacyRecords(filePath)
  if (records === null) return { imported: 0 }

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const record of records) {
      insertLegacyRecord(db, record, userId)
    }
    db.exec('COMMIT')
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }

  archive(filePath)
  return { imported: records.length }
}

function hasSessions(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS total FROM sessions').get()
  return Number(row?.total ?? 0) > 0
}

/** The parsed records, or null when the file is missing or unreadable. */
function readLegacyRecords(filePath: string): LegacyRecord[] | null {
  try {
    if (!existsSync(filePath)) return null
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!Array.isArray(parsed)) return null
    return parsed.map(toLegacyRecord).filter((record): record is LegacyRecord => record !== null)
  } catch (error) {
    console.warn(`[history] could not import ${filePath}:`, error)
    return null
  }
}

function insertLegacyRecord(
  db: DatabaseSync,
  record: LegacyRecord,
  userId: string | null
): void {
  const id = record.id ?? randomUUID()
  const createdAt = record.createdAt ?? new Date().toISOString()

  insertSession(
    {
      id,
      userId,
      mode: record.mode,
      appName: record.appName,
      appIcon: record.appIcon,
      prompt: record.prompt,
      reply: record.reply,
      tool: record.tool,
      durationSeconds: record.durationSeconds,
      wordCount: countWords(record.prompt),
      language: record.language,
      createdAt,
      updatedAt: createdAt
    },
    db
  )

  appendTurn({ sessionId: id, role: 'user', content: record.prompt, createdAt }, db)
  if (record.reply.trim() !== '') {
    appendTurn({ sessionId: id, role: 'assistant', content: record.reply, createdAt }, db)
  }
}

/** Keeps the old file as a backup; a failure here must not undo the import. */
function archive(filePath: string): void {
  try {
    renameSync(filePath, `${filePath}.bak`)
  } catch (error) {
    console.warn(`[history] could not archive ${filePath}:`, error)
  }
}

function toLegacyRecord(value: unknown): LegacyRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.prompt !== 'string' || typeof candidate.reply !== 'string') return null

  return {
    id: typeof candidate.id === 'string' ? candidate.id : null,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null,
    prompt: candidate.prompt,
    reply: candidate.reply,
    tool: typeof candidate.tool === 'string' ? candidate.tool : null,
    mode: candidate.mode === 'dictate' ? 'dictate' : 'agent',
    appName: typeof candidate.appName === 'string' ? candidate.appName : null,
    appIcon: typeof candidate.appIcon === 'string' ? candidate.appIcon : null,
    durationSeconds: typeof candidate.durationSeconds === 'number' ? candidate.durationSeconds : null,
    language: typeof candidate.language === 'string' ? candidate.language : null
  }
}
