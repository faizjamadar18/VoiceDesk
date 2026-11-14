/**
 * Provider-neutral helpers shared by every Composio provider.
 *
 * Composio result parsing, spoken-safe error shaping, schema helpers, the
 * tool invoker, and dry-run handling all live here, so adding a provider
 * (Gmail, Drive, ...) never duplicates that plumbing.
 */

import type { JsonSchema, ToolContext, ToolOutcome, ToolSpec } from '../types'

export const MESSAGE_LIMIT = 4000
export const SPOKEN_LIMIT = 400

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  return null
}

export function optionalString(
  args: Record<string, unknown>,
  key: string
): string | null {
  return stringOf(args[key])
}

export function optionalInteger(
  args: Record<string, unknown>,
  key: string
): number | null {
  const value = args[key]
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Collapse whitespace and cut `text` to `limit` characters. */
export function truncate(text: string, limit: number): string {
  const collapsed = text.trim().split(/\s+/).filter(Boolean).join(' ')
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, limit).trimEnd() + '...'
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** `Sam`, `Sam and Alex`, or `Sam, Alex and Kim`. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// --- pure parsing helpers (exported for tests) -------------------------

export function tryParse(
  text: string
): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    // Fall through to the embedded-JSON recovery below.
  }

  let start = -1
  for (const char of ['{', '[']) {
    const index = trimmed.indexOf(char)
    if (index !== -1 && (start === -1 || index < start)) start = index
  }
  let end = -1
  for (const char of ['}', ']']) {
    const index = trimmed.lastIndexOf(char)
    if (index > end) end = index
  }
  if (start === -1 || end <= start) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) }
  } catch {
    return { ok: false }
  }
}

export function errorText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw.trim()
  if (Array.isArray(raw)) return raw.length === 0 ? null : JSON.stringify(raw)
  if (isRecord(raw)) {
    return Object.keys(raw).length === 0 ? null : JSON.stringify(raw)
  }
  return String(raw)
}

export function interpretResult(
  value: unknown
): { ok: boolean; data: unknown; error: string | null } {
  if (!isRecord(value)) return { ok: true, data: value, error: null }
  const error = errorText(value['error'])
  if (value['successful'] === false || error !== null) {
    return { ok: false, data: value, error: error ?? 'Composio reported an error.' }
  }
  if (Object.hasOwn(value, 'data')) {
    const inner = value['data']
    if (typeof inner === 'string') {
      const nested = tryParse(inner)
      return { ok: true, data: nested.ok ? nested.value : inner, error: null }
    }
    return { ok: true, data: inner, error: null }
  }
  return { ok: true, data: value, error: null }
}

export function parseComposioResult(text: string): {
  ok: boolean
  data: unknown
  error: string | null
} {
  const parsed = tryParse(text)
  if (!parsed.ok) return { ok: true, data: text, error: null }
  return interpretResult(parsed.value)
}

export const ERROR_LINE_LIMIT = 240

/** Pulls the most specific human message out of a possibly nested error body. */
function messageFromValue(value: unknown, depth = 0): string | null {
  if (!isRecord(value) || depth > 4) return null

  const direct = stringOf(value['message'])
  if (direct !== null) {
    // Composio sometimes nests a JSON document inside `message`.
    return messageFromText(direct) ?? direct
  }

  const data = value['data']
  if (isRecord(data)) {
    const nested = messageFromValue(data, depth + 1)
    if (nested !== null) return nested
  }

  const error = value['error']
  if (typeof error === 'string') {
    return messageFromText(error) ?? stringOf(error)
  }
  if (isRecord(error)) return messageFromValue(error, depth + 1)
  return null
}

/** Parses a string that may itself contain a JSON error document. */
function messageFromText(text: string): string | null {
  const parsed = tryParse(text)
  if (!parsed.ok) return null
  return messageFromValue(parsed.value)
}

/**
 * Turns whatever Composio sent into one short line safe to speak.
 * Never shows the raw JSON body when it carries a message.
 */
export function readableError(
  text: string,
  fallback = 'The app returned an error.'
): string {
  const trimmed = text.trim()
  if (trimmed === '') return fallback

  const parsed = tryParse(trimmed)
  const message = parsed.ok ? messageFromValue(parsed.value) : null

  const firstLine = (message ?? trimmed).split('\n')[0].trim()
  const line = firstLine === '' ? fallback : firstLine
  return line.length <= ERROR_LINE_LIMIT
    ? line
    : line.slice(0, ERROR_LINE_LIMIT).trimEnd() + '…'
}

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[]
): JsonSchema {
  return { type: 'object', properties, required }
}

export function specFor(
  name: string,
  description: string,
  parameters: JsonSchema,
  risk: string,
  requiresConfirmation: boolean,
  actionLabel: string
): ToolSpec {
  return { name, description, parameters, risk, requiresConfirmation, actionLabel }
}

export type InvokeResult =
  | { ok: true; data: unknown }
  | { ok: false; outcome: ToolOutcome }

/** Calls one Composio tool by its exact slug over MCP. */
export type CallTool = (
  slug: string,
  args: Record<string, unknown>
) => Promise<{ text: string; isError: boolean }>

export type Invoke = (
  slug: string,
  args: Record<string, unknown>,
  action: string
) => Promise<InvokeResult>

/**
 * Builds the shared tool invoker: call Composio, then normalise its result
 * into either data or a spoken-safe error outcome. `fallback` is the last
 * resort error line when the provider said nothing readable, and `label` is
 * the provider name spoken when the call itself threw.
 */
export function createInvoker(
  callTool: CallTool,
  fallback = 'The app returned an error.',
  label = 'The app'
): Invoke {
  return async function invoke(
    slug: string,
    args: Record<string, unknown>,
    action: string
  ): Promise<InvokeResult> {
    let result: { text: string; isError: boolean }
    try {
      result = await callTool(slug, args)
    } catch (error) {
      return {
        ok: false,
        outcome: {
          status: 'error',
          action,
          message: `${label} couldn't run ${slug}: ${errorMessage(error)}`
        }
      }
    }
    if (result.isError) {
      return {
        ok: false,
        outcome: {
          status: 'error',
          action,
          message: readableError(result.text, fallback)
        }
      }
    }
    const parsed = parseComposioResult(result.text)
    if (!parsed.ok) {
      return {
        ok: false,
        outcome: {
          status: 'error',
          action,
          message: readableError(parsed.error ?? result.text, fallback)
        }
      }
    }
    return { ok: true, data: parsed.data }
  }
}

export function dryRun(
  ctx: ToolContext,
  action: string,
  name: string
): ToolOutcome | null {
  if (!ctx.dryRun) return null
  return { status: 'ok', action, message: `Would run ${name}.` }
}
