/**
 * Windows Search adapter for local file lookups.
 *
 * Queries the Windows Search ``SYSTEMINDEX`` through ADODB (the same
 * ``Search.CollatorDSO`` provider File Explorer uses). The Windows index is the
 * production search source; ``files.ts`` remains a bounded direct-scan fallback
 * for tests and explicit file roots.
 *
 * Only file name and path metadata is read. No file contents leave the machine.
 */

import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100
export const COMMAND_TIMEOUT_SECONDS = 5
export const OVERFETCH_FACTOR = 10
export const MIN_OVERFETCH = 50
export const MAX_OVERFETCH = 250

export const CONNECTION_STRING =
  "Provider=Search.CollatorDSO;Extended Properties='Application=Windows';"

// Paths that are system-owned or heavy app clutter. Matching is
// case-insensitive and requires the surrounding backslashes, so a user folder
// called "Windows Notes" is not excluded.
export const EXCLUDED_PATH_FRAGMENTS: readonly string[] = [
  '\\windows\\',
  '\\program files\\',
  '\\program files (x86)\\',
  '\\programdata\\',
  '\\appdata\\',
  '\\node_modules\\',
  '\\$recycle.bin\\',
  '\\system volume information\\'
]

// Voice text is untrusted: keep only token characters. The query builder adds
// its own quotes/wildcards after sanitising.
const DISALLOWED_TOKEN_CHARS = /[^\p{L}\p{N}_.-]+/gu
const MAX_TOKEN_LENGTH = 64

export class WindowsSearchUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WindowsSearchUnavailable'
  }
}

export interface SearchRow {
  name: unknown
  path: unknown
  size: unknown
  modified: unknown
}

export interface SearchTransport {
  fetch(sql: string, timeout: number): Promise<readonly SearchRow[]> | readonly SearchRow[]
}

export function sanitizeQuery(query: string): string[] {
  const tokens: string[] = []
  for (const raw of query.split(/\s+/)) {
    const cleaned = raw
      .replace(DISALLOWED_TOKEN_CHARS, '')
      .replace(/^[.-]+/, '')
      .replace(/[.-]+$/, '')
    if (cleaned) {
      tokens.push(cleaned.slice(0, MAX_TOKEN_LENGTH))
    }
  }
  return tokens
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildSearchSql(tokens: readonly string[], fetchLimit: number): string {
  const conditions: string[] = []
  for (const token of tokens) {
    const pattern = sqlLiteral(`"${token}*"`)
    conditions.push(
      `(CONTAINS("System.FileName", ${pattern}) OR ` +
        `CONTAINS("System.ItemPathDisplay", ${pattern}))`
    )
  }

  // Avoid letting node_modules swamp the over-fetch window. The remaining
  // exclusions are enforced in TypeScript against the fully-qualified path.
  conditions.push('NOT CONTAINS("System.ItemPathDisplay", \'"node_modules"\')')
  const where = conditions.join(' AND ')
  return (
    `SELECT TOP ${Math.trunc(fetchLimit)} "System.ItemNameDisplay", ` +
    '"System.ItemPathDisplay", "System.Size", "System.DateModified" ' +
    `FROM "SYSTEMINDEX" WHERE ${where} ` +
    'ORDER BY "System.DateModified" DESC'
  )
}

const ADODB_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$sql = [Console]::In.ReadToEnd()
$timeout = 5
if ($env:KESTREL_SEARCH_TIMEOUT) { $timeout = [int]$env:KESTREL_SEARCH_TIMEOUT }
$connection = New-Object -ComObject ADODB.Connection
$recordset = $null
try {
  $connection.ConnectionTimeout = $timeout
  $connection.CommandTimeout = $timeout
  $connection.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
  $recordset = $connection.Execute($sql)
  $rows = @()
  while (-not $recordset.EOF) {
    $modified = $recordset.Fields.Item(3).Value
    if ($modified -is [datetime]) { $modified = $modified.ToString('o') }
    $rows += [pscustomobject]@{
      name = $recordset.Fields.Item(0).Value
      path = $recordset.Fields.Item(1).Value
      size = $recordset.Fields.Item(2).Value
      modified = $modified
    }
    $recordset.MoveNext()
  }
  ConvertTo-Json -InputObject @($rows) -Compress -Depth 3
} finally {
  if ($recordset) { try { $recordset.Close() } catch {} }
  try { $connection.Close() } catch {}
}
`.trim()

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (systemRoot) {
    return path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  }
  return 'powershell.exe'
}

function unavailable(): WindowsSearchUnavailable {
  return new WindowsSearchUnavailable(
    'Windows Search is not available on this PC.'
  )
}

export class AdodbSearchTransport implements SearchTransport {
  fetch(sql: string, timeout: number): Promise<SearchRow[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        powershellPath(),
        ['-NoProfile', '-NonInteractive', '-Command', ADODB_SCRIPT],
        {
          windowsHide: true,
          env: {
            ...process.env,
            KESTREL_SEARCH_TIMEOUT: String(timeout)
          }
        }
      )

      const stdout: Buffer[] = []
      let finished = false
      const finish = (error: WindowsSearchUnavailable | null): void => {
        if (finished) {
          return
        }
        finished = true
        clearTimeout(timer)
        if (error !== null) {
          reject(error)
        }
      }

      const timer = setTimeout(() => {
        if (finished) {
          return
        }
        finished = true
        child.kill()
        reject(unavailable())
      }, Math.max(timeout, 1) * 1000 + 1000)

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout.push(chunk)
      })
      child.stderr?.on('data', () => {
        // Ignore stderr: a non-zero exit is reported below.
      })
      child.once('error', () => {
        finish(unavailable())
      })
      child.once('close', (code) => {
        if (finished) {
          return
        }
        finished = true
        clearTimeout(timer)
        if (code !== 0) {
          reject(unavailable())
          return
        }

        const payload = Buffer.concat(stdout).toString('utf8').trim()
        if (!payload) {
          resolve([])
          return
        }
        let data: unknown
        try {
          data = JSON.parse(payload)
        } catch {
          reject(unavailable())
          return
        }
        if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
          data = [data]
        }
        if (!Array.isArray(data)) {
          reject(unavailable())
          return
        }

        const rows: SearchRow[] = []
        for (const item of data) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            continue
          }
          const record = item as Record<string, unknown>
          rows.push({
            name: record['name'],
            path: record['path'],
            size: record['size'],
            modified: record['modified']
          })
        }
        resolve(rows)
      })

      child.stdin?.end(sql, 'utf8')
    })
  }
}

function fetchLimit(limit: number): number {
  return Math.min(
    Math.max(limit * OVERFETCH_FACTOR, MIN_OVERFETCH),
    MAX_OVERFETCH
  )
}

function normalizePathText(value: string): string {
  return process.platform === 'win32' ? value.replace(/\//g, '\\') : value
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isExcluded(pathText: string): boolean {
  const normalized = pathText.replace(/\//g, '\\').toLowerCase()
  return EXCLUDED_PATH_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function displayName(name: unknown, target: string): string {
  const text = name !== null && name !== undefined ? String(name).trim() : ''
  return text || path.basename(target)
}

async function sizeBytes(size: unknown, target: string): Promise<number | null> {
  if (size !== null && size !== undefined) {
    if (typeof size === 'number' && Number.isFinite(size)) {
      return Math.trunc(size)
    }
    if (typeof size === 'string' && /^\s*[+-]?\d+\s*$/.test(size)) {
      return Number.parseInt(size.trim(), 10)
    }
    if (typeof size === 'boolean') {
      return size ? 1 : 0
    }
  }
  try {
    return (await stat(target)).size
  } catch {
    return null
  }
}

function isoUtc(date: Date): string {
  const iso = date.toISOString()
  const withoutZ = iso.endsWith('Z') ? iso.slice(0, -1) : iso
  const trimmed = withoutZ.endsWith('.000')
    ? withoutZ.slice(0, -4)
    : withoutZ
  return `${trimmed}+00:00`
}

async function modifiedText(value: unknown, target: string): Promise<string | null> {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      return isoUtc(value)
    }
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (text) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text
      }
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) {
        const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
        const parsed = new Date(text.replace(/Z$/i, '+00:00'))
        if (!Number.isNaN(parsed.getTime())) {
          return hasZone ? isoUtc(parsed) : text
        }
      }
    }
  }
  try {
    return isoUtc((await stat(target)).mtime)
  } catch {
    return null
  }
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile()
  } catch {
    return false
  }
}

export class WindowsSearchProvider {
  private readonly transport: SearchTransport
  private readonly commandTimeout: number

  constructor(
    transport?: SearchTransport,
    commandTimeout: number = COMMAND_TIMEOUT_SECONDS
  ) {
    this.transport = transport ?? new AdodbSearchTransport()
    this.commandTimeout = commandTimeout
  }

  async search(
    query: string,
    limit: number = DEFAULT_LIMIT
  ): Promise<Array<Record<string, unknown>>> {
    const tokens = sanitizeQuery(query)
    if (tokens.length === 0) {
      return []
    }

    const numeric = Number(limit)
    let effectiveLimit = Number.isFinite(numeric)
      ? Math.trunc(numeric)
      : DEFAULT_LIMIT
    if (effectiveLimit <= 0) {
      return []
    }
    effectiveLimit = Math.min(effectiveLimit, MAX_LIMIT)

    const sql = buildSearchSql(tokens, fetchLimit(effectiveLimit))
    let rows: readonly SearchRow[]
    try {
      rows = await this.transport.fetch(sql, this.commandTimeout)
    } catch (error) {
      if (error instanceof WindowsSearchUnavailable) {
        throw error
      }
      throw unavailable()
    }

    const results: Array<Record<string, unknown>> = []
    const seen = new Set<string>()
    for (const row of rows) {
      const rawPath = row.path ? String(row.path).trim() : ''
      if (!rawPath || isExcluded(rawPath)) {
        continue
      }

      let resolved: string
      try {
        if (!(await isFile(rawPath))) {
          continue
        }
        resolved = path.resolve(rawPath)
      } catch {
        continue
      }
      const key = pathKey(resolved)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)

      const target = normalizePathText(rawPath)
      results.push({
        name: displayName(row.name, target),
        path: target,
        sizeBytes: await sizeBytes(row.size, target),
        modified: await modifiedText(row.modified, target)
      })
      if (results.length >= effectiveLimit) {
        break
      }
    }
    return results
  }
}
