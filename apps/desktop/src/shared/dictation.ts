/**
 * The dictation settings contract shared by the main and renderer processes.
 *
 * Every value that comes back from disk or from the renderer passes through the
 * `normalize*` helpers below, so callers never see a half-valid object.
 */

export const POLISH_STYLE_IDS = ['none', 'light', 'polished'] as const
export type PolishStyle = (typeof POLISH_STYLE_IDS)[number]
export const DEFAULT_POLISH_STYLE: PolishStyle = 'light'

export function isPolishStyle(value: unknown): value is PolishStyle {
  return typeof value === 'string' && (POLISH_STYLE_IDS as readonly string[]).includes(value)
}

export const WRITING_CONTEXT_TYPES = ['personal_chat', 'work_chat', 'email', 'other'] as const
export type WritingContextType = (typeof WRITING_CONTEXT_TYPES)[number]

export function isWritingContextType(value: unknown): value is WritingContextType {
  return typeof value === 'string' && (WRITING_CONTEXT_TYPES as readonly string[]).includes(value)
}

export const WRITING_STYLE_PRESET_IDS = ['formal', 'casual', 'veryCasual', 'excited'] as const
export type WritingStylePresetId = (typeof WRITING_STYLE_PRESET_IDS)[number]

export type CapitalizationSetting = 'always' | 'auto' | 'never'
export type SentenceEndingsSetting = 'proper' | 'light' | 'none'
export type ExclamationSetting = 'on' | 'off'
export type GreetingSetting = 'newline' | 'inline'

export interface WritingStructure {
  capitalization: CapitalizationSetting
  sentenceEndings: SentenceEndingsSetting
  exclamation: ExclamationSetting
  greeting: GreetingSetting
}

/** Alias kept for the renderer, which names these per-context structures. */
export type WritingContextStructure = WritingStructure

export const FORMAL_STRUCTURE: WritingStructure = {
  capitalization: 'always',
  sentenceEndings: 'proper',
  exclamation: 'off',
  greeting: 'newline'
}

export const WRITING_STYLE_PRESET_STRUCTURES: Record<WritingStylePresetId, WritingStructure> = {
  formal: FORMAL_STRUCTURE,
  casual: {
    capitalization: 'auto',
    sentenceEndings: 'light',
    exclamation: 'off',
    greeting: 'inline'
  },
  veryCasual: {
    capitalization: 'never',
    sentenceEndings: 'none',
    exclamation: 'off',
    greeting: 'inline'
  },
  excited: {
    capitalization: 'always',
    sentenceEndings: 'proper',
    exclamation: 'on',
    greeting: 'newline'
  }
}

/** A fresh copy of the preset's structure, safe for the caller to mutate. */
export function getStructureForPreset(id: WritingStylePresetId): WritingStructure {
  return { ...WRITING_STYLE_PRESET_STRUCTURES[id] }
}

/**
 * The preset a structure most closely matches. Greeting does not take part in
 * matching; an exact match wins over a fuzzy one on capitalization and endings.
 */
export function getPresetIdForStructure(
  structure: Partial<WritingStructure> | undefined
): WritingStylePresetId {
  const capitalization = structure?.capitalization
  const sentenceEndings = structure?.sentenceEndings
  const exclamation = structure?.exclamation

  for (const id of WRITING_STYLE_PRESET_IDS) {
    const preset = WRITING_STYLE_PRESET_STRUCTURES[id]
    if (
      preset.capitalization === capitalization &&
      preset.sentenceEndings === sentenceEndings &&
      preset.exclamation === exclamation
    ) {
      return id
    }
  }

  for (const id of WRITING_STYLE_PRESET_IDS) {
    const preset = WRITING_STYLE_PRESET_STRUCTURES[id]
    if (preset.capitalization === capitalization && preset.sentenceEndings === sentenceEndings) {
      return id
    }
  }

  return 'formal'
}

/** Very casual stays available only where the user is chatting with friends. */
export function presetsForContext(type: WritingContextType): WritingStylePresetId[] {
  if (type === 'personal_chat') return [...WRITING_STYLE_PRESET_IDS]
  return WRITING_STYLE_PRESET_IDS.filter((id) => id !== 'veryCasual')
}

export interface WritingContext {
  type: WritingContextType
  structure: WritingStructure
  assignedApps: string[]
}

export interface SpellingEntry {
  id: string
  text: string
  description?: string
  auto_added?: boolean
}

export interface ReplacementEntry {
  id: string
  title: string
  content: string
}

export interface DictationSettings {
  polishStyle: PolishStyle
  activeContextType: WritingContextType
  writingContexts: WritingContext[]
  selectedPresets: Record<WritingContextType, WritingStylePresetId>
  spellingEntries: SpellingEntry[]
  replacementEntries: ReplacementEntry[]
  showSpellingExamples: boolean
  showReplacementExamples: boolean
}

export const DICTATION_LIMITS = {
  spellingEntries: 100,
  spellingDescriptionChars: 30,
  replacementEntries: 100,
  replacementTitleChars: 40,
  replacementContentChars: 6000,
  assignedAppsPerContext: 50
} as const

export const DEFAULT_WRITING_CONTEXTS: WritingContext[] = WRITING_CONTEXT_TYPES.map((type) => ({
  type,
  structure: { ...FORMAL_STRUCTURE },
  assignedApps: []
}))

export const DEFAULT_DICTATION_SETTINGS: DictationSettings = {
  polishStyle: DEFAULT_POLISH_STYLE,
  activeContextType: 'personal_chat',
  writingContexts: DEFAULT_WRITING_CONTEXTS,
  selectedPresets: {
    personal_chat: 'formal',
    work_chat: 'formal',
    email: 'formal',
    other: 'formal'
  },
  spellingEntries: [],
  replacementEntries: [],
  showSpellingExamples: true,
  showReplacementExamples: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCapitalization(value: unknown): value is CapitalizationSetting {
  return value === 'always' || value === 'auto' || value === 'never'
}

function isSentenceEndings(value: unknown): value is SentenceEndingsSetting {
  return value === 'proper' || value === 'light' || value === 'none'
}

function isGreeting(value: unknown): value is GreetingSetting {
  return value === 'newline' || value === 'inline'
}

/** Accepts the stored exclamation values, including the two legacy spellings. */
function normalizeExclamation(value: unknown): ExclamationSetting {
  if (value === 'on' || value === 'normal') return 'on'
  if (value === 'off' || value === 'minimize') return 'off'
  return FORMAL_STRUCTURE.exclamation
}

export function normalizeWritingStructure(
  raw: unknown,
  contextType: WritingContextType
): WritingStructure {
  const source = isRecord(raw) ? raw : {}
  const fallbackGreeting: GreetingSetting = contextType === 'email' ? 'newline' : 'inline'

  return {
    capitalization: isCapitalization(source.capitalization)
      ? source.capitalization
      : FORMAL_STRUCTURE.capitalization,
    sentenceEndings: isSentenceEndings(source.sentenceEndings)
      ? source.sentenceEndings
      : FORMAL_STRUCTURE.sentenceEndings,
    exclamation: normalizeExclamation(source.exclamation),
    greeting: isGreeting(source.greeting) ? source.greeting : fallbackGreeting
  }
}

function trimStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const values: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    values.push(trimmed)
  }
  return values
}

/**
 * Reads either an array of contexts or a `{ contexts, appToContext }` envelope.
 * Unknown context types are dropped, all four contexts are back-filled in
 * canonical order, and each app is kept under the first context that claims it.
 */
export function normalizeWritingContexts(raw: unknown): WritingContext[] {
  const list: unknown[] = []
  let appToContext: Record<string, unknown> | null = null

  if (Array.isArray(raw)) {
    list.push(...raw)
  } else if (isRecord(raw)) {
    if (Array.isArray(raw.contexts)) list.push(...raw.contexts)
    if (isRecord(raw.appToContext)) appToContext = raw.appToContext
  }

  const claimed = new Map<WritingContextType, { structure: WritingStructure; apps: string[] }>()

  for (const entry of list) {
    if (!isRecord(entry) || !isWritingContextType(entry.type)) continue
    const apps = trimStringList(entry.assignedApps)
    const existing = claimed.get(entry.type)
    if (existing) {
      existing.apps.push(...apps)
      continue
    }
    claimed.set(entry.type, {
      structure: normalizeWritingStructure(entry.structure, entry.type),
      apps
    })
  }

  if (appToContext) {
    for (const [app, value] of Object.entries(appToContext)) {
      if (!isWritingContextType(value)) continue
      const trimmed = app.trim()
      if (!trimmed) continue
      const existing = claimed.get(value)
      if (existing) {
        existing.apps.push(trimmed)
      } else {
        claimed.set(value, { structure: { ...FORMAL_STRUCTURE }, apps: [trimmed] })
      }
    }
  }

  // One app lives in one context: the first context in canonical order wins.
  const seen = new Set<string>()

  return WRITING_CONTEXT_TYPES.map((type) => {
    const entry = claimed.get(type)
    const assignedApps: string[] = []
    for (const app of entry ? entry.apps : []) {
      const key = app.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      assignedApps.push(app)
      if (assignedApps.length >= DICTATION_LIMITS.assignedAppsPerContext) break
    }
    return {
      type,
      structure: entry ? { ...entry.structure } : { ...FORMAL_STRUCTURE },
      assignedApps
    }
  })
}

function normalizeSpellingEntries(raw: unknown): SpellingEntry[] {
  if (!Array.isArray(raw)) return []

  const entries: SpellingEntry[] = []
  const seen = new Set<string>()

  raw.forEach((item, index) => {
    if (entries.length >= DICTATION_LIMITS.spellingEntries) return
    if (!isRecord(item)) return

    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!text) return

    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)

    const description =
      typeof item.description === 'string'
        ? item.description.trim().slice(0, DICTATION_LIMITS.spellingDescriptionChars).trim() ||
          undefined
        : undefined

    entries.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `spelling-${index + 1}`,
      text,
      description,
      auto_added: Boolean(item.auto_added)
    })
  })

  return entries
}

function normalizeReplacementEntries(raw: unknown): ReplacementEntry[] {
  if (!Array.isArray(raw)) return []

  const entries: ReplacementEntry[] = []

  raw.forEach((item, index) => {
    if (entries.length >= DICTATION_LIMITS.replacementEntries) return
    if (!isRecord(item)) return

    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!title || !content) return

    entries.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `replacement-${index + 1}`,
      title: title.slice(0, DICTATION_LIMITS.replacementTitleChars),
      content: content.slice(0, DICTATION_LIMITS.replacementContentChars)
    })
  })

  return entries
}

/** Turns anything into a fully valid {@link DictationSettings}. */
export function normalizeDictationSettings(raw: unknown): DictationSettings {
  const source = isRecord(raw) ? raw : {}
  const writingContexts = normalizeWritingContexts(source.writingContexts)

  const selectedPresets: Record<WritingContextType, WritingStylePresetId> = {
    personal_chat: 'formal',
    work_chat: 'formal',
    email: 'formal',
    other: 'formal'
  }
  for (const context of writingContexts) {
    selectedPresets[context.type] = getPresetIdForStructure(context.structure)
  }

  return {
    polishStyle: isPolishStyle(source.polishStyle) ? source.polishStyle : DEFAULT_POLISH_STYLE,
    activeContextType: isWritingContextType(source.activeContextType)
      ? source.activeContextType
      : 'personal_chat',
    writingContexts,
    selectedPresets,
    spellingEntries: normalizeSpellingEntries(source.spellingEntries),
    replacementEntries: normalizeReplacementEntries(source.replacementEntries),
    showSpellingExamples:
      typeof source.showSpellingExamples === 'boolean' ? source.showSpellingExamples : true,
    showReplacementExamples:
      typeof source.showReplacementExamples === 'boolean' ? source.showReplacementExamples : true
  }
}
