import {
  DEFAULT_STRUCTURES,
  type WritingContextType,
  type WritingStructure
} from './window-context'
import type { PolishStyle } from '../../shared/dictation'

export type { PolishStyle }

export interface PolishDictionaryEntry {
  text: string
  description?: string
}

export interface PolishOptions {
  style?: PolishStyle
  structure?: Partial<WritingStructure>
  contextType?: WritingContextType
  replacements?: Record<string, string>
  shortcuts?: Record<string, string>
  dictionary?: PolishDictionaryEntry[]
}

function startsWithUrlOrPath(text: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ||
    /^www\./i.test(text) ||
    /^(?:mailto|file|data):/i.test(text) ||
    /^[a-z]:[\\/]/i.test(text) ||
    /^(?:\.{1,2}[\\/]|\\\\|\/)/.test(text)
  )
}

function capitalizeFirstLetter(text: string): string {
  const first = text.charAt(0)
  return first.toUpperCase() + text.slice(1)
}

/** Leading character of a phrase match: start of text, or the delimiter before it. */
const PHRASE_BOUNDARY_START = '(^|[^\\p{L}\\p{N}])'
/** A phrase only matches as a whole word, so "fig ma" never bites into "fig magma". */
const PHRASE_BOUNDARY_END = '(?![\\p{L}\\p{N}])'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function phrasePattern(phrase: string): RegExp {
  const body = phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('\\s+')

  return new RegExp(`${PHRASE_BOUNDARY_START}(?:${body})${PHRASE_BOUNDARY_END}`, 'giu')
}

/**
 * The dictionary does two jobs, like VoiceOS: spoken descriptions become the
 * stored text ("kay null" -> "Kanuel"), and words already typed in another
 * casing regain their canonical spelling ("github" -> "GitHub"). Replacement
 * text is inserted literally, so `$` never acts as a capture reference.
 */
function applyDictionary(text: string, dictionary?: PolishDictionaryEntry[]): string {
  if (!dictionary || dictionary.length === 0) return text

  const entries = dictionary
    .filter(
      (entry): entry is PolishDictionaryEntry =>
        typeof entry?.text === 'string' && entry.text.trim() !== ''
    )
    .slice()
    .sort((a, b) => (b.description?.trim().length ?? 0) - (a.description?.trim().length ?? 0))

  let result = text

  for (const entry of entries) {
    const description = entry.description?.trim()
    if (!description) continue
    result = result.replace(
      phrasePattern(description),
      (_match, leading: string) => `${leading}${entry.text}`
    )
  }

  for (const entry of entries) {
    result = result.replace(
      phrasePattern(entry.text),
      (_match, leading: string) => `${leading}${entry.text}`
    )
  }

  return result
}

function applyShortcutsAndReplacements(
  text: string,
  shortcuts?: Record<string, string>,
  replacements?: Record<string, string>
): string {
  let result = text

  if (shortcuts) {
    for (const [key, value] of Object.entries(shortcuts)) {
      if (!key) continue
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(
        new RegExp(`(^|\\s)${escaped}(?=\\s|$|[.,!?;:])`, 'gi'),
        (_match, leading: string) => `${leading}${value}`
      )
    }
  }

  if (replacements) {
    for (const [key, value] of Object.entries(replacements)) {
      if (!key) continue
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), () => value)
    }
  }

  return result
}

function removeFillerWords(text: string): string {
  let cleaned = text

  // Remove fillers enclosed by commas or at start/end: "Um, ", ", uh,", ", you know,"
  cleaned = cleaned.replace(/(?:^|\s*,\s*|\s+)\b(?:you know)\b(?:\s*,\s*|\s*)/gi, ' ')
  cleaned = cleaned.replace(/(?:^|\s*,\s*|\s+)\b(?:um|uh|erm|er|ah)\b(?:\s*,\s*|\s*)/gi, ' ')
  // Remove conversational filler "like" when surrounded by commas
  cleaned = cleaned.replace(/(?:^|\s*,\s*)\blike\b(?:\s*,\s*)/gi, ' ')

  cleaned = cleaned.replace(/\s*,\s*,+/g, ',')
  cleaned = cleaned.replace(/^\s*,\s*/, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

function applyCapitalization(text: string, rule: 'always' | 'auto' | 'never'): string {
  if (rule === 'never') {
    return text.toLowerCase()
  }

  // Capitalize start of text and start of sentences after terminal punctuation followed by space or newline
  return text.replace(/(^|[.!?]\s+|\n+\s*)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
}

// Greetings: e.g. "Hi Sarah," or "Hello," or "Dear Team:"
const GREETING_REGEX =
  /^(hi|hello|hey|dear|good morning|good afternoon|good evening)(?:\s+([a-z0-9_-]+))?\s*([,:])\s*(.*)$/i

function applyGreetingAndStructure(
  text: string,
  greetingRule: 'newline' | 'inline',
  sentenceEndingRule: 'proper' | 'light' | 'none',
  exclamationRule: 'on' | 'off'
): string {
  let processed = text

  if (exclamationRule === 'off') {
    processed = processed.replace(/!+/g, '.')
  }

  const greetingMatch = processed.match(GREETING_REGEX)
  let greetingPart = ''
  let bodyPart = processed

  if (greetingMatch) {
    const salutation = capitalizeFirstLetter(greetingMatch[1])
    const name = greetingMatch[2] ? ` ${capitalizeFirstLetter(greetingMatch[2])}` : ''
    const punct = greetingMatch[3]
    greetingPart = `${salutation}${name}${punct}`
    bodyPart = greetingMatch[4]?.trim() || ''
  }

  const formatEndings = (content: string): string => {
    if (sentenceEndingRule === 'none') {
      return content.replace(/\.(?=\s|$)/g, '').replace(/\s+/g, ' ').trim()
    }
    if (sentenceEndingRule === 'proper') {
      return /[.!?]$/.test(content) ? content : `${content}.`
    }
    if (sentenceEndingRule === 'light') {
      const words = content.split(/\s+/).filter(Boolean)
      const hasInternalSentence = /[.!?]\s+/.test(content)
      if (words.length > 12 || hasInternalSentence) {
        return /[.!?]$/.test(content) ? content : `${content}.`
      }
      return content.replace(/\.+$/, '')
    }
    return content
  }

  if (greetingPart) {
    if (!bodyPart) return greetingPart
    const formattedBody = formatEndings(bodyPart)
    if (greetingRule === 'newline') {
      return `${greetingPart}\n\n${formattedBody}`
    }
    return `${greetingPart} ${formattedBody}`
  }

  return formatEndings(processed)
}

export function polishTranscript(raw: string, options?: PolishOptions): string {
  let text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  if (startsWithUrlOrPath(text)) return text

  if (!options) {
    return capitalizeFirstLetter(text)
  }

  // Vocabulary is explicit user intent, not style: it survives
  // `style: 'none'`, and autofill content is inserted literally at the end so
  // the selected writing structure never rewrites a saved link or template.
  if (options.style === 'none') {
    text = applyDictionary(text, options.dictionary)
    return applyShortcutsAndReplacements(text, options.shortcuts, options.replacements)
  }

  // Filler word removal
  if (options.style === 'polished') {
    text = removeFillerWords(text)
  }

  // Resolve structure
  const baseStructure = options.contextType
    ? DEFAULT_STRUCTURES[options.contextType]
    : {
        capitalization: 'auto' as const,
        sentenceEndings: 'light' as const,
        greeting: 'inline' as const,
        exclamation: 'on' as const
      }

  const structure: WritingStructure = {
    capitalization: options.structure?.capitalization ?? baseStructure.capitalization,
    sentenceEndings: options.structure?.sentenceEndings ?? baseStructure.sentenceEndings,
    greeting: options.structure?.greeting ?? baseStructure.greeting,
    exclamation: options.structure?.exclamation ?? baseStructure.exclamation
  }

  text = applyGreetingAndStructure(
    text,
    structure.greeting,
    structure.sentenceEndings,
    structure.exclamation
  )

  text = applyCapitalization(text, structure.capitalization)

  // Taught spellings win over the structure, and autofill stays verbatim.
  text = applyDictionary(text, options.dictionary)
  return applyShortcutsAndReplacements(text, options.shortcuts, options.replacements)
}
