/**
 * Resolve the stable Composio `user_id` for this install.
 *
 * Composio identifies every connection by a stable `user_id`, so an unstable
 * or wrong value orphans the user's connected accounts. Following Composio's
 * guidance (never an email address, never a value that can change), Kestrel
 * generates an identifier once, persists it, and reuses it forever.
 *
 * The id lives in its own file: it is not a secret like the API key, and it
 * has a different lifetime from Kestrel's settings. Reading is best-effort and
 * never throws, so a missing or corrupt file simply yields a fresh id.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const COMPOSIO_USER_ID_ENV = 'KESTREL_COMPOSIO_USER_ID'

const FILE_VERSION = 1

/** Shape of the on-disk file. */
interface StoredUserId {
  version: number
  userId: string
}

/** Read the persisted Composio user id, creating it once on first use. */
export function loadOrCreateUserId(filePath: string): string {
  const fromEnv = nonEmpty(process.env[COMPOSIO_USER_ID_ENV])
  if (fromEnv !== null) return fromEnv

  const stored = readStored(filePath)
  if (stored !== null) return stored

  const userId = randomUUID()
  save(filePath, userId)
  return userId
}

/**
 * The stored id, or `null` when the file is missing, unreadable, or the wrong
 * shape. A corrupt file never throws: it is treated as absent so the caller
 * generates and rewrites a fresh id.
 */
function readStored(filePath: string): string | null {
  if (!existsSync(filePath)) return null

  try {
    const data: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!isRecord(data)) return null
    return nonEmpty(data.userId)
  } catch (error) {
    console.warn(
      `[composio] ignoring unreadable user id file at ${filePath}:`,
      error
    )
    return null
  }
}

/** Persist the id, warning rather than throwing when the write fails. */
function save(filePath: string, userId: string): void {
  const record: StoredUserId = { version: FILE_VERSION, userId }
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  } catch (error) {
    console.warn(
      '[composio] could not save the Composio user id, so the user may need ' +
        'to reconnect their apps next launch:',
      error
    )
  }
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
