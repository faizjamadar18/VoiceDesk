/**
 * In-process assistant service.
 *
 * Ported from apps/api/app/main.py. This class is the FastAPI app's route logic
 * without the HTTP layer: it plans a transcript, runs tools, manages
 * confirmations and undo, answers screen questions, and reports health. The HTTP
 * surface (OAuth callback, `/health`, and the action endpoints the desktop and
 * smoke harness use) is provided by `server.ts`, which calls this service.
 *
 * Behavior, response fields, messages, and status codes mirror the Python
 * backend exactly. Request-shape validation (the Pydantic models) lives in the
 * HTTP layer, because that is where the raw body is available.
 */

import { homedir } from 'node:os'
import path from 'node:path'
import type {
  ActionResponse,
  IntegrationConnectResult,
  IntegrationId,
  IntegrationsStatus,
  ScreenAnswerResponse,
  ScreenAskInput
} from '../../shared/types'
import { WindowsActionExecutor } from './actions'
import type { ComposioIntegration } from './composio/integration'
import { DirectFileSearch, FileOps } from './files'
import { DEFAULT_GROQ_MODEL, resilientFromEnv } from './groq'
import { loadServerConfigs } from './mcp/config'
import { McpManager } from './mcp/registry'
import { PendingStore } from './pending'
import { FallbackPlanner, GroqPlanner, RulePlanner } from './planner'
import { ToolRegistry } from './registry'
import { selectorFromEnv, type ToolSelector } from './retrieval'
import {
  FakeTranscriber,
  GroqTranscriber,
  MissingProviderKeyError,
  TranscriptionProviderError,
  type Transcriber
} from './transcribers'
import { buildDefaultRegistry } from './tools'
import type {
  ActionExecutor,
  Directive,
  FileSearch,
  FileOpsLike,
  JsonSchema,
  Planner,
  Tool,
  ToolContext,
  ToolOutcome,
  ToolPreparation,
  ToolSpec
} from './types'
import {
  DEFAULT_VISION_MODEL,
  GroqVisionClient,
  VisionNotConfiguredError,
  VisionProviderError,
  VisionQuotaError,
  type VisionClient
} from './vision'
import { WeatherClient, type WeatherResult } from './weather'
import { WindowsSearchProvider } from './windows-search'

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
export const MAX_SCREEN_IMAGE_BYTES = 12 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set(['fake', 'groq'])
const DEFAULT_PROVIDER = 'groq'

/** The integrations status reported when no integration is wired in. */
export function emptyIntegrationsStatus(): IntegrationsStatus {
  return {
    hasKey: false,
    keySource: null,
    sessionId: null,
    providers: [],
    error: null
  }
}

/** The API's HTTP error, mirroring FastAPI's `HTTPException`. */
export class AssistantHttpError extends Error {
  readonly status: number
  /**
   * The `detail` placed in the JSON error body. Route errors carry a string
   * (like FastAPI's `HTTPException`); request-validation errors carry
   * FastAPI's list-of-errors shape.
   */
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail))
    this.name = 'AssistantHttpError'
    this.status = status
    this.detail = detail
  }
}

export type TranscriberFactory = (provider: string) => Transcriber

export interface AssistantServiceOptions {
  transcriberFactory?: TranscriberFactory
  actionExecutor?: ActionExecutor
  clock?: () => Date
  planner?: Planner
  /** Explicit file roots switch file search to a bounded direct scan. */
  fileRoots?: string[]
  pendingStore?: PendingStore
  fileOps?: FileOpsLike
  windowsSearch?: FileSearch
  registry?: ToolRegistry
  visionClient?: VisionClient
  mcpManager?: McpManager | null
  weather?: { fetch(location: string): Promise<WeatherResult> }
  /** The Composio integration that contributes voice tools for connected apps. */
  integrations?: ComposioIntegration | null
  /** Home directory used by FileOps and the default file roots. */
  home?: string
  /** Default file roots when `KESTREL_FILE_ROOTS` is unset. */
  defaultFileRoots?: string[]
  /** Path to `mcp_servers.json`, used only when MCP is enabled. */
  mcpConfigPath?: string
}

export interface HealthResponse {
  status: string
  provider: string
  configured: boolean
}

export interface TranscriptionResponse {
  text: string
  provider: string
  latencyMs: number
}

export interface PlannerStatusResponse {
  provider: string
  configured: boolean
  model: string
}

export interface McpServerStatusResponse {
  name: string
  ok: boolean
  toolCount: number
  error: string | null
}

export interface McpStatusResponse {
  enabled: boolean
  servers: McpServerStatusResponse[]
}

function typeName(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name || error.name
  }
  return typeof error
}

/**
 * Build a complete `ActionResponse`, matching FastAPI's serialization: every
 * declared field is present, and unset optionals are `null`.
 */
function actionResponse(partial: {
  status: ActionResponse['status']
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
}): ActionResponse {
  return {
    status: partial.status,
    action: partial.action,
    message: partial.message,
    text: partial.text ?? null,
    dryRun: partial.dryRun ?? false,
    risk: partial.risk ?? null,
    requiresConfirmation: partial.requiresConfirmation ?? null,
    planId: partial.planId ?? null,
    results: partial.results ?? null,
    canUndo: partial.canUndo ?? null,
    target: partial.target ?? null,
    card: partial.card ?? null,
    spokenResponse: partial.spokenResponse ?? null
  }
}

/**
 * Validate model-supplied tool arguments against the tool's schema.
 *
 * Arguments come from a language model, so treat them as untrusted: a missing
 * required key, an unknown key, a wrong type, or a value outside the declared
 * enum is a planning miss, not an execution failure.
 */
export function validateArguments(spec: ToolSpec, args: unknown): boolean {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return false
  }
  const record = args as Record<string, unknown>
  const parameters = spec.parameters as {
    properties?: Record<string, unknown>
    required?: unknown
  }
  const properties = parameters.properties ?? {}
  const required = Array.isArray(parameters.required) ? parameters.required : []

  for (const key of required) {
    if (typeof key === 'string' && !(key in record)) {
      return false
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const prop = properties[key]
    if (typeof prop !== 'object' || prop === null || Array.isArray(prop)) {
      return false
    }
    const propRecord = prop as JsonSchema
    if (propRecord.type === 'string' && typeof value !== 'string') {
      return false
    }
    const allowed = propRecord.enum
    if (Array.isArray(allowed) && !allowed.includes(value)) {
      return false
    }
  }
  return true
}

/** "Ready to <lowercased action label>. Approval needed." from a short action label. */
export function pendingMessage(actionLabel: string): string {
  const trimmed = actionLabel.replace(/\s+$/, '').replace(/\.+$/, '')
  if (!trimmed) {
    return 'Approval needed.'
  }
  const body = trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
  return `Ready to ${body}. Approval needed.`
}

export class AssistantService {
  private readonly options: AssistantServiceOptions
  private readonly clock: () => Date
  private readonly ops: FileOpsLike
  private readonly registry: ToolRegistry
  private readonly roots: string[]
  private readonly explicitFileRoots: boolean
  private readonly fileSearch: FileSearch
  private readonly weather: { fetch(location: string): Promise<WeatherResult> }
  private readonly pending: PendingStore
  private readonly executor: ActionExecutor
  private readonly planner: Planner
  readonly plannerProvider: string
  private readonly integrations: ComposioIntegration | null
  private readonly toolSelector: ToolSelector | null
  private integrationToolNames: string[] = []
  private integrationRefresh: Promise<IntegrationsStatus> | null = null
  private manager: McpManager | null
  private readonly mcpConfigPath: string
  private readonly home: string
  private initialized = false

  constructor(options: AssistantServiceOptions = {}) {
    this.options = options
    this.clock = options.clock ?? (() => new Date())
    this.home = options.home ?? homedir()
    this.executor = options.actionExecutor ?? new WindowsActionExecutor()
    this.ops = options.fileOps ?? new FileOps(this.home)

    this.registry = options.registry ?? buildDefaultRegistry(this.ops)
    this.explicitFileRoots = options.fileRoots !== undefined
    this.roots = this.explicitFileRoots
      ? [...(options.fileRoots ?? [])]
      : (options.defaultFileRoots ?? defaultFileRoots())

    if (this.explicitFileRoots) {
      // Explicit roots always use the bounded direct scan. DirectFileSearch only
      // needs `search`, which a real FileOps provides; a bare fake FileOpsLike is
      // only used when no explicit roots are set.
      this.fileSearch = new DirectFileSearch(this.ops as FileOps, this.roots)
    } else if (options.windowsSearch !== undefined) {
      this.fileSearch = options.windowsSearch
    } else {
      this.fileSearch = new WindowsSearchProvider()
    }

    this.weather = options.weather ?? new WeatherClient()
    this.pending = options.pendingStore ?? new PendingStore()
    this.manager = options.mcpManager ?? null
    this.mcpConfigPath = options.mcpConfigPath ?? path.join(process.cwd(), 'mcp_servers.json')

    this.integrations = options.integrations ?? null
    const prepared = buildPlanner(options.planner, this.registry, this.clock)
    this.planner = prepared.planner
    this.toolSelector = prepared.selector
    this.plannerProvider = plannerProvider(this.planner)
  }

  /**
   * The tool selector the planner uses, or null when tool retrieval is off.
   * A host may need to know whether retrieval is active.
   */
  get activeToolSelector(): ToolSelector | null {
    return this.toolSelector
  }

  /**
   * Connect MCP servers and register their tools. Idempotent. Called once at
   * startup; a failure to reach a server is recorded in `mcpStatus` rather than
   * raised.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    this.manager = await setupMcp(this.manager, this.registry, this.mcpConfigPath)
    // Deliberately not awaited: the Composio session is a network call and must
    // not hold up startup. `refreshIntegrations` is idempotent and self-deduping.
    void this.refreshIntegrations()
  }

  async close(): Promise<void> {
    await this.manager?.close()
    this.manager = null
    await this.integrations?.close()
  }

  // -- ActionClient surface ---------------------------------------------

  async act(transcript: string): Promise<ActionResponse> {
    const dryRun = actionDryRun()
    const directive: Directive = await this.planner.plan(transcript)

    if (directive.kind === 'none') {
      return actionResponse({
        status: 'unhandled',
        action: 'none',
        message: directive.message,
        spokenResponse: directive.message,
        dryRun
      })
    }

    if (directive.kind === 'answer') {
      return actionResponse({
        status: 'ok',
        action: 'answer',
        message: directive.message,
        spokenResponse: directive.message,
        dryRun
      })
    }

    if (directive.kind === 'screen') {
      return actionResponse({
        status: 'ok',
        action: 'look_at_screen',
        message: '',
        spokenResponse: null,
        dryRun
      })
    }

    const call = directive.call
    const tool = this.registry.get(call.name)
    if (tool === undefined) {
      return actionResponse({
        status: 'unhandled',
        action: 'none',
        message: "I don't know how to do that yet.",
        spokenResponse: "I don't know how to do that yet.",
        dryRun
      })
    }

    const spec = tool.spec
    const label = spec.actionLabel || spec.name

    if (!validateArguments(spec, call.arguments)) {
      return actionResponse({
        status: 'unhandled',
        action: 'none',
        message: "I didn't catch a command I can run yet.",
        spokenResponse: "I didn't catch a command I can run yet.",
        dryRun
      })
    }

    const context = this.toolContext(dryRun)
    const prepared = await prepareTool(tool, call.arguments, context)
    if (prepared.outcome !== null && prepared.outcome !== undefined) {
      return outcomeResponse(prepared.outcome, dryRun)
    }

    if (spec.requiresConfirmation && !dryRun) {
      const planId = this.pending.create(spec.name, prepared.arguments)
      const message = prepared.message || pendingMessage(label)
      return actionResponse({
        status: 'pending',
        action: label,
        message,
        spokenResponse: message,
        planId,
        risk: spec.risk,
        requiresConfirmation: true,
        dryRun,
        target: prepared.display ?? null
      })
    }

    const outcome = await runTool(this.registry, spec.name, prepared.arguments, context)
    let planId: string | null = null
    if (outcome.canUndo && !dryRun) {
      planId = this.pending.create(spec.name, prepared.arguments)
      this.pending.markDone(planId, outcome)
    }
    return outcomeResponse(outcome, dryRun, planId)
  }

  async confirm(planId: string, approved: boolean): Promise<ActionResponse> {
    const record = this.pending.get(planId)
    if (record === undefined || record.state === 'cancelled') {
      throw new AssistantHttpError(404, 'Unknown or expired plan.')
    }

    if (!approved) {
      this.pending.cancel(planId)
      return actionResponse({ status: 'cancelled', action: 'none', message: 'Cancelled.' })
    }

    const tool = this.registry.get(record.tool)
    if (tool === undefined) {
      throw new AssistantHttpError(404, 'Unknown tool for plan.')
    }

    if (record.state !== 'done') {
      const context = this.toolContext(false)
      const outcome = await runTool(this.registry, record.tool, record.arguments, context)
      this.pending.markDone(planId, outcome)
    }

    const stored = this.pending.get(planId)
    const outcome = stored?.outcome ?? null
    if (outcome === null || outcome === undefined) {
      throw new AssistantHttpError(409, 'Plan has no result.')
    }
    return actionResponse({
      status: 'ok',
      action: tool.spec.actionLabel || tool.spec.name,
      message: outcome.message,
      // The confirmation is the last thing the user hears after approving, so
      // speak it rather than leaving the approval line as the final word.
      spokenResponse: outcome.spokenResponse || outcome.message,
      dryRun: false,
      canUndo: Boolean(tool.spec.undo),
      target: outcome.target ?? null
    })
  }

  async undo(planId: string): Promise<ActionResponse> {
    const record = this.pending.get(planId)
    if (record === undefined) {
      throw new AssistantHttpError(404, 'Unknown or expired plan.')
    }

    const tool = this.registry.get(record.tool)
    const outcome = this.pending.undoInfo(planId)
    if (
      tool === undefined ||
      outcome === null ||
      tool.spec.undo === null ||
      tool.spec.undo === undefined ||
      outcome.target === null ||
      outcome.target === undefined
    ) {
      throw new AssistantHttpError(409, 'Nothing to undo.')
    }

    await runUndo(tool.spec.undo, outcome.target, this.ops)
    this.pending.cancel(planId)
    return actionResponse({ status: 'ok', action: 'undo', message: 'Undone.' })
  }

  async askScreen(input: ScreenAskInput): Promise<ScreenAnswerResponse> {
    const mimeType = detectImageType(input.imageBase64)
    const started = performance.now()

    let answer: string
    try {
      const vision = this.options.visionClient ?? GroqVisionClient.fromEnv()
      answer = await vision.answer({
        question: input.question,
        imageBase64: input.imageBase64,
        mimeType,
        marked: input.marked
      })
    } catch (error) {
      if (error instanceof VisionNotConfiguredError) {
        throw new AssistantHttpError(503, error.message)
      }
      if (error instanceof VisionQuotaError) {
        throw new AssistantHttpError(503, error.message)
      }
      if (error instanceof VisionProviderError) {
        throw new AssistantHttpError(502, error.message)
      }
      throw new AssistantHttpError(
        502,
        `Vision provider failed (${typeName(error)}).`
      )
    }

    if (typeof answer !== 'string' || !answer.trim()) {
      throw new AssistantHttpError(502, 'Vision provider returned an empty answer.')
    }

    const cleaned = answer.trim()
    const latencyMs = Math.max(0, Math.floor(performance.now() - started))
    return {
      answer: cleaned,
      model: visionModel(this.options.visionClient),
      latencyMs
    }
  }

  // -- Other routes ------------------------------------------------------

  health(): HealthResponse {
    const provider = providerName()
    return {
      status: 'ok',
      provider,
      configured: providerConfigured(provider)
    }
  }

  plannerStatus(): PlannerStatusResponse {
    return {
      provider: this.plannerProvider,
      configured: true,
      model: plannerModel(this.plannerProvider)
    }
  }

  mcpStatus(): McpStatusResponse {
    const manager = this.manager
    if (manager === null) {
      return { enabled: false, servers: [] }
    }
    return {
      enabled: true,
      servers: manager.statuses.map((status) => ({
        name: status.name,
        ok: status.ok,
        toolCount: status.toolCount,
        error: status.error ?? null
      }))
    }
  }

  // -- Integrations ------------------------------------------------------

  integrationsStatus(): IntegrationsStatus {
    return this.integrations?.status() ?? emptyIntegrationsStatus()
  }

  /**
   * Re-check the connected apps and rebuild their tools. Self-deduping: a
   * concurrent call joins the refresh already in flight. Never rejects.
   */
  refreshIntegrations(): Promise<IntegrationsStatus> {
    if (this.integrationRefresh !== null) {
      return this.integrationRefresh
    }
    const refresh = this.runRefresh()
    this.integrationRefresh = refresh
    void refresh.finally(() => {
      if (this.integrationRefresh === refresh) {
        this.integrationRefresh = null
      }
    })
    return refresh
  }

  async setIntegrationsKey(key: string): Promise<IntegrationsStatus> {
    const integration = this.integrations
    if (integration === null) {
      return emptyIntegrationsStatus()
    }
    const status = await integration.setKey(key)
    this.applyIntegrationTools()
    return status
  }

  async clearIntegrationsKey(): Promise<IntegrationsStatus> {
    const integration = this.integrations
    if (integration === null) {
      return emptyIntegrationsStatus()
    }
    const status = await integration.clearKey()
    this.applyIntegrationTools()
    return status
  }

  async connectIntegration(id: IntegrationId): Promise<IntegrationConnectResult> {
    const integration = this.integrations
    if (integration === null) {
      return { ok: false, url: null, message: 'Integrations are not available.' }
    }
    return integration.connect(id)
  }

  async awaitIntegration(id: IntegrationId): Promise<boolean> {
    const integration = this.integrations
    if (integration === null) {
      return false
    }
    const connected = await integration.waitForConnection(id)
    this.applyIntegrationTools()
    return connected
  }

  private async runRefresh(): Promise<IntegrationsStatus> {
    try {
      const integration = this.integrations
      if (integration === null) {
        return emptyIntegrationsStatus()
      }
      const status = await integration.refresh()
      this.applyIntegrationTools()
      return status
    } catch {
      // ComposioIntegration never throws, but hold that line here too.
      return this.integrationsStatus()
    }
  }

  /**
   * Rebuild the registry's integration tools.
   *
   * The registry is keyed by name and `register` overwrites, so a shrinking
   * tool set must be removed explicitly.
   */
  private applyIntegrationTools(): void {
    const integration = this.integrations
    if (integration === null) return
    for (const name of this.integrationToolNames) this.registry.delete(name)
    this.integrationToolNames = []
    for (const tool of integration.tools) {
      this.registry.register(tool)
      this.integrationToolNames.push(tool.spec.name)
    }
    // A connected app's tools are always offered to the model, so they must not
    // be filtered out by tool retrieval, which keeps only the top-ranked specs.
    this.toolSelector?.pin(...this.integrationToolNames)
  }

  async transcribe(
    audio: Uint8Array | ArrayBuffer,
    contentType: string
  ): Promise<TranscriptionResponse> {
    if (!isSupportedContentType(contentType)) {
      throw new AssistantHttpError(
        415,
        'Unsupported Content-Type. Send raw audio with an audio/* or ' +
          'application/octet-stream Content-Type.'
      )
    }

    const size = audio.byteLength
    if (size === 0) {
      throw new AssistantHttpError(400, 'Audio body is empty.')
    }
    if (size > MAX_AUDIO_BYTES) {
      throw new AssistantHttpError(413, 'Audio body must be at most 10 MiB.')
    }

    const provider = providerName()
    const factory = this.options.transcriberFactory ?? defaultTranscriber
    let transcriber: Transcriber
    try {
      transcriber = factory(provider)
    } catch (error) {
      if (error instanceof MissingProviderKeyError) {
        throw new AssistantHttpError(503, error.message)
      }
      throw error
    }

    const started = performance.now()
    let text: string
    try {
      text = await transcriber.transcribe(audio, contentType)
    } catch (error) {
      if (error instanceof MissingProviderKeyError) {
        throw new AssistantHttpError(503, error.message)
      }
      throw new AssistantHttpError(502, providerFailureDetail(error))
    }

    const latencyMs = Math.max(0, Math.floor(performance.now() - started))
    return { text, provider, latencyMs }
  }

  private toolContext(dryRun: boolean): ToolContext {
    return {
      executor: this.executor,
      clock: this.clock,
      fileRoots: [...this.roots],
      dryRun,
      fileOps: this.ops,
      fileSearch: this.fileSearch,
      weather: this.weather
    }
  }
}

/** The action executor used in production: launch apps and open URLs locally. */
function buildPlanner(
  injected: Planner | undefined,
  registry: ToolRegistry,
  clock: () => Date
): { planner: Planner; selector: ToolSelector | null } {
  if (injected !== undefined) {
    return { planner: injected, selector: null }
  }
  if (groqKeyPresent()) {
    const selector = toolRetrievalEnabled() ? selectorFromEnv() : null
    return {
      planner: new FallbackPlanner(
        new GroqPlanner(registry, resilientFromEnv(), selector ?? undefined),
        new RulePlanner(clock)
      ),
      selector
    }
  }
  return { planner: new RulePlanner(clock), selector: null }
}

function plannerProvider(planner: Planner): string {
  if (planner instanceof FallbackPlanner || planner instanceof GroqPlanner) {
    return 'groq'
  }
  return 'rule'
}

async function setupMcp(
  injected: McpManager | null,
  registry: ToolRegistry,
  configPath: string
): Promise<McpManager | null> {
  let manager = injected
  if (manager === null) {
    if (!mcpEnabled()) {
      return null
    }
    const configs = loadServerConfigs(configPath)
    manager = new McpManager(configs)
  }
  await manager.connect()
  for (const tool of manager.tools) {
    registry.register(tool)
  }
  return manager
}

async function prepareTool(
  tool: Tool,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolPreparation> {
  if (typeof tool.prepare !== 'function') {
    return { arguments: { ...args } }
  }
  return tool.prepare({ ...args }, context)
}

async function runTool(
  registry: ToolRegistry,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const tool = registry.get(toolName)
  if (tool === undefined) {
    throw new AssistantHttpError(502, `Unknown tool '${toolName}'.`)
  }
  try {
    return await tool.run(args, context)
  } catch (error) {
    if (error instanceof AssistantHttpError) {
      throw error
    }
    throw new AssistantHttpError(502, `Action '${toolName}' failed (${typeName(error)}).`)
  }
}

async function runUndo(
  undoTool: string,
  target: string,
  fileOps: FileOpsLike
): Promise<void> {
  if (undoTool !== 'remove_created') {
    throw new AssistantHttpError(409, `No undo handler for '${undoTool}'.`)
  }
  try {
    await fileOps.removeCreated(target)
  } catch (error) {
    throw new AssistantHttpError(409, `Undo failed (${typeName(error)}).`)
  }
}

function outcomeResponse(
  outcome: ToolOutcome,
  dryRun: boolean,
  planId: string | null = null
): ActionResponse {
  return actionResponse({
    status: outcome.status as ActionResponse['status'],
    action: outcome.action,
    message: outcome.message,
    text: outcome.text ?? null,
    dryRun,
    risk: outcome.risk ?? null,
    requiresConfirmation: outcome.requiresConfirmation || null,
    planId,
    results: outcome.results != null ? [...outcome.results] : null,
    canUndo: outcome.canUndo || null,
    target: outcome.target ?? null,
    card: outcome.card ?? null,
    spokenResponse: outcome.spokenResponse || outcome.message
  })
}

// -- Image and audio validation ----------------------------------------

/**
 * Validate raw base64 and detect PNG/JPEG from magic bytes only.
 *
 * Mirrors Python's `base64.b64decode(..., validate=True)`: only the standard
 * alphabet and well-formed padding are accepted.
 */
export function detectImageType(image: string): string {
  const maxEncodedLength = 4 * Math.floor((MAX_SCREEN_IMAGE_BYTES + 2) / 3)
  if (image.length > maxEncodedLength) {
    throw new AssistantHttpError(413, 'Screenshot must be at most 12 MiB.')
  }

  const decoded = decodeBase64Strict(image)
  if (decoded.length === 0) {
    throw new AssistantHttpError(422, 'Image must not be empty.')
  }
  if (decoded.length > MAX_SCREEN_IMAGE_BYTES) {
    throw new AssistantHttpError(413, 'Screenshot must be at most 12 MiB.')
  }
  if (decoded.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png'
  }
  if (decoded.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg'
  }
  throw new AssistantHttpError(415, 'Image must be PNG or JPEG.')
}

function decodeBase64Strict(value: string): Buffer {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new AssistantHttpError(422, 'Image must be valid base64.')
  }
  return Buffer.from(value, 'base64')
}

export function isSupportedContentType(value: string): boolean {
  const mediaType = value.split(';', 1)[0].trim().toLowerCase()
  return mediaType.startsWith('audio/') || mediaType === 'application/octet-stream'
}

// -- Provider/config helpers -------------------------------------------

export function providerName(): string {
  const provider = (process.env.KESTREL_ASR_PROVIDER ?? DEFAULT_PROVIDER)
    .trim()
    .toLowerCase()
  return SUPPORTED_PROVIDERS.has(provider) ? provider : DEFAULT_PROVIDER
}

export function providerConfigured(provider: string): boolean {
  if (provider === 'fake') {
    return true
  }
  return Boolean((process.env.GROQ_API_KEY ?? '').trim())
}

export function defaultTranscriber(provider: string): Transcriber {
  if (provider === 'fake') {
    return FakeTranscriber.fromEnv()
  }
  return GroqTranscriber.fromEnv()
}

function providerFailureDetail(error: unknown): string {
  if (error instanceof TranscriptionProviderError) {
    return error.message
  }
  return `Transcription provider failed (${typeName(error)}).`
}

export function plannerModel(provider: string): string {
  if (provider === 'groq') {
    return process.env.KESTREL_GROQ_MODEL || DEFAULT_GROQ_MODEL
  }
  return 'rules'
}

export function visionModel(client: VisionClient | undefined): string {
  const model = (client as { model?: unknown } | undefined)?.model
  if (typeof model === 'string' && model.trim()) {
    return model
  }
  const configured = (process.env.KESTREL_GROQ_VISION_MODEL ?? '').trim()
  return configured || DEFAULT_VISION_MODEL
}

function actionDryRun(): boolean {
  const raw = (process.env.KESTREL_ACTION_DRY_RUN ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export function mcpEnabled(): boolean {
  const raw = (process.env.KESTREL_MCP_ENABLED ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/** Tool retrieval is on by default; only explicit falsy values turn it off. */
function toolRetrievalEnabled(): boolean {
  const raw = (process.env.KESTREL_TOOL_RETRIEVAL ?? '').trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(raw)
}

function groqKeyPresent(): boolean {
  return Boolean(
    (process.env.KESTREL_GROQ_API_KEY ?? '').trim() ||
      (process.env.GROQ_API_KEY ?? '').trim()
  )
}

export function defaultFileRoots(): string[] {
  const raw = (process.env.KESTREL_FILE_ROOTS ?? '').trim()
  if (raw) {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return [path.join(homedir(), 'Documents')]
}
