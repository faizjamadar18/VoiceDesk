import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { getDatabase } from './index'

export type TurnRole = 'user' | 'assistant' | 'tool'

export interface TurnRecord {
  id: string
  sessionId: string
  sequence: number
  role: TurnRole
  content: string
  toolName: string | null
  createdAt: string
}

export interface NewTurnRecord {
  sessionId: string
  role: TurnRole
  content: string
  toolName?: string | null
  createdAt?: string
}

const SELECT_COLUMNS = 'id, session_id, sequence, role, content, tool_name, created_at'

/** Appends a turn and picks the next sequence number in a transaction. */
export function appendTurn(input: NewTurnRecord, db: DatabaseSync = getDatabase()): TurnRecord {
  const insert = (): TurnRecord => {
    const last = db
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS last FROM turns WHERE session_id = ?')
      .get(input.sessionId)
    const sequence = typeof last?.last === 'number' ? last.last + 1 : 1

    const record: TurnRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      sequence,
      role: input.role,
      content: input.content,
      toolName: input.toolName ?? null,
      createdAt: input.createdAt ?? new Date().toISOString()
    }

    db.prepare(`INSERT INTO turns (${SELECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      record.id,
      record.sessionId,
      record.sequence,
      record.role,
      record.content,
      record.toolName,
      record.createdAt
    )
    return record
  }

  return db.isTransaction ? insert() : inTransaction(db, insert)
}

export function listTurns(sessionId: string, db: DatabaseSync = getDatabase()): TurnRecord[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM turns WHERE session_id = ? ORDER BY sequence ASC`)
    .all(sessionId)
  return rows.map(toTurn)
}

export function deleteTurnsForSession(
  sessionId: string,
  db: DatabaseSync = getDatabase()
): number {
  const result = db.prepare('DELETE FROM turns WHERE session_id = ?').run(sessionId)
  return Number(result.changes)
}

function toTurn(row: Record<string, unknown>): TurnRecord {
  return {
    id: asText(row.id),
    sessionId: asText(row.session_id),
    sequence: typeof row.sequence === 'number' ? row.sequence : 0,
    role: toRole(row.role),
    content: asText(row.content),
    toolName: typeof row.tool_name === 'string' ? row.tool_name : null,
    createdAt: asText(row.created_at)
  }
}

function toRole(value: unknown): TurnRole {
  return value === 'assistant' || value === 'tool' ? value : 'user'
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
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
