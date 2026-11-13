import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FallbackPlanner,
  GroqPlanner,
  LOOK_AT_SCREEN_SPEC,
  RulePlanner
} from './planner'
import { ToolRegistry } from './registry'
import type {
  ChatTurn,
  Directive,
  LlmClient,
  LlmReply,
  Planner,
  Tool,
  ToolCall,
  ToolSelector,
  ToolSpec
} from './types'

const FIXED_NOW = new Date(2026, 10, 7, 9, 41, 12)

class FakeLlmClient implements LlmClient {
  calls: ToolCall[]
  content: string | null
  seen: {
    transcript: string
    specs: ToolSpec[]
    history: ChatTurn[] | undefined
  } | null = null

  constructor(calls: ToolCall[], content: string | null = null) {
    this.calls = calls
    this.content = content
  }

  async choose(
    transcript: string,
    specs: ToolSpec[],
    history?: ChatTurn[]
  ): Promise<LlmReply> {
    this.seen = { transcript, specs, history }
    return { calls: this.calls, content: this.content }
  }
}

class FakeSelector implements ToolSelector {
  private readonly keep: Set<string>

  constructor(keep: Set<string>) {
    this.keep = keep
  }

  select(_transcript: string, specs: ToolSpec[]): ToolSpec[] {
    return specs.filter((spec) => this.keep.has(spec.name))
  }
}

class BoomPlanner implements Planner {
  async plan(_transcript: string): Promise<Directive> {
    throw new Error('planner exploded')
  }
}

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

function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  for (const name of [
    'open_app',
    'web_search',
    'type_text',
    'current_time',
    'current_date',
    'search_files',
    'create_folder',
    'create_file',
    'delete_file',
    'get_weather'
  ]) {
    registry.register(makeTool(name))
  }
  return registry
}

function planWith(planner: Planner, transcript: string): Promise<Directive> {
  return planner.plan(transcript)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RulePlanner', () => {
  it('maps open app', async () => {
    const planner = new RulePlanner(() => FIXED_NOW)

    const directive = await planWith(planner, 'open notepad')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'notepad' } }
    })
  })

  it('maps any app name', async () => {
    const planner = new RulePlanner(() => FIXED_NOW)

    const directive = await planWith(planner, 'open notion')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'notion' } }
    })
  })

  it('maps a browser query', async () => {
    const planner = new RulePlanner()

    const directive = await planWith(
      planner,
      'search the web for kestrel voice agent'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'web_search', arguments: { query: 'kestrel voice agent' } }
    })
  })

  it.each([
    ['find my files named 2025 tax returns', '2025 tax returns'],
    ['search my files for budget', 'budget'],
    ['show me files called invoice', 'invoice'],
    ['find files named report', 'report'],
    ['search files for meeting notes', 'meeting notes']
  ])('maps the file search phrase %s', async (transcript, query) => {
    const planner = new RulePlanner()

    const directive = await planWith(planner, transcript)

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'search_files', arguments: { query } }
    })
  })

  it('keeps web search for web phrases', async () => {
    const planner = new RulePlanner()

    const directive = await planWith(planner, 'search the web for tax returns')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'web_search', arguments: { query: 'tax returns' } }
    })
  })

  it('maps typing', async () => {
    const planner = new RulePlanner()

    const directive = await planWith(planner, 'type Hello from Kestrel')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'type_text', arguments: { text: 'Hello from Kestrel' } }
    })
  })

  it('maps time to an answer', async () => {
    const planner = new RulePlanner(() => FIXED_NOW)

    const directive = await planWith(planner, 'what time is it')

    expect(directive).toEqual({ kind: 'answer', message: "It's 09:41." })
  })

  it('maps date to an answer', async () => {
    const planner = new RulePlanner(() => FIXED_NOW)

    const directive = await planWith(planner, "what's the date today")

    expect(directive).toEqual({
      kind: 'answer',
      message: 'Today is 2026-11-07.'
    })
  })

  it('maps unknown input to an unhandled directive', async () => {
    const planner = new RulePlanner()

    const directive = await planWith(planner, 'make me a sandwich')

    expect(directive.kind).toBe('none')
    if (directive.kind === 'none') {
      expect(directive.message).toBeTruthy()
    }
  })

  it('maps create folder', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'create a folder called Invoices'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'create_folder', arguments: { name: 'Invoices' } }
    })
  })

  it('maps create folder with a location', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'make a folder named Tax Returns in my Documents'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: {
        name: 'create_folder',
        arguments: { name: 'Tax Returns', location: 'my Documents' }
      }
    })
  })

  it('maps create file', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'create a file called notes on my desktop'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: {
        name: 'create_file',
        arguments: { name: 'notes', location: 'my desktop' }
      }
    })
  })

  it('maps delete file', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'delete the file report.pdf'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'delete_file', arguments: { query: 'report.pdf' } }
    })
  })

  it('maps a file search before the generic action rules', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'search my files for budget'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'search_files', arguments: { query: 'budget' } }
    })
  })

  it('maps weather with a location', async () => {
    const directive = await planWith(
      new RulePlanner(() => FIXED_NOW),
      "What's the weather in India today?"
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'get_weather', arguments: { location: 'India' } }
    })
  })

  it('maps weather without a location to Current Location', async () => {
    const directive = await planWith(new RulePlanner(), "what's the weather")

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'get_weather', arguments: { location: 'Current Location' } }
    })
  })

  it('cleans quotes and trailing punctuation from create names', async () => {
    const directive = await planWith(
      new RulePlanner(),
      'create a folder called "Invoices".'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'create_folder', arguments: { name: 'Invoices' } }
    })
  })
})

describe('GroqPlanner', () => {
  it('returns the first known tool', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([
      { name: 'open_app', arguments: { app: 'calculator' } }
    ])

    const directive = await planWith(
      new GroqPlanner(registry, client),
      'open calc'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'calculator' } }
    })
    expect(client.seen).not.toBeNull()
    expect(client.seen?.transcript).toBe('open calc')
    expect(new Set(client.seen?.specs.map((spec) => spec.name))).toEqual(
      new Set([...registry.specs().map((spec) => spec.name), 'look_at_screen'])
    )
    expect(registry.get('look_at_screen')).toBeUndefined()
  })

  it('applies the selector to registry specs', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([
      { name: 'open_app', arguments: { app: 'calculator' } }
    ])
    const selector = new FakeSelector(new Set(['open_app', 'web_search']))

    const directive = await planWith(
      new GroqPlanner(registry, client, selector),
      'open calc'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'calculator' } }
    })
    expect(client.seen?.specs.map((spec) => spec.name)).toEqual([
      'open_app',
      'web_search',
      'look_at_screen'
    ])
  })

  it('passes the injected recent context as the third choose argument', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([
      { name: 'open_app', arguments: { app: 'calculator' } }
    ])
    const history: ChatTurn[] = [
      { role: 'user', content: '[3 minutes ago] open calc' },
      { role: 'assistant', content: 'Opening Calculator.' }
    ]
    const planner = new GroqPlanner(registry, client, undefined, () => [
      ...history
    ])

    await planWith(planner, 'open calc')

    expect(client.seen?.history).toEqual(history)
  })

  it('passes an empty history when no recent context is injected', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([
      { name: 'open_app', arguments: { app: 'calculator' } }
    ])

    await planWith(new GroqPlanner(registry, client), 'open calc')

    expect(client.seen?.history).toEqual([])
  })

  it('offers a planner-only screen tool description', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([])

    await planWith(new GroqPlanner(registry, client), 'what is this?')

    const screenSpec = client.seen?.specs.find(
      (spec) => spec.name === 'look_at_screen'
    )
    expect(screenSpec).toBeDefined()
    expect(screenSpec?.description.toLowerCase()).toContain('screen')
    expect(screenSpec?.description.toLowerCase()).toContain('error')
    expect(screenSpec?.description.toLowerCase()).toContain('general knowledge')
    expect(screenSpec?.description.length).toBeLessThanOrEqual(200)
    expect(screenSpec?.parameters).toEqual({
      type: 'object',
      properties: {},
      required: []
    })
  })

  it('maps look_at_screen to a screen directive', async () => {
    const registry = buildRegistry()
    const transcript = 'what is this error?'
    const client = new FakeLlmClient([
      { name: 'look_at_screen', arguments: {} }
    ])

    const directive = await planWith(
      new GroqPlanner(registry, client),
      transcript
    )

    expect(directive).toEqual({ kind: 'screen', question: transcript })
  })

  it('ignores unknown tool names', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([
      { name: 'delete_everything', arguments: {} },
      { name: 'web_search', arguments: { query: 'kestrel' } }
    ])

    const directive = await planWith(
      new GroqPlanner(registry, client),
      'search kestrel'
    )

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'web_search', arguments: { query: 'kestrel' } }
    })
  })

  it('is unhandled when only unknown tools are returned', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([{ name: 'nope', arguments: {} }])

    const directive = await planWith(
      new GroqPlanner(registry, client),
      'do a backflip'
    )

    expect(directive.kind).toBe('none')
  })

  it('returns model text as an answer', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([], 'Which page do you mean?')

    const directive = await planWith(
      new GroqPlanner(registry, client),
      'open the page'
    )

    expect(directive).toEqual({
      kind: 'answer',
      message: 'Which page do you mean?'
    })
  })

  it('is unhandled with no calls and no content', async () => {
    const registry = buildRegistry()
    const client = new FakeLlmClient([], null)

    const directive = await planWith(
      new GroqPlanner(registry, client),
      'do a backflip'
    )

    expect(directive).toEqual({
      kind: 'none',
      message: "I didn't catch a command I can run yet."
    })
  })

  it('uses the first actionable call in order', async () => {
    const registry = buildRegistry()
    const firstKnown = new FakeLlmClient([
      { name: 'open_app', arguments: { app: 'calc' } },
      { name: 'look_at_screen', arguments: {} }
    ])
    const firstScreen = new FakeLlmClient([
      { name: 'look_at_screen', arguments: {} },
      { name: 'open_app', arguments: { app: 'calc' } }
    ])

    const known = await planWith(
      new GroqPlanner(registry, firstKnown),
      'open calc'
    )
    const screen = await planWith(
      new GroqPlanner(registry, firstScreen),
      'open calc'
    )

    expect(known).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'calc' } }
    })
    expect(screen).toEqual({ kind: 'screen', question: 'open calc' })
  })

  it('exposes the screen spec parameters', () => {
    expect(LOOK_AT_SCREEN_SPEC.requiresConfirmation).toBe(false)
  })
})

describe('FallbackPlanner', () => {
  it('uses the fallback when the primary raises', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const planner = new FallbackPlanner(
      new BoomPlanner(),
      new RulePlanner(() => FIXED_NOW)
    )

    const directive = await planWith(planner, 'open notepad')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'notepad' } }
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(
      'Primary planner failed (Error: planner exploded); falling back to rules.'
    )
  })

  it('prefers the primary when it works', async () => {
    const planner = new FallbackPlanner(
      new RulePlanner(() => FIXED_NOW),
      new BoomPlanner()
    )

    const directive = await planWith(planner, 'open notepad')

    expect(directive).toEqual({
      kind: 'tool',
      call: { name: 'open_app', arguments: { app: 'notepad' } }
    })
  })
})
