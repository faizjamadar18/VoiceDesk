/**
 * Tests for AssistantService's Composio integration surface.
 *
 * The Composio integration is faked as a structurally-typed object cast to the
 * real type, so these tests never import Electron or the Composio SDK; they
 * never touch the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposioIntegration } from './composio/integration'
import type { ComposioStatus } from './composio/types'
import { ToolRegistry } from './registry'
import { AssistantService, emptyIntegrationsStatus } from './service'
import type { Planner, Tool } from './types'

function makeTool(name: string): Tool {
  return {
    spec: {
      name,
      description: `${name} tool`,
      parameters: { type: 'object', properties: {}, required: [] },
      risk: 'read',
      requiresConfirmation: false
    },
    run: () => ({ status: 'ok', action: name, message: '' })
  }
}

const CAL_CREATE = makeTool('googlecalendar_create_event')
const CAL_LIST = makeTool('googlecalendar_list_events')

/** A planner that always calls one tool with no arguments. */
function plannerFor(name: string): Planner {
  return {
    plan: async () => ({ kind: 'tool', call: { name, arguments: {} } })
  }
}

/** A confirmation-required write tool whose `prepare` optionally returns a card. */
function makeWriteTool(
  name: string,
  prepare: Tool['prepare']
): Tool {
  return {
    spec: {
      name,
      description: `${name} tool`,
      parameters: { type: 'object', properties: {}, required: [] },
      risk: 'write',
      requiresConfirmation: true,
      actionLabel: name
    },
    run: () => ({ status: 'ok', action: name, message: 'Done.' }),
    prepare
  }
}

function statusFor(tools: readonly Tool[]): ComposioStatus {
  return {
    hasKey: true,
    keySource: 'stored',
    sessionId: 'session-1',
    providers: [
      {
        id: 'googlecalendar',
        label: 'Google Calendar',
        connected: tools.length > 0,
        toolCount: tools.length,
        error: null
      }
    ],
    error: null
  }
}

interface FakeState {
  tools: Tool[]
  setKeyTools: Tool[] | null
  refreshError: unknown
  refreshCalls: number
  keys: string[]
}

/** A scripted integration whose network seams are all replaced by state. */
function makeFakeIntegration(initialTools: Tool[] = []) {
  const state: FakeState = {
    tools: [...initialTools],
    setKeyTools: null,
    refreshError: undefined,
    refreshCalls: 0,
    keys: []
  }

  const fake = {
    get tools(): Tool[] {
      return [...state.tools]
    },
    status(): ComposioStatus {
      return statusFor(state.tools)
    },
    async refresh(): Promise<ComposioStatus> {
      state.refreshCalls += 1
      if (state.refreshError !== undefined) {
        throw state.refreshError
      }
      return statusFor(state.tools)
    },
    async setKey(key: string): Promise<ComposioStatus> {
      state.keys.push(key)
      if (state.setKeyTools !== null) {
        state.tools = [...state.setKeyTools]
      }
      return statusFor(state.tools)
    },
    async clearKey(): Promise<ComposioStatus> {
      state.tools = []
      return statusFor(state.tools)
    },
    async connect() {
      return { ok: true, url: 'https://example.test/connect', message: 'go' }
    },
    async waitForConnection(): Promise<boolean> {
      return true
    },
    async close(): Promise<void> {}
  }

  return {
    integration: fake as unknown as ComposioIntegration,
    state
  }
}

function toolNames(registry: ToolRegistry): string[] {
  return registry.specs().map((spec) => spec.name)
}

beforeEach(() => {
  // Tests 1-6 assume no Groq key, so the rule-only planner is used.
  vi.stubEnv('KESTREL_GROQ_API_KEY', '')
  vi.stubEnv('GROQ_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AssistantService integrations', () => {
  it('reports the empty status with no integration', async () => {
    const service = new AssistantService({ registry: new ToolRegistry() })

    expect(service.integrationsStatus()).toEqual(emptyIntegrationsStatus())
    await expect(service.refreshIntegrations()).resolves.toEqual(
      emptyIntegrationsStatus()
    )
  })

  it('registers the integration tools on refresh', async () => {
    const registry = new ToolRegistry()
    const { integration } = makeFakeIntegration([CAL_CREATE, CAL_LIST])
    const service = new AssistantService({ registry, integrations: integration })

    const status = await service.refreshIntegrations()

    expect(toolNames(registry)).toContain('googlecalendar_create_event')
    expect(toolNames(registry)).toContain('googlecalendar_list_events')
    expect(status.providers[0]?.toolCount).toBe(2)
  })

  it('removes a tool the integration no longer reports', async () => {
    const registry = new ToolRegistry()
    const { integration, state } = makeFakeIntegration([CAL_CREATE, CAL_LIST])
    const service = new AssistantService({ registry, integrations: integration })

    await service.refreshIntegrations()
    state.tools = [CAL_CREATE]
    await service.refreshIntegrations()

    expect(toolNames(registry)).toContain('googlecalendar_create_event')
    expect(toolNames(registry)).not.toContain('googlecalendar_list_events')
  })

  it('forwards a new key and re-registers whatever it reports', async () => {
    const registry = new ToolRegistry()
    const { integration, state } = makeFakeIntegration()
    state.setKeyTools = [CAL_LIST]
    const service = new AssistantService({ registry, integrations: integration })

    const status = await service.setIntegrationsKey('secret-key')

    expect(state.keys).toEqual(['secret-key'])
    expect(toolNames(registry)).toContain('googlecalendar_list_events')
    expect(status.providers[0]?.toolCount).toBe(1)
  })

  it('dedupes two concurrent refreshes into one integration call', async () => {
    const registry = new ToolRegistry()
    const { integration, state } = makeFakeIntegration([CAL_CREATE])
    const service = new AssistantService({ registry, integrations: integration })

    await Promise.all([
      service.refreshIntegrations(),
      service.refreshIntegrations()
    ])

    expect(state.refreshCalls).toBe(1)
  })

  it('resolves rather than rejecting when the integration refresh throws', async () => {
    const registry = new ToolRegistry()
    const { integration, state } = makeFakeIntegration([CAL_CREATE])
    state.refreshError = new Error('composio is down')
    const service = new AssistantService({ registry, integrations: integration })

    await expect(service.refreshIntegrations()).resolves.toEqual(
      service.integrationsStatus()
    )
  })

  it('pins integration tool names so retrieval never filters them out', async () => {
    vi.stubEnv('KESTREL_GROQ_API_KEY', 'test-key')
    vi.stubEnv('KESTREL_TOOL_TOP_K', '1')
    const registry = new ToolRegistry()
    const { integration } = makeFakeIntegration([CAL_CREATE, CAL_LIST])
    const service = new AssistantService({ registry, integrations: integration })

    await service.refreshIntegrations()

    const selector = service.activeToolSelector
    if (selector === null) {
      throw new Error('tool retrieval was not active')
    }
    const selected = selector
      .select('hello there', registry.specs())
      .map((spec) => spec.name)
    expect(selected).toContain('googlecalendar_create_event')
    expect(selected).toContain('googlecalendar_list_events')
  })
})

describe('AssistantService confirmation cards', () => {
  it('carries a card from prepare into the pending response', async () => {
    const registry = new ToolRegistry()
    const card = { kind: 'email_compose', mode: 'send' }
    registry.register(makeWriteTool('gmail_send_email', () => ({ arguments: {}, card })))
    const service = new AssistantService({
      registry,
      planner: plannerFor('gmail_send_email')
    })

    const response = await service.act('send it')

    expect(response.status).toBe('pending')
    expect(response.card).toEqual(card)
  })

  it('leaves the pending card null when prepare returns none', async () => {
    const registry = new ToolRegistry()
    registry.register(
      makeWriteTool('gmail_create_draft', () => ({ arguments: {} }))
    )
    const service = new AssistantService({
      registry,
      planner: plannerFor('gmail_create_draft')
    })

    const response = await service.act('draft it')

    expect(response.status).toBe('pending')
    expect(response.card).toBeNull()
  })
})
