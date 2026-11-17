import type { DatabaseSync } from 'node:sqlite'
import type { InsightsPayload } from '../../shared/types'
import { getDatabase } from '../db'
import { listSessionsForInsights } from '../db/sessions.repo'
import { aggregateInsights, type InsightSession } from './aggregate'

/**
 * Aggregated Insights for one signed-in user (or the local, signed-out one).
 *
 * The repository already drops soft-deleted sessions and rows with an empty
 * prompt, so nothing else is filtered here.
 */
export function getInsightsForUser(
  userId: string | null,
  db: DatabaseSync = getDatabase()
): InsightsPayload {
  const rows = listSessionsForInsights(userId, db)
  const userTurns = countUserTurnsBySession(db)
  const sessions: InsightSession[] = rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    appName: row.appName,
    createdAt: row.createdAt,
    durationSeconds: row.durationSeconds,
    wordCount: row.wordCount,
    prompt: row.prompt,
    reply: row.reply,
    userTurnCount: userTurns[row.id] ?? 0
  }))

  return aggregateInsights(sessions, new Date())
}

/** User-turn totals for every session in one query, keyed by session id. */
function countUserTurnsBySession(db: DatabaseSync): Record<string, number> {
  const rows = db
    .prepare("SELECT session_id, COUNT(*) AS count FROM turns WHERE role = 'user' GROUP BY session_id")
    .all()

  const counts: Record<string, number> = {}
  for (const row of rows) {
    const sessionId = row.session_id
    const count = row.count
    if (typeof sessionId !== 'string') continue
    counts[sessionId] = typeof count === 'number' ? count : Number(count ?? 0)
  }
  return counts
}
