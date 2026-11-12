import type { HistoryRecord } from '../../shared/types'
import type { ChatTurn } from '../assistant/types'

/** How many finished turns are replayed to the model as prior conversation. */
export const RECENT_TURN_LIMIT = 5

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Human age label for a timestamp, e.g. "3 minutes ago". */
export function formatAge(createdAt: string, now: Date): string {
  const created = new Date(createdAt)
  const createdMs = created.getTime()
  if (Number.isNaN(createdMs)) {
    return 'just now'
  }

  const elapsed = now.getTime() - createdMs
  if (elapsed < 0) {
    return 'just now'
  }

  if (elapsed < MINUTE_MS) {
    return 'just now'
  }

  const minutes = Math.floor(elapsed / MINUTE_MS)
  if (elapsed < HOUR_MS) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }

  const hours = Math.floor(elapsed / HOUR_MS)
  if (elapsed < DAY_MS) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (elapsed < 2 * DAY_MS) {
    return 'yesterday'
  }

  const days = Math.floor(elapsed / DAY_MS)
  if (days < 7) {
    return `${days} days ago`
  }

  return created.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/** The newest `limit` usable saved turns, oldest first, as replayable chat turns. */
export function buildRecentContext(
  records: HistoryRecord[],
  now: Date,
  limit: number = RECENT_TURN_LIMIT
): ChatTurn[] {
  if (limit <= 0) {
    return []
  }

  const chronological = [...records]
    .filter((record) => record.prompt.trim() && record.reply.trim())
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
    )
  const recent = chronological.slice(-limit)

  const turns: ChatTurn[] = []
  for (const record of recent) {
    turns.push({
      role: 'user',
      content: `[${formatAge(record.createdAt, now)}] ${record.prompt}`
    })
    turns.push({ role: 'assistant', content: record.reply })
  }
  return turns
}
