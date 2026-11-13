/**
 * Turn a transcript into a directive the desktop can execute.
 *
 * Ported from apps/api/app/planner.py. A directive is either a plain answer,
 * a tool call, a screen question, or "I don't understand". The rule planner
 * preserves the original deterministic behaviour; the Groq planner delegates
 * the choice to a model, and the fallback planner keeps the app working when
 * the model is unavailable.
 */

import { planAction } from './actions'
import { ToolRegistry } from './registry'
import type {
  ChatTurn,
  Directive,
  LlmClient,
  Planner,
  ToolSelector,
  ToolSpec
} from './types'

export class RulePlanner implements Planner {
  private readonly clock: () => Date

  constructor(clock?: () => Date) {
    this.clock = clock ?? (() => new Date())
  }

  async plan(transcript: string): Promise<Directive> {
    const create = matchCreate(transcript)
    if (create !== null) {
      return create
    }

    const deleteDirective = matchDelete(transcript)
    if (deleteDirective !== null) {
      return deleteDirective
    }

    const fileQuery = fileSearchQuery(transcript)
    if (fileQuery !== null) {
      return {
        kind: 'tool',
        call: { name: 'search_files', arguments: { query: fileQuery } }
      }
    }

    const weatherLocation = matchWeather(transcript)
    if (weatherLocation !== null) {
      return {
        kind: 'tool',
        call: { name: 'get_weather', arguments: { location: weatherLocation } }
      }
    }

    const plan = planAction(transcript, this.clock())

    if (plan.action === 'open_app' && plan.target != null) {
      return {
        kind: 'tool',
        call: { name: 'open_app', arguments: { app: plan.target } }
      }
    }
    if (plan.action === 'browser' && plan.url != null) {
      return {
        kind: 'tool',
        call: {
          name: 'web_search',
          arguments: { query: queryFromUrl(plan.url) }
        }
      }
    }
    if (plan.action === 'type' && plan.text != null) {
      return {
        kind: 'tool',
        call: { name: 'type_text', arguments: { text: plan.text } }
      }
    }
    if (plan.action === 'answer') {
      return { kind: 'answer', message: plan.message }
    }
    return { kind: 'none', message: plan.message }
  }
}

export const LOOK_AT_SCREEN_SPEC: ToolSpec = {
  name: 'look_at_screen',
  description:
    "Answer questions about what is on the user's screen, including errors, " +
    'but not general knowledge.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  risk: 'read',
  requiresConfirmation: false
}

export class GroqPlanner implements Planner {
  private readonly registry: ToolRegistry
  private readonly client: LlmClient
  private readonly selector: ToolSelector | undefined
  private readonly recentContext: (() => ChatTurn[]) | undefined

  constructor(
    registry: ToolRegistry,
    client: LlmClient,
    selector?: ToolSelector,
    recentContext?: () => ChatTurn[]
  ) {
    this.registry = registry
    this.client = client
    this.selector = selector
    this.recentContext = recentContext
  }

  async plan(transcript: string): Promise<Directive> {
    let specs = this.registry.specs()
    if (this.selector !== undefined) {
      specs = this.selector.select(transcript, specs)
    }
    specs = [...specs, LOOK_AT_SCREEN_SPEC]
    const history = this.recentContext?.() ?? []
    const reply = await this.client.choose(transcript, specs, history)
    for (const call of reply.calls) {
      if (call.name === LOOK_AT_SCREEN_SPEC.name) {
        return { kind: 'screen', question: transcript }
      }
      if (this.registry.get(call.name) !== undefined) {
        return { kind: 'tool', call }
      }
    }
    const content = (reply.content ?? '').trim()
    if (content) {
      return { kind: 'answer', message: content }
    }
    return { kind: 'none', message: "I didn't catch a command I can run yet." }
  }
}

export class FallbackPlanner implements Planner {
  private readonly primary: Planner
  private readonly fallback: Planner

  constructor(primary: Planner, fallback: Planner) {
    this.primary = primary
    this.fallback = fallback
  }

  async plan(transcript: string): Promise<Directive> {
    try {
      return await this.primary.plan(transcript)
    } catch (error) {
      console.warn(
        `Primary planner failed (${errorName(error)}: ${errorMessage(error)}); falling back to rules.`
      )
      return await this.fallback.plan(transcript)
    }
  }
}

const FILE_SEARCH_PATTERN =
  /^(?:find|search|show)\s+(?:me\s+)?(?:for\s+)?(?:my\s+)?files?\s+(?:named|called|for)\s+(?<query>.+)$/i

const CREATE_FOLDER_PATTERN =
  /^(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?folder\s+(?:called\s+|named\s+)?(?<name>.+?)(?:\s+(?:on|in|inside|under)\s+(?<location>.+))?$/i

const CREATE_FILE_PATTERN =
  /^(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:text\s+|empty\s+)?file\s+(?:called\s+|named\s+)?(?<name>.+?)(?:\s+(?:on|in|inside|under)\s+(?<location>.+))?$/i

const DELETE_FILE_PATTERN =
  /^(?:delete|remove|trash)\s+(?:the\s+)?(?:file\s+)?(?<query>.+)$/i

const WEATHER_LOCATION_PATTERN =
  /(?:weather\s+(?:like\s+)?(?:in|for|of|at)\s+([a-zA-Z\s]+?))(?:\s+today|\s+now|\s+currently)?$/i

export function matchWeather(transcript: string): string | null {
  const text = collapseWhitespace(transcript).replace(/[.,!?;:]+$/, '')
  const match = WEATHER_LOCATION_PATTERN.exec(text)
  if (match !== null) {
    const location = match[1].trim()
    if (location) {
      return location
    }
  }
  if (/\bweather\b/i.test(text)) {
    return 'Current Location'
  }
  return null
}

export function matchCreate(transcript: string): Directive | null {
  const normalized = collapseWhitespace(transcript).replace(/[.,!?;:]+$/, '')
  if (!normalized) {
    return null
  }

  const patterns: Array<{ pattern: RegExp; tool: string }> = [
    { pattern: CREATE_FOLDER_PATTERN, tool: 'create_folder' },
    { pattern: CREATE_FILE_PATTERN, tool: 'create_file' }
  ]

  for (const { pattern, tool } of patterns) {
    const match = pattern.exec(normalized)
    if (match === null) {
      continue
    }
    const name = cleanFragment(match.groups?.name ?? '')
    if (!name) {
      continue
    }
    const args: Record<string, unknown> = { name }
    const location = match.groups?.location
    if (location) {
      const cleaned = cleanFragment(location)
      if (cleaned) {
        args.location = cleaned
      }
    }
    return { kind: 'tool', call: { name: tool, arguments: args } }
  }
  return null
}

export function matchDelete(transcript: string): Directive | null {
  const normalized = collapseWhitespace(transcript).replace(/[.,!?;:]+$/, '')
  const match = DELETE_FILE_PATTERN.exec(normalized)
  if (match === null) {
    return null
  }
  const query = cleanFragment(match.groups?.query ?? '')
  if (!query) {
    return null
  }
  return { kind: 'tool', call: { name: 'delete_file', arguments: { query } } }
}

export function cleanFragment(value: string): string {
  return value
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[.,!?;:]+$/, '')
    .trim()
}

export function fileSearchQuery(transcript: string): string | null {
  const normalized = collapseWhitespace(transcript)
  const match = FILE_SEARCH_PATTERN.exec(normalized)
  if (match === null) {
    return null
  }
  let query = (match.groups?.query ?? '').trim()
  query = query.replace(/^["']+|["']+$/g, '')
  query = query.replace(/[.,!?;:]+$/, '')
  return query || null
}

export function queryFromUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://example.invalid')
    return parsed.searchParams.get('q') ?? ''
  } catch {
    return ''
  }
}

function collapseWhitespace(value: string): string {
  return value.trim().split(/\s+/).join(' ')
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name || error.name
  }
  return typeof error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
