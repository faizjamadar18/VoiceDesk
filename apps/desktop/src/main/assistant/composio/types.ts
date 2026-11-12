/**
 * Shared types for Kestrel's Composio integration layer.
 *
 * Composio hosts an MCP endpoint per session and brokers OAuth for the
 * providers inside it. Everything below is provider-agnostic: Google Calendar
 * is simply the first entry in `COMPOSIO_PROVIDERS`. Nothing here imports the
 * rest of the app, so tests can use these types without a network or Electron.
 */

export type ComposioProviderId = 'googlecalendar' | 'gmail' | 'googlesuper' | 'notion'

/** One provider Kestrel can drive through Composio. */
export interface ComposioProviderSpec {
  readonly id: ComposioProviderId
  readonly label: string
  /** Composio toolkit slug, e.g. 'googlecalendar'. */
  readonly toolkit: string
  /** The Composio tool slugs the session is allowed to expose. */
  readonly tools: readonly string[]
  /** One line shown in the UI when the provider is not connected. */
  readonly connectHint: string
}

/** A created Composio session with its hosted MCP endpoint. */
export interface ComposioSession {
  readonly sessionId: string
  readonly mcpUrl: string
  readonly mcpHeaders: Record<string, string>
}

export interface ComposioProviderStatus {
  readonly id: ComposioProviderId
  readonly label: string
  readonly connected: boolean
  /** Number of Kestrel tools registered from this provider. */
  readonly toolCount: number
  readonly error: string | null
}

export interface ComposioStatus {
  readonly hasKey: boolean
  readonly keySource: 'stored' | 'env' | null
  readonly sessionId: string | null
  readonly providers: ComposioProviderStatus[]
  readonly error: string | null
}
