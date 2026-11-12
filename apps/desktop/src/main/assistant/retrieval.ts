/**
 * Local embedding-based tool retrieval for Kestrel's planner.
 *
 * The planner can send every tool to the model in one request, which makes
 * large MCP tool sets expensive and slow. This module narrows the *non-built-in*
 * tools to the few most relevant to a transcript, using a small local embedding
 * model (``BAAI/bge-small-en-v1.5``) when one is available and a deterministic
 * keyword fallback otherwise.
 *
 * The built-in tools are always included, so core behaviour never depends on
 * retrieval. Retrieval is best-effort: it never raises into planning.
 */

import { builtinToolNames } from './tools'
import type { ToolSpec } from './types'

export const DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-small-en-v1.5'
export const DEFAULT_TOP_K = 10

// Values that turn retrieval off. Retrieval is enabled by default.
const FALSY: ReadonlySet<string> = new Set(['0', 'false', 'off', 'no'])

// Small, conservative stopword set. Tokens are lowercased and split on any
// non-alphanumeric run, so snake_case names fall apart into useful words.
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'my',
  'me',
  'i',
  'you',
  'it',
  'this',
  'that',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'and',
  'or',
  'is',
  'are',
  'was',
  'be',
  'with',
  'please',
  'can',
  'do',
  'does',
  'from',
  'into',
  'by',
  'as',
  'using'
])

const TOKEN_SPLIT = /[^a-z0-9]+/

export type Fingerprint = readonly [string, string, string]

export class EmbedderUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbedderUnavailable'
  }
}

export interface Embedder {
  embed(texts: string[]): number[][]
}

export type EmbedderLoader = () => Embedder

const NO_BACKEND_MESSAGE = 'fastembed is not installed: module not found'

export class FastEmbedEmbedder implements Embedder {
  readonly modelName: string
  private readonly loader: EmbedderLoader | null
  private model: Embedder | null = null

  constructor(modelName: string = DEFAULT_EMBEDDING_MODEL, loader?: EmbedderLoader) {
    this.modelName = modelName
    this.loader = loader ?? null
  }

  embed(texts: string[]): number[][] {
    if (texts.length === 0) {
      return []
    }
    const model = this.loadModel()
    let vectors: number[][]
    try {
      vectors = model.embed([...texts])
    } catch (error) {
      if (error instanceof EmbedderUnavailable) {
        throw error
      }
      throw new EmbedderUnavailable(
        `embedding failed (${errorName(error)})`
      )
    }
    return vectors.map((vector) => vector.map((value) => Number(value)))
  }

  private loadModel(): Embedder {
    if (this.model !== null) {
      return this.model
    }
    if (this.loader === null) {
      throw new EmbedderUnavailable(NO_BACKEND_MESSAGE)
    }
    try {
      this.model = this.loader()
    } catch (error) {
      if (error instanceof EmbedderUnavailable) {
        throw error
      }
      throw new EmbedderUnavailable(
        `could not load embedding model '${this.modelName}' ` +
          `(${errorName(error)})`
      )
    }
    return this.model
  }
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.constructor.name) {
    return error.constructor.name
  }
  return typeof error
}

export interface ToolSelectorOptions {
  embedder?: Embedder | null
  topK?: number
  alwaysInclude?: Iterable<string>
}

export class ToolSelector {
  private embedder: Embedder | null
  readonly topK: number
  private readonly alwaysInclude: Set<string>
  private readonly toolCache = new Map<string, number[]>()

  constructor(options: ToolSelectorOptions = {}) {
    this.embedder = options.embedder ?? null
    this.topK = options.topK ?? DEFAULT_TOP_K
    this.alwaysInclude = new Set(options.alwaysInclude ?? [])
  }

  /**
   * Always offer these tools, no matter the transcript or `topK`.
   *
   * Used for tools that must never be filtered out — the built-ins, and every
   * tool from a connected app the user has authorised. Empty names are ignored.
   */
  pin(...names: string[]): void {
    for (const name of names) {
      if (name) this.alwaysInclude.add(name)
    }
  }

  select(transcript: string, specs: ToolSpec[]): ToolSpec[] {
    if (specs.length === 0) {
      return []
    }

    const candidates = specs.filter(
      (spec) => !this.alwaysInclude.has(spec.name)
    )
    const pinned = specs.filter((spec) => this.alwaysInclude.has(spec.name))

    let chosen: ToolSpec[] = []
    if (this.topK > 0 && candidates.length > 0) {
      chosen = this.rank(transcript, candidates).slice(0, this.topK)
    }

    const selectedNames = new Set(pinned.map((spec) => spec.name))
    for (const spec of chosen) {
      selectedNames.add(spec.name)
    }
    return specs.filter((spec) => selectedNames.has(spec.name))
  }

  private rank(transcript: string, candidates: ToolSpec[]): ToolSpec[] {
    if (this.embedder === null || !transcript.trim()) {
      return keywordRank(transcript, candidates)
    }
    try {
      return this.vectorRank(transcript, candidates)
    } catch {
      // Never break planning: disable the embedder and use keywords instead.
      this.embedder = null
      return keywordRank(transcript, candidates)
    }
  }

  private vectorRank(transcript: string, candidates: ToolSpec[]): ToolSpec[] {
    const embedder = this.embedder
    if (embedder === null) {
      throw new EmbedderUnavailable('embedder is not available')
    }
    const vectors = this.toolVectors(candidates)
    const queryVectors = embedder.embed([transcript])
    if (queryVectors.length === 0) {
      throw new EmbedderUnavailable('embedder returned no transcript vector')
    }
    const query = queryVectors[0]

    const scored = Array.from(candidates.keys()).sort((left, right) => {
      const leftScore = cosine(query, vectors[left])
      const rightScore = cosine(query, vectors[right])
      if (leftScore !== rightScore) {
        return rightScore - leftScore
      }
      return left - right
    })
    return scored.map((index) => candidates[index])
  }

  private toolVectors(specs: ToolSpec[]): number[][] {
    const embedder = this.embedder
    if (embedder === null) {
      throw new EmbedderUnavailable('embedder is not available')
    }

    const missing: Array<{ key: string; text: string }> = []
    const seen = new Set<string>()
    for (const spec of specs) {
      const key = fingerprintKey(fingerprint(spec))
      if (this.toolCache.has(key) || seen.has(key)) {
        continue
      }
      seen.add(key)
      missing.push({ key, text: toolText(spec) })
    }

    if (missing.length > 0) {
      const embedded = embedder.embed(missing.map((item) => item.text))
      if (embedded.length !== missing.length) {
        throw new EmbedderUnavailable(
          'embedder returned the wrong number of tool vectors'
        )
      }
      for (let index = 0; index < missing.length; index += 1) {
        this.toolCache.set(missing[index].key, embedded[index])
      }
    }

    return specs.map((spec) => {
      const vector = this.toolCache.get(fingerprintKey(fingerprint(spec)))
      if (vector === undefined) {
        throw new EmbedderUnavailable('tool embedding is missing')
      }
      return vector
    })
  }
}

export function fingerprint(spec: ToolSpec): Fingerprint {
  return [spec.name, spec.description, spec.actionLabel ?? '']
}

function fingerprintKey(value: Fingerprint): string {
  return value.join('\u0000')
}

export function toolText(spec: ToolSpec): string {
  const parts = [spec.name, spec.description]
  if (spec.actionLabel) {
    parts.push(spec.actionLabel)
  }
  return parts.filter(Boolean).join(' ')
}

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const raw of text.toLowerCase().split(TOKEN_SPLIT)) {
    if (raw && !STOPWORDS.has(raw)) {
      tokens.add(raw)
    }
  }
  return tokens
}

export function specTokens(spec: ToolSpec): Set<string> {
  const tokens = tokenize(spec.name)
  for (const token of tokenize(spec.description)) {
    tokens.add(token)
  }
  if (spec.actionLabel) {
    for (const token of tokenize(spec.actionLabel)) {
      tokens.add(token)
    }
  }
  return tokens
}

export function keywordRank(
  transcript: string,
  candidates: ToolSpec[]
): ToolSpec[] {
  const query = tokenize(transcript)
  const scored = Array.from(candidates.keys()).sort((left, right) => {
    const leftScore = intersectionSize(query, specTokens(candidates[left]))
    const rightScore = intersectionSize(query, specTokens(candidates[right]))
    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }
    return left - right
  })
  return scored.map((index) => candidates[index])
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const token of left) {
    if (right.has(token)) {
      count += 1
    }
  }
  return count
}

export function cosine(left: readonly number[], right: readonly number[]): number {
  if (
    left.length === 0 ||
    right.length === 0 ||
    left.length !== right.length
  ) {
    return 0
  }
  let dot = 0
  let leftSum = 0
  let rightSum = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftSum += left[index] * left[index]
    rightSum += right[index] * right[index]
  }
  const leftNorm = Math.sqrt(leftSum)
  const rightNorm = Math.sqrt(rightSum)
  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }
  return dot / (leftNorm * rightNorm)
}

export function selectorFromEnv(): ToolSelector | null {
  const raw = process.env.KESTREL_TOOL_RETRIEVAL
  if (raw !== undefined && FALSY.has(raw.trim().toLowerCase())) {
    return null
  }

  let topK = DEFAULT_TOP_K
  const rawTopK = (process.env.KESTREL_TOOL_TOP_K ?? '').trim()
  if (rawTopK) {
    if (/^[+-]?\d+$/.test(rawTopK)) {
      const parsed = Number.parseInt(rawTopK, 10)
      if (Number.isFinite(parsed)) {
        topK = parsed
      }
    }
  }

  // No fastembed backend ships with the desktop app, so the default selector
  // uses the deterministic keyword fallback instead of loading a model.
  return new ToolSelector({
    embedder: null,
    topK,
    alwaysInclude: builtinToolNames()
  })
}
