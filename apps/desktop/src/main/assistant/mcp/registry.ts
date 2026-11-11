/**
 * Expose connected MCP servers as ordinary Kestrel tools.
 *
 * Each tool a server advertises becomes an `McpToolAdapter`, which implements
 * the `Tool` contract: it presents a `ToolSpec` for the planner and runs the
 * tool through the live `McpClient`. `McpManager` owns the clients: it
 * connects every configured server, collects their tools, reports per-server
 * status, and tears the connections down.
 */

import type { Tool, ToolContext, ToolOutcome, ToolSpec } from '../types'
import { makeClient as defaultMakeClient } from './client'
import { normalizeParameters } from './schema'
import type {
  McpClient,
  McpServerConfig,
  McpServerStatus,
  McpTool
} from './types'

const NON_ALNUM = /[^a-z0-9]+/g
const MESSAGE_LIMIT = 4000
const SPOKEN_LIMIT = 400

/** Turn a server id into a readable label, e.g. `google_drive`. */
export function humanize(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0)
  if (words.length === 0) return name
  return words
    .map((word) => {
      const lower = word.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/** Turn a tool's raw text into one short, human-readable line. */
export function formatToolResult(text: string): string {
  const stripped = text.trim()
  if (!stripped) return 'Done.'
  if (!stripped.startsWith('{') && !stripped.startsWith('[')) return text

  let data: unknown
  try {
    data = JSON.parse(stripped)
  } catch {
    return text
  }

  if (Array.isArray(data)) return summarizeItems(data)
  if (isRecord(data)) {
    const results = data.results
    if (Array.isArray(results)) return summarizeItems(results)
    for (const key of ['title', 'name', 'message', 'url']) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) return value
    }
    return 'Done.'
  }
  return pythonString(data)
}

function summarizeItems(items: readonly unknown[]): string {
  if (items.length === 0) return 'No results found.'
  return `Found ${items.length} result(s).`
}

/** Reduce `name` to `[a-z0-9_]` for use inside a tool identifier. */
export function sanitize(name: string): string {
  return name.toLowerCase().replace(NON_ALNUM, '_').replace(/^_+|_+$/g, '')
}

/** Return a provider-safe object schema for an MCP tool. */
function normalizedSchema(
  schema: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return normalizeParameters(schema)
}

/** Collapse whitespace and cut `text` to `limit` characters. */
function truncate(text: string, limit: number): string {
  const collapsed = text.trim().split(/\s+/).filter(Boolean).join(' ')
  if (collapsed.length <= limit) return collapsed
  return collapsed.slice(0, limit).trimEnd() + '...'
}

/** A single MCP tool presented as a Kestrel `Tool`. */
export class McpToolAdapter implements Tool {
  readonly spec: ToolSpec
  private readonly server: McpServerConfig
  private readonly tool: McpTool
  private readonly client: McpClient

  constructor(server: McpServerConfig, tool: McpTool, client: McpClient) {
    this.server = server
    this.tool = tool
    this.client = client

    let risk: string
    if (server.readOnly) {
      risk = 'read'
    } else if (!tool.readOnly || server.writeTools.has(tool.name)) {
      risk = 'write'
    } else {
      risk = 'read'
    }

    this.spec = {
      name: `${sanitize(server.name)}_${sanitize(tool.name)}`,
      description: tool.description || tool.name,
      parameters: normalizedSchema(tool.inputSchema),
      risk,
      requiresConfirmation: risk === 'write' && !server.autoApprove,
      actionLabel: humanize(server.name)
    }
  }

  async run(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolOutcome> {
    const action = this.spec.actionLabel ?? humanize(this.server.name)
    if (ctx.dryRun) {
      return {
        status: 'ok',
        action,
        message: `Would run ${this.tool.name}.`
      }
    }

    let result
    try {
      result = await this.client.callTool(this.tool.name, { ...args })
    } catch (error) {
      return {
        status: 'error',
        action,
        message:
          `${humanize(this.server.name)} couldn't run ${this.tool.name}: ` +
          `${errorMessage(error)}`
      }
    }

    const text = truncate(result.text, MESSAGE_LIMIT)
    if (result.isError) {
      return { status: 'error', action, message: text }
    }

    const summary = formatToolResult(result.text)
    return {
      status: 'ok',
      action,
      message: truncate(summary, MESSAGE_LIMIT),
      spokenResponse: truncate(summary, SPOKEN_LIMIT)
    }
  }
}

export type McpClientFactory = (config: McpServerConfig) => McpClient

/** Connect to every configured MCP server and expose their tools. */
export class McpManager {
  private readonly configs: McpServerConfig[]
  private readonly clientFactory: McpClientFactory | undefined
  private clients: McpClient[] = []
  private adapters: Tool[] = []
  private statusList: McpServerStatus[] = []

  constructor(
    configs: readonly McpServerConfig[],
    clientFactory?: McpClientFactory
  ) {
    this.configs = [...configs]
    this.clientFactory = clientFactory
  }

  /** Every tool exposed by the servers that connected successfully. */
  get tools(): Tool[] {
    return [...this.adapters]
  }

  /** The outcome of each server's last connection attempt. */
  get statuses(): McpServerStatus[] {
    return [...this.statusList]
  }

  /** Connect every config, recording a status and never raising. */
  async connect(): Promise<McpServerStatus[]> {
    this.adapters = []
    this.statusList = []
    for (const config of this.configs) {
      this.statusList.push(await this.connectOne(config))
    }
    return [...this.statusList]
  }

  /** Close every connected client, swallowing errors. Idempotent. */
  async close(): Promise<void> {
    const clients = this.clients
    this.clients = []
    for (const client of clients) {
      try {
        await client.close()
      } catch {
        // Close must not raise.
      }
    }
  }

  private async connectOne(
    config: McpServerConfig
  ): Promise<McpServerStatus> {
    let client: McpClient
    try {
      client = (this.clientFactory ?? defaultMakeClient)(config)
    } catch (error) {
      return failedStatus(config, error)
    }

    // Track the client before listing tools, so a half-open process is still
    // torn down by `close` even if `listTools` fails.
    this.clients.push(client)
    let tools: McpTool[]
    try {
      tools = await client.listTools()
    } catch (error) {
      return failedStatus(config, error)
    }

    const selected = tools.filter(
      (tool) => config.tools === null || config.tools.includes(tool.name)
    )
    for (const tool of selected) {
      this.adapters.push(new McpToolAdapter(config, tool, client))
    }
    return { name: config.name, ok: true, toolCount: selected.length }
  }
}

function failedStatus(
  config: McpServerConfig,
  error: unknown
): McpServerStatus {
  return {
    name: config.name,
    ok: false,
    toolCount: 0,
    error: errorMessage(error)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Python's `str()` for JSON values. */
function pythonString(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}
