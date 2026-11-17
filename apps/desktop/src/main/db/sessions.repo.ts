import type { DatabaseSync } from 'node:sqlite'
import { getDatabase } from './index'

export type SessionMode = 'dictate' | 'agent'

export interface SessionRecord {
  id: string
  userId: string | null
  mode: SessionMode
  appName: string | null
  appIcon: string | null
  prompt: string
  reply: string
  tool: string | null
  durationSeconds: number | null
  wordCount: number
  language: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface NewSessionRecord {
  id: string
  userId?: string | null
  mode?: SessionMode
  appName?: string | null
  appIcon?: string | null
  prompt?: string
  reply?: string
  tool?: string | null
  durationSeconds?: number | null
  wordCount?: number
  language?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export type UpdateSessionPatch = Partial<Omit<SessionRecord, 'id'>>

export interface ListSessionsOptions {
  userId?: string | null
  limit?: number
}

const DEFAULT_LIMIT = 50

const SELECT_COLUMNS = `
  id, user_id, mode, app_name, app_icon, prompt, reply, tool,
  duration_seconds, word_count, language, created_at, updated_at, deleted_at
`

export function insertSession(
  record: NewSessionRecord,
  db: DatabaseSync = getDatabase()
): SessionRecord {
  const saved: SessionRecord = {
    id: record.id,
    userId: record.userId ?? null,
    mode: record.mode ?? 'dictate',
    appName: record.appName ?? null,
    appIcon: record.appIcon ?? null,
    prompt: record.prompt ?? '',
    reply: record.reply ?? '',
    tool: record.tool ?? null,
    durationSeconds: record.durationSeconds ?? null,
    wordCount: record.wordCount ?? 0,
    language: record.language ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? null
  }

  db.prepare(
    `INSERT INTO sessions (
      id, user_id, mode, app_name, app_icon, prompt, reply, tool,
      duration_seconds, word_count, language, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    saved.id,
    saved.userId,
    saved.mode,
    saved.appName,
    saved.appIcon,
    saved.prompt,
    saved.reply,
    saved.tool,
    saved.durationSeconds,
    saved.wordCount,
    saved.language,
    saved.createdAt,
    saved.updatedAt,
    saved.deletedAt
  )

  return saved
}

export function getSession(id: string, db: DatabaseSync = getDatabase()): SessionRecord | null {
  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM sessions WHERE id = ?`).get(id)
  return row === undefined ? null : toSession(row)
}

/** Newest first, soft-deleted rows excluded. A missing userId means local mode. */
export function listSessions(
  options: ListSessionsOptions = {},
  db: DatabaseSync = getDatabase()
): SessionRecord[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM sessions
       WHERE deleted_at IS NULL AND user_id IS ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`
    )
    .all(options.userId ?? null, options.limit ?? DEFAULT_LIMIT)
  return rows.map(toSession)
}

export function countSessions(
  userId: string | null = null,
  db: DatabaseSync = getDatabase()
): number {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM sessions WHERE deleted_at IS NULL AND user_id IS ?')
    .get(userId)
  const total = row?.total
  return typeof total === 'number' ? total : Number(total ?? 0)
}

export function listSessionsForInsights(
  userId: string | null = null,
  db: DatabaseSync = getDatabase()
): SessionRecord[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM sessions
       WHERE deleted_at IS NULL AND TRIM(prompt) <> '' AND user_id IS ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(userId)
  return rows.map(toSession)
}

/** Marks a session deleted; true when a live row changed. */
export function softDeleteSession(id: string, db: DatabaseSync = getDatabase()): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      'UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .run(now, now, id)
  return Number(result.changes) > 0
}

export function updateSession(
  id: string,
  patch: UpdateSessionPatch,
  db: DatabaseSync = getDatabase()
): SessionRecord | null {
  const assignments: string[] = []
  const values: (string | number | null)[] = []

  const add = (column: string, value: string | number | null | undefined): void => {
    if (value === undefined) return
    assignments.push(`${column} = ?`)
    values.push(value)
  }

  add('user_id', patch.userId)
  add('mode', patch.mode)
  add('app_name', patch.appName)
  add('app_icon', patch.appIcon)
  add('prompt', patch.prompt)
  add('reply', patch.reply)
  add('tool', patch.tool)
  add('duration_seconds', patch.durationSeconds)
  add('word_count', patch.wordCount)
  add('language', patch.language)
  add('created_at', patch.createdAt)
  add('updated_at', patch.updatedAt ?? new Date().toISOString())
  add('deleted_at', patch.deletedAt)

  if (assignments.length === 0) return getSession(id, db)

  values.push(id)
  const result = db
    .prepare(`UPDATE sessions SET ${assignments.join(', ')} WHERE id = ?`)
    .run(...values)
  if (Number(result.changes) === 0) return null
  return getSession(id, db)
}

function toSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: asText(row.id),
    userId: asNullableText(row.user_id),
    mode: row.mode === 'agent' ? 'agent' : 'dictate',
    appName: asNullableText(row.app_name),
    appIcon: asNullableText(row.app_icon),
    prompt: asText(row.prompt),
    reply: asText(row.reply),
    tool: asNullableText(row.tool),
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    wordCount: typeof row.word_count === 'number' ? row.word_count : 0,
    language: asNullableText(row.language),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
    deletedAt: asNullableText(row.deleted_at)
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
