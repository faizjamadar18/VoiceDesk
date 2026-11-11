/**
 * Shared types for Kestrel's MCP (Model Context Protocol) client layer.
 *
 * These interfaces mirror the dataclasses in apps/api/app/mcp/types.py, with
 * camelCase fields. Nothing here imports the rest of the app, so tests can use
 * these types without spawning processes or opening sockets.
 */

import type { JsonSchema } from '../types'

/** One configured MCP server, ready to connect to. */
export interface McpServerConfig {
  readonly name: string
  /** `stdio` runs a child process; `http` speaks Streamable HTTP. */
  readonly transport: 'stdio' | 'http'
  readonly command?: string | null
  readonly args: string[]
  readonly env: Record<string, string>
  readonly cwd?: string | null
  readonly url?: string | null
  readonly headers: Record<string, string>
  readonly enabled: boolean
  /** Skip the confirmation gate for this server. */
  readonly autoApprove: boolean
  /** Force every tool the server exposes to be treated as read-only. */
  readonly readOnly: boolean
  /**
   * Tool names that mutate even when the server omits a `readOnlyHint`.
   * Some servers advertise no annotations at all, so without this list they
   * would all default to read-only and writes would run without confirmation.
   */
  readonly writeTools: ReadonlySet<string>
  /**
   * Optional allowlist of tool names to expose. `null` exposes every tool the
   * server advertises.
   */
  readonly tools: string[] | null
}

/** A single tool advertised by an MCP server via `tools/list`. */
export interface McpTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  /** From the tool's `annotations.readOnlyHint`; defaults to read-only. */
  readonly readOnly: boolean
}

/** The flattened result of `tools/call`. */
export interface McpCallResult {
  readonly text: string
  readonly isError: boolean
}

/** A connection attempt's outcome, surfaced through the status endpoint. */
export interface McpServerStatus {
  readonly name: string
  readonly ok: boolean
  readonly toolCount: number
  readonly error?: string | null
}

/** Base class for MCP transport failures. */
export class McpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpError'
  }
}

/** The server could not be started, reached, or spoken to. */
export class McpConnectionError extends McpError {
  constructor(message: string) {
    super(message)
    this.name = 'McpConnectionError'
  }
}

/** A live connection to one MCP server. */
export interface McpClient {
  readonly name: string

  /** Return the tools the server advertises. */
  listTools(): McpTool[] | Promise<McpTool[]>

  /** Invoke one tool and return its flattened result. */
  callTool(
    name: string,
    args: Record<string, unknown>
  ): McpCallResult | Promise<McpCallResult>

  /** Release the process or socket. Safe to call more than once. */
  close(): void | Promise<void>
}
