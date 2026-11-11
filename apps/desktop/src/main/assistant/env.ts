/**
 * Minimal `.env` loader for the assistant's main process.
 *
 * Ported from the behavior of Python's `python-dotenv` `load_dotenv`: read
 * `KEY=VALUE` lines, tolerate comments and blank lines, strip an optional
 * `export ` prefix, honour quoted values, and never overwrite a variable that
 * is already set in `process.env` (dotenv's `override=False` default).
 *
 * This exists because the desktop's main process does not use Vite's env
 * loading: without it, keys such as `GROQ_API_KEY` would have to be exported
 * by hand instead of living in `apps/desktop/.env.local` as they did in
 * `apps/api/.env`.
 */

import { existsSync, readFileSync } from 'node:fs'

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function parseValue(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  // Unquoted values drop a trailing inline comment (` # comment`).
  const comment = value.search(/\s#/)
  return (comment >= 0 ? value.slice(0, comment) : value).trim()
}

/** Load one `.env` file into `process.env`, without overriding existing keys. */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return

  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed
    const separator = withoutExport.indexOf('=')
    if (separator < 0) continue

    const key = withoutExport.slice(0, separator).trim()
    if (!KEY_RE.test(key)) continue
    if (process.env[key] !== undefined) continue

    process.env[key] = parseValue(withoutExport.slice(separator + 1))
  }
}

/**
 * Load several files in order. Earlier files win, so pass the most specific
 * file first (`apps/desktop/.env.local`, then `apps/desktop/.env`).
 */
export function loadEnvFiles(paths: readonly string[]): void {
  for (const path of paths) {
    loadEnvFile(path)
  }
}
