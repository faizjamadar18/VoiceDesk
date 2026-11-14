/**
 * Assistant domain seam.
 *
 * These interfaces mirror the Python backend contracts in
 * apps/api/app/tools.py and apps/api/app/planner.py, with the dependency
 * shapes from files.py, windows_search.py, weather.py, and actions.py.
 * Field names use camelCase; the Python side used snake_case.
 */

export type JsonSchema = Record<string, unknown>

export interface ToolSpec {
  name: string
  description: string
  parameters: JsonSchema
  risk: string
  requiresConfirmation: boolean
  undo?: string | null
  actionLabel?: string | null
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface LlmReply {
  calls: ToolCall[]
  content: string | null
}

export interface ToolOutcome {
  status: string
  action: string
  message: string
  text?: string | null
  url?: string | null
  target?: string | null
  results?: Array<Record<string, unknown>> | null
  planId?: string | null
  risk?: string | null
  requiresConfirmation?: boolean
  canUndo?: boolean
  card?: Record<string, unknown> | null
  spokenResponse?: string | null
}

export interface ToolPreparation {
  arguments: Record<string, unknown>
  display?: string | null
  message?: string | null
  outcome?: ToolOutcome | null
  card?: Record<string, unknown> | null
}

export interface ActionExecutor {
  openApp(app: string): void | Promise<void>
  openUrl(url: string): void | Promise<void>
}

export interface FileSearch {
  search(
    query: string,
    limit?: number
  ): Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>
}

/**
 * Filesystem operations used by the file tools.
 *
 * Python passed `pathlib.Path` values around; TypeScript represents those
 * same absolute paths as strings. Implementations own the safety checks.
 */
export interface FileOpsLike {
  createFolder(name: string, location?: string | null): string | Promise<string>
  createFile(name: string, location?: string | null): string | Promise<string>
  deleteFile(path: string): string | Promise<string>
  resolveDeleteTarget(path: string): string | Promise<string>
  removeCreated(path: string): void | Promise<void>
}

export interface WeatherResult {
  location: string
  temperature: string
  low: string
  high: string
  condition: string
  icon: string
  spoken: string
}

export interface WeatherClientLike {
  fetch(location: string): Promise<WeatherResult>
}

/** Everything the model needs to write a contextual email reply body. */
export interface EmailReplyRequest {
  sender: string
  subject: string
  body: string
  instruction: string
  draft: string
}

export interface ToolContext {
  executor: ActionExecutor
  clock: () => Date
  fileRoots: string[]
  dryRun: boolean
  fileOps: FileOpsLike
  fileSearch: FileSearch
  weather: WeatherClientLike
  transcript?: string
  /** Writes an email reply body, or null when the model is unavailable. */
  composeEmailReply?: (input: EmailReplyRequest) => Promise<string | null>
}

export interface Tool {
  spec: ToolSpec
  run(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolOutcome | Promise<ToolOutcome>
  prepare?(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolPreparation | Promise<ToolPreparation>
}

export interface AnswerDirective {
  kind: 'answer'
  message: string
}

export interface ToolDirective {
  kind: 'tool'
  call: ToolCall
}

export interface NoDirective {
  kind: 'none'
  message: string
}

export interface ScreenDirective {
  kind: 'screen'
  question: string
}

export type Directive =
  | AnswerDirective
  | ToolDirective
  | NoDirective
  | ScreenDirective

export interface Planner {
  plan(transcript: string): Promise<Directive>
}

/** One prior conversation turn replayed to the model. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmClient {
  choose(
    transcript: string,
    specs: ToolSpec[],
    history?: ChatTurn[]
  ): Promise<LlmReply>
}

export interface ToolSelector {
  select(transcript: string, specs: ToolSpec[]): ToolSpec[]
}

export interface PendingRecord {
  planId: string
  tool: string
  arguments: Record<string, unknown>
  state: 'pending' | 'done' | 'cancelled'
  outcome?: ToolOutcome | null
}

/**
 * Shape of the assistant action endpoint response, mirroring ActionResponse
 * in apps/desktop/src/shared/types.ts without importing shared code.
 */
export interface AssistantActionResponse {
  status: 'ok' | 'unhandled' | 'error' | 'pending' | 'cancelled'
  action: string
  message: string
  text?: string | null
  dryRun?: boolean
  risk?: string | null
  requiresConfirmation?: boolean | null
  planId?: string | null
  results?: Array<Record<string, unknown>> | null
  canUndo?: boolean | null
  target?: string | null
  card?: Record<string, unknown> | null
  spokenResponse?: string | null
}
