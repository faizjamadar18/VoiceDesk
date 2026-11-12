import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HistoryRecord, NewHistoryRecord } from '../../shared/types'

/** The most finished turns kept on disk; older turns are dropped first. */
export const MAX_HISTORY_RECORDS = 500

/**
 * Local, on-disk history of finished voice turns. Text only. Readable by a
 * human, so the file is one pretty-printed JSON array.
 */
export class HistoryStore {
  private readonly filePath: string
  /** Newest first. Loaded from disk once, then kept in sync on every write. */
  private records: HistoryRecord[] | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  /** Appends one turn and returns the saved record. */
  record(entry: NewHistoryRecord, now: Date = new Date()): HistoryRecord {
    const saved: HistoryRecord = {
      id: randomUUID(),
      createdAt: now.toISOString(),
      prompt: entry.prompt,
      reply: entry.reply,
      tool: entry.tool ?? null
    }

    const next = [saved, ...this.read()].slice(0, MAX_HISTORY_RECORDS)
    this.records = next
    this.write(next)
    return saved
  }

  /** All saved turns, newest first. */
  list(): HistoryRecord[] {
    return this.read().map((record) => ({ ...record }))
  }

  /** Removes one turn by id; true when a record was removed. */
  delete(id: string): boolean {
    const current = this.read()
    const remaining = current.filter((record) => record.id !== id)
    if (remaining.length === current.length) return false

    this.records = remaining
    this.write(remaining)
    return true
  }

  count(): number {
    return this.read().length
  }

  private read(): HistoryRecord[] {
    if (this.records === null) this.records = this.readFromDisk()
    return this.records
  }

  /** Reads the file tolerantly, newest first. Never throws. */
  private readFromDisk(): HistoryRecord[] {
    try {
      if (!existsSync(this.filePath)) return []
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) return []

      return parsed
        .filter(isHistoryRecord)
        .map((record) => ({ ...record, tool: typeof record.tool === 'string' ? record.tool : null }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    } catch (error) {
      console.warn(`[history] could not read ${this.filePath}:`, error)
      return []
    }
  }

  /** Writes atomically through a temp file. Never throws. */
  private write(records: HistoryRecord[]): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
      renameSync(temporaryPath, this.filePath)
    } catch (error) {
      console.error(`[history] failed to write ${this.filePath}:`, error)
    }
  }
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.prompt === 'string' &&
    typeof candidate.reply === 'string'
  )
}
