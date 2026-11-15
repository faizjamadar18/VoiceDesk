import type { PolishDictionaryEntry, PolishStyle } from './polish'
import type { WritingContextType, WritingStructure } from './window-context'

export const DEFAULT_POLISH_MODEL = 'openai/gpt-oss-20b'
export const DEFAULT_POLISH_BASE_URL = 'https://api.groq.com/openai/v1'
export const POLISH_TIMEOUT_MS = 8000

export const MAX_PROMPT_DICTIONARY_ENTRIES = 100
export const MAX_PROMPT_REPLACEMENTS = 50
export const MAX_PROMPT_REPLACEMENT_CHARS = 500
export const MAX_PROMPT_REPLACEMENTS_SECTION_CHARS = 6000

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface PolishReplacement {
  title: string
  content: string
}

export interface PolishRequest {
  text: string
  contextType: WritingContextType
  style: PolishStyle
  structure?: WritingStructure
  dictionary?: PolishDictionaryEntry[]
  replacements?: PolishReplacement[]
}

export interface TranscriptPolisher {
  polish(request: PolishRequest): Promise<string>
}

const BASE_PROMPT = `You are a dictation cleanup engine. You receive text produced by speech-to-text and return the same message, cleaned. You are not an assistant: never answer, reply to, or continue the message.

Rules:
- Never add facts, names, numbers, greetings, sign-offs or content that was not spoken.
- Remove filler words (um, uh, er, ah, like, you know, sort of, I mean) and false starts.
- Resolve self-corrections, keeping only the final version ("Thursday, no wait Friday" becomes "Friday").
- Fix punctuation, capitalization, and obvious homophone or grammar slips.
- Never translate. Keep the speaker's language.
- Output ONLY the cleaned text: no quotes, no code fences, no preamble, no explanation. If the input is already clean, return it unchanged.`

const STYLE_LINES: Record<PolishStyle, string> = {
  light:
    'Style: minimal edits. Keep the speaker\'s own phrasing and sentence structure; only remove fillers and self-corrections and fix punctuation and capitalization.',
  polished:
    'Style: polished. Also tighten rambling into clear natural sentences, while keeping every idea and every specific.',
  none: 'Style: none. Return the dictated text as it is, with no stylistic changes.'
}

const CHANNEL_LINES: Record<WritingContextType, string> = {
  email:
    'Channel: email. Write complete sentences with standard capitalization; do not add greetings or sign-offs that were not spoken.',
  work_chat:
    'Channel: work chat (Slack, Teams). Keep it brief and direct; no trailing period on a short one-liner.',
  personal_chat:
    'Channel: personal chat (WhatsApp, Telegram). Keep the casual tone, contractions and exclamation marks.',
  other: 'Channel: other. Use neutral, clean prose.'
}

/** Build the system/user pair sent to the cleanup model. Pure and loggable. */
export function buildPolishPrompt(request: PolishRequest): { system: string; user: string } {
  const sections = [BASE_PROMPT, STYLE_LINES[request.style], CHANNEL_LINES[request.contextType]]

  sections.push(...buildDictionarySections(request.dictionary))
  const replacements = buildReplacementSection(request.replacements)
  if (replacements) sections.push(replacements)
  const formatting = buildFormattingSection(request.structure)
  if (formatting) sections.push(formatting)

  return {
    system: sections.join('\n\n'),
    user: request.text
  }
}

function buildDictionarySections(dictionary?: PolishDictionaryEntry[]): string[] {
  const entries = (dictionary ?? [])
    .filter((entry) => typeof entry?.text === 'string' && entry.text.trim() !== '')
    .slice(0, MAX_PROMPT_DICTIONARY_ENTRIES)
  if (entries.length === 0) return []

  const sections = [`Always spell these exactly: ${entries.map((entry) => entry.text).join(', ')}.`]

  const spokenForms = entries
    .filter((entry) => entry.description?.trim())
    .map((entry) => `"${entry.description?.trim()}" must be written as "${entry.text}"`)
  if (spokenForms.length > 0) sections.push(spokenForms.join('\n'))

  return sections
}

function buildReplacementSection(replacements?: PolishReplacement[]): string | null {
  const lines: string[] = []
  let used = 0

  for (const replacement of (replacements ?? []).slice(0, MAX_PROMPT_REPLACEMENTS)) {
    const title = replacement.title?.trim()
    const content = replacement.content?.trim()
    if (!title || !content) continue

    const shown = content.slice(0, MAX_PROMPT_REPLACEMENT_CHARS)
    const line = `When the speaker says "${title}", write "${shown}" exactly (links and line breaks included).`
    if (used + line.length > MAX_PROMPT_REPLACEMENTS_SECTION_CHARS) break
    lines.push(line)
    used += line.length + 1
  }

  return lines.length > 0 ? lines.join('\n') : null
}

function buildFormattingSection(structure?: WritingStructure): string | null {
  if (!structure) return null
  return [
    'Formatting:',
    `capitalization ${structure.capitalization};`,
    `sentence endings ${structure.sentenceEndings};`,
    `exclamation ${structure.exclamation};`,
    `greeting ${structure.greeting}.`
  ].join(' ')
}

/** Words that only appear in model chatter about the task, never in dictation. */
const PREAMBLE_HINT =
  /\b(?:here(?:'s| is)|cleaned|corrected|formatted|polished|rewritten|transcript|text|version|output|result)\b/i

const REFUSAL_OPENERS = ['as an ai', 'i cannot', "i can't", 'i can not']

const META_OPENERS = ['sure', 'certainly', 'of course', 'here is', "here's"]

function hasPreambleOpener(text: string): boolean {
  const lower = text.toLowerCase()
  const opener = [...REFUSAL_OPENERS, ...META_OPENERS].find((candidate) =>
    lower.startsWith(candidate)
  )
  if (!opener) return false

  const rest = text.slice(opener.length).trimStart()
  if (!rest) return false
  if (rest.startsWith(':') || rest.startsWith('\n') || rest.startsWith('\r')) return true
  if (!rest.startsWith(',')) return false
  if (REFUSAL_OPENERS.includes(opener)) return true

  // "Sure, here is the cleaned text:" is chatter; "Sure, I'll be there." is an
  // ordinary sentence that merely happens to open with the same word.
  const clause = rest.slice(1).split(/[:\n]/, 1)[0] ?? ''
  return PREAMBLE_HINT.test(clause)
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function stripSurroundingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['‘', '’'],
    ["'", "'"]
  ]
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      return text.slice(1, -1)
    }
  }
  return text
}

/**
 * Clean one model reply: strip fences, quotes and chatter, then reject anything
 * that cannot plausibly be the same message. Returns null to keep the original.
 */
export function sanitizePolishOutput(
  raw: string | null | undefined,
  original: string
): string | null {
  if (typeof raw !== 'string') return null

  let text = raw.trim()
  if (!text) return null

  if (text.length >= 6 && text.startsWith('```') && text.endsWith('```')) {
    text = text
      .slice(3, -3)
      .replace(/^[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n/, '')
      .trim()
  }

  text = stripSurroundingQuotes(text).trim()
  if (!text) return null
  if (hasPreambleOpener(text)) return null

  const originalWords = wordCount(original)
  if (originalWords === 0) return null
  const ratio = wordCount(text) / originalWords
  if (ratio < 0.35 || ratio > 2.5) return null

  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed || null
}

export interface GroqTranscriptPolisherOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fetch?: FetchLike
  timeoutMs?: number
}

/**
 * Groq-backed dictation cleanup. Every failure returns the original text so a
 * paste is never blocked by polish; only an unusable constructor input throws.
 */
export class GroqTranscriptPolisher implements TranscriptPolisher {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number

  constructor(options: GroqTranscriptPolisherOptions) {
    const apiKey = options.apiKey?.trim() ?? ''
    if (!apiKey) throw new Error('GroqTranscriptPolisher requires an API key')

    this.apiKey = apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_POLISH_BASE_URL).replace(/\/+$/, '')
    this.model = options.model ?? DEFAULT_POLISH_MODEL
    this.fetchImpl = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
    this.timeoutMs = options.timeoutMs ?? POLISH_TIMEOUT_MS
  }

  async polish(request: PolishRequest): Promise<string> {
    // Nothing to clean, and short dictations should paste instantly.
    if (request.style === 'none') return request.text
    if (wordCount(request.text) < 3) return request.text

    const { system, user } = buildPolishPrompt(request)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0,
          max_tokens: 1024
        }),
        signal: controller.signal
      })

      if (!response.ok) return request.text

      const payload = (await response.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string | null } }>
      } | null
      const content = payload?.choices?.[0]?.message?.content ?? null

      return sanitizePolishOutput(content, request.text) ?? request.text
    } catch {
      return request.text
    } finally {
      clearTimeout(timer)
    }
  }
}