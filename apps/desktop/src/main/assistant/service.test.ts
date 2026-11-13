/**
 * Tests for AssistantService's Composio integration surface.
 *
 * The Composio integration is faked as a structurally-typed object cast to the
 * real type, so these tests never import Electron or the Composio SDK; they
 * never touch the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryRecord, NewHistoryRecord } from '../../shared/types'
import type { HistoryStore } from '../history/store'
import type { ComposioIntegration } from './composio/integration'
import type { ComposioStatus } from './composio/types'
import { ToolRegistry } from './registry'
import { AssistantService, emptyIntegrationsStatus } from './service'
import type { Planner, Tool } from './types'
import type { VisionClient } from './vision'

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

/** A read-only tool that reports a spoken message, so a turn is recorded. */
function makeSpokenTool(name: string, message: string): Tool {
  return {
    spec: {
      name,
      description: `${name} tool`,
      parameters: { type: 'object', properties: {}, required: [] },
      risk: 'read',
      requiresConfirmation: false
    },
    run: () => ({ status: 'ok', action: name, message })
  }
}

/** Only the four public methods the service calls on a `HistoryStore`. */
class FakeHistory {
  private readonly saved: HistoryRecord[] = []
  private nextId = 1

  record(entry: NewHistoryRecord, now: Date = new Date()): HistoryRecord {
    const record: HistoryRecord = {
      id: `record-${this.nextId}`,
      createdAt: now.toISOString(),
      prompt: entry.prompt,
      reply: entry.reply,
      tool: entry.tool ?? null
    }
    this.nextId += 1
    this.saved.push(record)
    return record
  }

  list(): HistoryRecord[] {
    return [...this.saved]
  }

  delete(id: string): boolean {
    const index = this.saved.findIndex((record) => record.id === id)
    if (index === -1) return false
    this.saved.splice(index, 1)
    return true
  }

  count(): number {
    return this.saved.length
  }

  entries(): HistoryRecord[] {
    return [...this.saved]
  }
}

class FakeVision implements VisionClient {
  constructor(private readonly answerText = 'The file could not be found.') {}

  async answer(): Promise<string> {
    return this.answerText
  }
}

// A minimal, well-formed PNG header: detectImageType only reads the magic bytes.
const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]).toString('base64')

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
    toolGroups(): Array<{ provider: string; tools: string[] }> {
      const groups = new Map<string, string[]>()
      for (const tool of state.tools) {
        const provider = tool.spec.name.split('_')[0]
        const tools = groups.get(provider) ?? []
        tools.push(tool.spec.name)
        groups.set(provider, tools)
      }
      return [...groups].map(([provider, tools]) => ({ provider, tools }))
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

  it('narrows integration tools with retrieval while keeping the app present', async () => {
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
    const calendar = selected.filter((name) =>
      name.startsWith('googlecalendar_')
    )
    // Retrieval narrows the app's tools, and the group floor keeps one present.
    expect(calendar).toHaveLength(1)
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

describe('AssistantService history', () => {
  const answerPlanner: Planner = {
    plan: async () => ({ kind: 'answer', message: 'It is noon.' })
  }

  function serviceWith(
    planner: Planner,
    history: FakeHistory,
    onHistoryRecorded?: (record: HistoryRecord) => void
  ): AssistantService {
    return new AssistantService({
      registry: new ToolRegistry(),
      planner,
      history: history as unknown as HistoryStore,
      onHistoryRecorded
    })
  }

  it('records a finished turn with the transcript and spoken reply', async () => {
    const history = new FakeHistory()
    const service = serviceWith(answerPlanner, history)

    await service.act('what time is it')

    expect(history.entries()).toHaveLength(1)
    expect(history.entries()[0]?.prompt).toBe('what time is it')
    expect(history.entries()[0]?.reply).toBe('It is noon.')
  })

  it('records a plain answer with a null tool', async () => {
    const history = new FakeHistory()
    const service = serviceWith(answerPlanner, history)

    await service.act('what time is it')

    expect(history.entries()[0]?.tool).toBeNull()
  })

  it('records an unhandled turn with a null tool', async () => {
    const history = new FakeHistory()
    const service = serviceWith(
      { plan: async () => ({ kind: 'none', message: 'No idea.' }) },
      history
    )

    await service.act('do a backflip')

    expect(history.entries()[0]).toMatchObject({
      prompt: 'do a backflip',
      reply: 'No idea.',
      tool: null
    })
  })

  it('records the action label for a tool turn', async () => {
    const history = new FakeHistory()
    const registry = new ToolRegistry()
    registry.register(makeSpokenTool('current_time', "It's 12:00."))
    const service = new AssistantService({
      registry,
      planner: plannerFor('current_time'),
      history: history as unknown as HistoryStore
    })

    await service.act('what time is it')

    expect(history.entries()[0]).toMatchObject({
      prompt: 'what time is it',
      reply: "It's 12:00.",
      tool: 'current_time'
    })
  })

  it('records a screen question and answer with the screen tool', async () => {
    const history = new FakeHistory()
    const service = new AssistantService({
      registry: new ToolRegistry(),
      history: history as unknown as HistoryStore,
      visionClient: new FakeVision()
    })

    await service.askScreen({
      question: 'what error is this?',
      imageBase64: PNG_BASE64,
      marked: false
    })

    expect(history.entries()).toEqual([
      expect.objectContaining({
        prompt: 'what error is this?',
        reply: 'The file could not be found.',
        tool: 'look_at_screen'
      })
    ])
  })

  it('notifies the host with the saved record', async () => {
    const history = new FakeHistory()
    const recorded: HistoryRecord[] = []
    const service = serviceWith(answerPlanner, history, (record) =>
      recorded.push(record)
    )

    await service.act('what time is it')

    expect(recorded).toEqual(history.entries())
    expect(recorded[0]).toBe(history.entries()[0])
  })

  it('does not record a turn without a reply', async () => {
    const history = new FakeHistory()
    const service = serviceWith(
      { plan: async () => ({ kind: 'screen', question: 'what is this?' }) },
      history
    )

    const response = await service.act('what is this?')

    expect(response.action).toBe('look_at_screen')
    expect(history.entries()).toEqual([])
  })

  it('does not record when the vision call throws', async () => {
    const history = new FakeHistory()
    const service = new AssistantService({
      registry: new ToolRegistry(),
      history: history as unknown as HistoryStore,
      visionClient: {
        answer: async () => {
          throw new Error('vision exploded')
        }
      }
    })

    await expect(
      service.askScreen({
        question: 'what is this?',
        imageBase64: PNG_BASE64,
        marked: false
      })
    ).rejects.toThrow()
    expect(history.entries()).toEqual([])
  })
})
