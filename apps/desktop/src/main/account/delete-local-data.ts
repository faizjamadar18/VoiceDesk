import type { DatabaseSync } from 'node:sqlite'
import { getDatabase } from '../db'

export interface DeletedLocalData {
  /** Hard-deleted session rows. */
  sessions: number
  /** Turns that disappeared with those sessions (ON DELETE CASCADE). */
  turns: number
}

/**
 * Hard-deletes every SQLite row owned by one user.
 *
 * Turns, and any other child rows, follow the sessions through
 * ON DELETE CASCADE. Settings and the auth file are deliberately left alone.
 */
export function deleteLocalData(
  userId: string,
  db: DatabaseSync = getDatabase()
): DeletedLocalData {
  const turns = countUserTurns(db, userId)

  db.prepare('DELETE FROM session_insights WHERE user_id = ?').run(userId)
  const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)

  return { sessions: Number(result.changes), turns }
}

function countUserTurns(db: DatabaseSync, userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM turns
       WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`
    )
    .get(userId)

  const total = row?.total
  return typeof total === 'number' ? total : Number(total ?? 0)
}
