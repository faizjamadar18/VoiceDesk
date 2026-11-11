/**
 * Load Kestrel's MCP server configuration from a JSON file.
 *
 * The file has a single `servers` object keyed by server name:
 *
 *     {
 *       "servers": {
 *         "local": {
 *           "command": "${PYTHON}",
 *           "args": ["-m", "my_mcp_server"],
 *           "env": {"MY_TOKEN": "${MY_TOKEN}"}
 *         },
 *         "docs": {
 *           "transport": "http",
 *           "url": "https://docs.test/mcp",
 *           "headers": {"Authorization": "Bearer ${DOCS_TOKEN}"}
 *         }
 *       }
 *     }
 *
 * Secrets are never written into the file: every string is run through
 * `${VAR}` expansion from the process environment before it reaches a client.
 * The loader is deliberately lenient about the file's top level (a missing or
 * malformed file simply yields no servers) but strict about each individual
 * server, because a half-configured server is a configuration mistake worth
 * surfacing.
 */

import { readFileSync } from 'node:fs'
import type { McpServerConfig } from './types'

const VARIABLE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g
/**
 * `${PYTHON}` and `${PYTHON_EXE}` are kept for compatibility with the Python
 * backend's config files. Python is no longer used at runtime: both variables
 * expand to the interpreter running this process (Electron's binary), so an
 * existing config keeps working without pointing at an installed Python.
 */
const PYTHON_VARIABLES = new Set(['PYTHON', 'PYTHON_EXE'])

/**
 * Return the enabled server configs described by `path`.
 *
 * A missing file, unreadable JSON, or a missing `servers` object yields an
 * empty list. A malformed *entry* throws a `ValueError`-style `Error` naming
 * the offending server.
 */
export function loadServerConfigs(path: string): McpServerConfig[] {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!isRecord(data)) return []

  const servers = data.servers
  if (!isRecord(servers)) return []

  const configs: McpServerConfig[] = []
  for (const [name, entry] of Object.entries(servers)) {
    const config = parseServer(name, entry)
    if (config !== null) configs.push(config)
  }
  return configs
}

function parseServer(name: string, entry: unknown): McpServerConfig | null {
  if (!isRecord(entry)) {
    throw new Error(`MCP server '${name}' must be a JSON object.`)
  }

  if (!truthy(entry.enabled === undefined ? true : entry.enabled)) {
    return null
  }

  const rawCommand = entry.command
  if (rawCommand !== undefined && rawCommand !== null && typeof rawCommand !== 'string') {
    throw new Error(`MCP server '${name}' has a non-string command.`)
  }
  const command = typeof rawCommand === 'string' ? expand(rawCommand) : null

  const rawTransport = entry.transport
  let transport: string
  if (rawTransport === undefined || rawTransport === null) {
    transport = rawCommand !== undefined && rawCommand !== null ? 'stdio' : 'http'
  } else if (typeof rawTransport === 'string') {
    transport = rawTransport
  } else {
    throw new Error(`MCP server '${name}' has a non-string transport.`)
  }
  if (transport !== 'stdio' && transport !== 'http') {
    throw new Error(`MCP server '${name}' has unknown transport '${transport}'.`)
  }

  const args = expandArgs(name, entry.args)
  const env = expandMapping(name, entry.env)
  const headers = expandMapping(name, entry.headers)
  const cwd = expandOptional(name, 'cwd', entry.cwd)
  const url = expandOptional(name, 'url', entry.url)
  const writeTools = parseWriteTools(name, entry.write_tools)
  const tools = parseTools(name, entry.tools)

  if (transport === 'stdio' && !(command ?? '').trim()) {
    throw new Error(`MCP server '${name}' uses stdio but has no command.`)
  }
  if (transport === 'http' && !(url ?? '').trim()) {
    throw new Error(`MCP server '${name}' uses http but has no url.`)
  }

  return {
    name,
    transport,
    command,
    args,
    env,
    cwd,
    url,
    headers,
    enabled: true,
    autoApprove: truthy(entry.auto_approve === undefined ? false : entry.auto_approve),
    readOnly: truthy(entry.read_only === undefined ? false : entry.read_only),
    writeTools,
    tools
  }
}

/** Expand `${VAR}` references in `value` from the environment. */
function expand(value: string): string {
  return value.replace(VARIABLE, (_match, variable: string) => {
    if (PYTHON_VARIABLES.has(variable)) return process.execPath
    return process.env[variable] ?? ''
  })
}

function expandArgs(name: string, raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!isStringArray(raw)) {
    throw new Error(`MCP server '${name}' has invalid args.`)
  }
  return raw.map((item) => expand(item))
}

function expandMapping(name: string, raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new Error(`MCP server '${name}' has an invalid mapping field.`)
  }
  const mapping: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    mapping[key] = expand(pythonString(value))
  }
  return mapping
}

function expandOptional(
  name: string,
  field: string,
  raw: unknown
): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    throw new Error(`MCP server '${name}' has a non-string ${field}.`)
  }
  return expand(raw)
}

/** Read the optional `write_tools` list of mutating tool names. */
function parseWriteTools(name: string, raw: unknown): ReadonlySet<string> {
  if (raw === undefined || raw === null) return new Set()
  if (!isStringArray(raw)) {
    throw new Error(
      `MCP server '${name}' has invalid write_tools (expected a list of strings).`
    )
  }
  return new Set(raw)
}

/** Read the optional `tools` allowlist, or `null` for every tool. */
function parseTools(name: string, raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null
  if (!isStringArray(raw)) {
    throw new Error(
      `MCP server '${name}' has invalid tools (expected a list of strings).`
    )
  }
  return [...raw]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

/** Python truthiness for values that can appear in JSON. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (value === 0 || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/**
 * Python's `str()` for JSON values. The Python loader converts mapping values
 * with `str(value)`, so booleans and null stringify differently than in JS.
 */
function pythonString(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonRepr(item)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, item]) => `'${key}': ${pythonRepr(item)}`
    )
    return `{${entries.join(', ')}}`
  }
  return String(value)
}

function pythonRepr(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`
  return pythonString(value)
}
