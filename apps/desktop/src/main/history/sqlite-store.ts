import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { HistoryRecord, NewHistoryRecord } from '../../shared/types'
import {
  countSessions,
  insertSession,
  listSessions,
  softDeleteSession,
  type SessionRecord
} from '../db/sessions.repo'
import { appendTurn } from '../db/turns.repo'
import { countWords } from '../insights/aggregate'

/** The most finished turns shown in the UI. Older rows stay for insights. */
export const MAX_HISTORY_RECORDS = 500

/**
 * Local history of finished voice turns, backed by SQLite. The public surface
 * matches the old JSON-file store so the assistant service is unaware.
 */
export class SqliteHistoryStore {
  private readonly db: DatabaseSync
  private readonly getUserId: () => string | null

  constructor(db: DatabaseSync, getUserId: () => string | null) {
    this.db = db
    this.getUserId = getUserId
  }

  /** Saves one turn and returns the stored record. */
  record(entry: NewHistoryRecord, now: Date = new Date()): HistoryRecord {
    const createdAt = now.toISOString()
    const write = (): HistoryRecord => {
      const saved = insertSession(
        {
          id: randomUUID(),
          userId: this.getUserId(),
          mode: entry.mode ?? 'dictate',
          appName: entry.appName ?? null,
          appIcon: entry.appIcon ?? null,
          prompt: entry.prompt,
          reply: entry.reply,
          tool: entry.tool ?? null,
          durationSeconds: entry.durationSeconds ?? null,
          wordCount: countWords(entry.prompt),
          language: entry.language ?? null,
          createdAt,
          updatedAt: createdAt
        },
        this.db
      )
      appendTurn({ sessionId: saved.id, role: 'user', content: saved.prompt, createdAt }, this.db)
      if (saved.reply.trim() !== '') {
        appendTurn(
          { sessionId: saved.id, role: 'assistant', content: saved.reply, createdAt },
          this.db
        )
      }
      return toHistoryRecord(saved)
    }

    return inTransaction(this.db, write)
  }

  /** The newest turns for this user, newest first, capped for display. */
  list(): HistoryRecord[] {
    return listSessions({ userId: this.getUserId(), limit: MAX_HISTORY_RECORDS }, this.db).map(
      toHistoryRecord
    )
  }

  count(): number {
    return countSessions(this.getUserId(), this.db)
  }

  /** Soft-deletes one turn by id; true when a live row was hidden. */
  delete(id: string): boolean {
    return softDeleteSession(id, this.db)
  }

  /** Gives history saved before login to that user; returns rows claimed. */
  adoptOrphanSessions(userId: string): number {
    const now = new Date().toISOString()
    const result = this.db
      .prepare('UPDATE sessions SET user_id = ?, updated_at = ? WHERE user_id IS NULL')
      .run(userId, now)
    return Number(result.changes)
  }
}

function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

function toHistoryRecord(row: SessionRecord): HistoryRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    prompt: row.prompt,
    reply: row.reply,
    tool: row.tool,
    mode: row.mode,
    appName: row.appName,
    appIcon: row.appIcon,
    durationSeconds: row.durationSeconds,
    language: row.language
  }
}
