import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICTATION_SETTINGS,
  DEFAULT_POLISH_STYLE,
  DEFAULT_WRITING_CONTEXTS,
  DICTATION_LIMITS,
  FORMAL_STRUCTURE,
  WRITING_CONTEXT_TYPES,
  WRITING_STYLE_PRESET_IDS,
  getPresetIdForStructure,
  getStructureForPreset,
  isPolishStyle,
  isWritingContextType,
  normalizeDictationSettings,
  normalizeWritingContexts,
  normalizeWritingStructure,
  presetsForContext
} from './dictation'

describe('dictation defaults', () => {
  it('defaults to the light polish style and a personal chat context', () => {
    expect(DEFAULT_POLISH_STYLE).toBe('light')
    expect(DEFAULT_DICTATION_SETTINGS.polishStyle).toBe('light')
    expect(DEFAULT_DICTATION_SETTINGS.activeContextType).toBe('personal_chat')
  })

  it('ships all four contexts, each unassigned and formal', () => {
    expect(DEFAULT_DICTATION_SETTINGS.writingContexts).toHaveLength(4)
    expect(DEFAULT_DICTATION_SETTINGS.writingContexts.map((context) => context.type)).toEqual([
      ...WRITING_CONTEXT_TYPES
    ])
    for (const context of DEFAULT_DICTATION_SETTINGS.writingContexts) {
      expect(context.structure).toEqual(FORMAL_STRUCTURE)
      expect(context.assignedApps).toEqual([])
    }
  })

  it('defaults every context preset to formal and both example flags on', () => {
    expect(DEFAULT_DICTATION_SETTINGS.selectedPresets).toEqual({
      personal_chat: 'formal',
      work_chat: 'formal',
      email: 'formal',
      other: 'formal'
    })
    expect(DEFAULT_DICTATION_SETTINGS.spellingEntries).toEqual([])
    expect(DEFAULT_DICTATION_SETTINGS.replacementEntries).toEqual([])
    expect(DEFAULT_DICTATION_SETTINGS.showSpellingExamples).toBe(true)
    expect(DEFAULT_DICTATION_SETTINGS.showReplacementExamples).toBe(true)
  })

  it('returns a fresh structure for each call so callers cannot corrupt presets', () => {
    const structure = getStructureForPreset('casual')
    structure.capitalization = 'never'

    expect(getStructureForPreset('casual')).toEqual({
      capitalization: 'auto',
      sentenceEndings: 'light',
      exclamation: 'off',
      greeting: 'inline'
    })
    expect(FORMAL_STRUCTURE).toEqual({
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    })
  })

  it('guards the known id unions', () => {
    expect(isPolishStyle('polished')).toBe(true)
    expect(isPolishStyle('fancy')).toBe(false)
    expect(isWritingContextType('email')).toBe(true)
    expect(isWritingContextType('meeting')).toBe(false)
  })
})

describe('preset helpers', () => {
  it('maps each preset to its structure', () => {
    expect(getStructureForPreset('formal')).toEqual(FORMAL_STRUCTURE)
    expect(getStructureForPreset('veryCasual')).toEqual({
      capitalization: 'never',
      sentenceEndings: 'none',
      exclamation: 'off',
      greeting: 'inline'
    })
    expect(getStructureForPreset('excited')).toEqual({
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'on',
      greeting: 'newline'
    })
    expect(WRITING_STYLE_PRESET_IDS).toEqual(['formal', 'casual', 'veryCasual', 'excited'])
  })

  it('matches a preset exactly on capitalization, endings and exclamation', () => {
    expect(
      getPresetIdForStructure({
        capitalization: 'never',
        sentenceEndings: 'none',
        exclamation: 'off',
        greeting: 'inline'
      })
    ).toBe('veryCasual')
  })

  it('ignores the greeting when matching', () => {
    expect(
      getPresetIdForStructure({
        capitalization: 'always',
        sentenceEndings: 'proper',
        exclamation: 'off',
        greeting: 'inline'
      })
    ).toBe('formal')
    expect(
      getPresetIdForStructure({ capitalization: 'always', sentenceEndings: 'proper', exclamation: 'off' })
    ).toBe('formal')
  })

  it('falls back to a fuzzy match on capitalization and endings', () => {
    expect(
      getPresetIdForStructure({
        capitalization: 'auto',
        sentenceEndings: 'light',
        exclamation: 'on'
      })
    ).toBe('casual')
  })

  it('falls back to formal when nothing matches', () => {
    expect(getPresetIdForStructure({ capitalization: 'always', sentenceEndings: 'none' })).toBe('formal')
    expect(getPresetIdForStructure(undefined)).toBe('formal')
  })

  it('hides very casual everywhere but personal chat', () => {
    expect(presetsForContext('personal_chat')).toEqual([...WRITING_STYLE_PRESET_IDS])
    for (const type of ['work_chat', 'email', 'other'] as const) {
      expect(presetsForContext(type)).toEqual(['formal', 'casual', 'excited'])
    }
  })
})

describe('normalizeWritingStructure', () => {
  it('accepts the legacy exclamation values', () => {
    expect(normalizeWritingStructure({ exclamation: 'normal' }, 'personal_chat').exclamation).toBe('on')
    expect(normalizeWritingStructure({ exclamation: 'minimize' }, 'personal_chat').exclamation).toBe('off')
  })

  it('falls back to formal fields for invalid values', () => {
    expect(
      normalizeWritingStructure(
        {
          capitalization: 'sometimes',
          sentenceEndings: 'bare',
          exclamation: 'loud'
        },
        'work_chat'
      )
    ).toEqual({ capitalization: 'always', sentenceEndings: 'proper', exclamation: 'off', greeting: 'inline' })
  })

  it('defaults a missing greeting to newline for email and inline otherwise', () => {
    expect(normalizeWritingStructure({}, 'email').greeting).toBe('newline')
    expect(normalizeWritingStructure({}, 'other').greeting).toBe('inline')
    expect(normalizeWritingStructure({ greeting: 'sideways' }, 'email').greeting).toBe('newline')
  })

  it('accepts every valid field', () => {
    expect(
      normalizeWritingStructure(
        { capitalization: 'never', sentenceEndings: 'none', exclamation: 'on', greeting: 'inline' },
        'email'
      )
    ).toEqual({ capitalization: 'never', sentenceEndings: 'none', exclamation: 'on', greeting: 'inline' })
  })

  it('tolerates non-object input', () => {
    expect(normalizeWritingStructure(null, 'personal_chat')).toEqual({
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'inline'
    })
  })
})

describe('normalizeWritingContexts', () => {
  it('back-fills missing contexts in canonical order', () => {
    const contexts = normalizeWritingContexts([{ type: 'email' }])

    expect(contexts.map((context) => context.type)).toEqual([...WRITING_CONTEXT_TYPES])
    expect(contexts.find((context) => context.type === 'email')?.structure).toEqual(FORMAL_STRUCTURE)
    expect(contexts.find((context) => context.type === 'other')?.structure).toEqual(FORMAL_STRUCTURE)
  })

  it('defaults a present context without a structure by context type', () => {
    const contexts = normalizeWritingContexts([{ type: 'work_chat' }])

    expect(contexts.find((context) => context.type === 'work_chat')?.structure).toEqual({
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'inline'
    })
  })

  it('ignores unknown context types', () => {
    const contexts = normalizeWritingContexts([{ type: 'meeting', assignedApps: ['Zoom'] }])

    expect(contexts).toHaveLength(4)
    expect(contexts.some((context) => (context.type as string) === 'meeting')).toBe(false)
    expect(contexts.flatMap((context) => context.assignedApps)).toEqual([])
  })

  it('trims, drops junk, dedupes case-insensitively and caps assigned apps', () => {
    const contexts = normalizeWritingContexts([
      { type: 'personal_chat', assignedApps: [' Slack ', 'slack', '', 42, null, 'Discord'] }
    ])

    expect(contexts.find((context) => context.type === 'personal_chat')?.assignedApps).toEqual([
      'Slack',
      'Discord'
    ])
  })

  it('caps the assigned apps per context', () => {
    const apps = Array.from({ length: DICTATION_LIMITS.assignedAppsPerContext + 10 }, (_, index) => `App ${index}`)
    const contexts = normalizeWritingContexts([{ type: 'work_chat', assignedApps: apps }])

    expect(contexts.find((context) => context.type === 'work_chat')?.assignedApps).toHaveLength(
      DICTATION_LIMITS.assignedAppsPerContext
    )
  })

  it('keeps an app in a single context, first canonical context wins', () => {
    const contexts = normalizeWritingContexts([
      { type: 'email', assignedApps: ['Slack', 'Gmail'] },
      { type: 'personal_chat', assignedApps: ['Slack', 'Messages'] }
    ])

    expect(contexts.find((context) => context.type === 'personal_chat')?.assignedApps).toEqual([
      'Slack',
      'Messages'
    ])
    expect(contexts.find((context) => context.type === 'email')?.assignedApps).toEqual(['Gmail'])
  })

  it('accepts an envelope with contexts and an appToContext map', () => {
    const contexts = normalizeWritingContexts({
      contexts: [{ type: 'work_chat' }],
      appToContext: { Slack: 'work_chat', Notion: 'personal_chat', Chrome: 'browser' }
    })

    expect(contexts.find((context) => context.type === 'work_chat')?.assignedApps).toEqual(['Slack'])
    expect(contexts.find((context) => context.type === 'personal_chat')?.assignedApps).toEqual(['Notion'])
    expect(contexts.flatMap((context) => context.assignedApps)).not.toContain('Chrome')
  })

  it('tolerates non-array, non-envelope input', () => {
    expect(normalizeWritingContexts(undefined)).toEqual(DEFAULT_WRITING_CONTEXTS)
    expect(normalizeWritingContexts('nope')).toEqual(DEFAULT_WRITING_CONTEXTS)
  })
})

describe('normalizeDictationSettings', () => {
  it('returns the defaults for junk input', () => {
    expect(normalizeDictationSettings(undefined)).toEqual(DEFAULT_DICTATION_SETTINGS)
    expect(normalizeDictationSettings(null)).toEqual(DEFAULT_DICTATION_SETTINGS)
    expect(normalizeDictationSettings({ polishStyle: 'fancy', activeContextType: 'meeting' })).toEqual(
      DEFAULT_DICTATION_SETTINGS
    )
  })

  it('returns fresh objects so defaults never share mutable state', () => {
    const settings = normalizeDictationSettings(DEFAULT_DICTATION_SETTINGS)
    settings.writingContexts[0].structure.capitalization = 'never'
    settings.writingContexts[0].assignedApps.push('Slack')

    expect(DEFAULT_DICTATION_SETTINGS.writingContexts[0].structure.capitalization).toBe('always')
    expect(DEFAULT_DICTATION_SETTINGS.writingContexts[0].assignedApps).toEqual([])
  })

  it('derives selected presets from each context structure', () => {
    const settings = normalizeDictationSettings({
      writingContexts: [
        {
          type: 'personal_chat',
          structure: { capitalization: 'never', sentenceEndings: 'none', exclamation: 'off', greeting: 'inline' }
        }
      ],
      selectedPresets: { personal_chat: 'excited', other: 'excited' }
    })

    expect(settings.selectedPresets).toEqual({
      personal_chat: 'veryCasual',
      work_chat: 'formal',
      email: 'formal',
      other: 'formal'
    })
  })

  it('normalizes spelling entries', () => {
    const settings = normalizeDictationSettings({
      spellingEntries: [
        {
          text: '  Kestrel  ',
          description: '  a description that runs well past the limit  ',
          auto_added: 1
        },
        { text: '   ' },
        'nope',
        { text: 'kestrel', id: 'duplicate' },
        { text: 'Groq', id: 'custom', description: '   ' }
      ]
    })

    expect(settings.spellingEntries).toEqual([
      {
        id: 'spelling-1',
        text: 'Kestrel',
        description: 'a description that runs well p',
        auto_added: true
      },
      { id: 'custom', text: 'Groq', description: undefined, auto_added: false }
    ])
    expect(settings.spellingEntries[0].description).toHaveLength(DICTATION_LIMITS.spellingDescriptionChars)
  })

  it('caps the spelling entries', () => {
    const entries = Array.from({ length: DICTATION_LIMITS.spellingEntries + 5 }, (_, index) => ({
      text: `word ${index}`
    }))

    expect(normalizeDictationSettings({ spellingEntries: entries }).spellingEntries).toHaveLength(
      DICTATION_LIMITS.spellingEntries
    )
  })

  it('normalizes replacement entries', () => {
    const settings = normalizeDictationSettings({
      replacementEntries: [
        { title: '  sig  ', content: `  ${'x'.repeat(7000)}  ` },
        { title: '', content: 'orphan' },
        { title: 'orphan', content: '   ' },
        null
      ]
    })

    expect(settings.replacementEntries).toHaveLength(1)
    expect(settings.replacementEntries[0].id).toBe('replacement-1')
    expect(settings.replacementEntries[0].title).toBe('sig')
    expect(settings.replacementEntries[0].content).toHaveLength(DICTATION_LIMITS.replacementContentChars)
  })

  it('truncates long replacement titles and caps the list', () => {
    const entries = Array.from({ length: DICTATION_LIMITS.replacementEntries + 5 }, (_, index) => ({
      title: `${index} ${'t'.repeat(60)}`,
      content: 'body'
    }))
    const settings = normalizeDictationSettings({ replacementEntries: entries })

    expect(settings.replacementEntries).toHaveLength(DICTATION_LIMITS.replacementEntries)
    expect(settings.replacementEntries[0].title).toHaveLength(DICTATION_LIMITS.replacementTitleChars)
  })

  it('defaults the example flags to true unless explicitly false', () => {
    expect(normalizeDictationSettings({}).showSpellingExamples).toBe(true)
    expect(normalizeDictationSettings({ showSpellingExamples: 'yes' }).showSpellingExamples).toBe(true)
    expect(normalizeDictationSettings({ showSpellingExamples: false }).showSpellingExamples).toBe(false)
    expect(normalizeDictationSettings({ showReplacementExamples: false }).showReplacementExamples).toBe(false)
    expect(normalizeDictationSettings({ showReplacementExamples: 0 }).showReplacementExamples).toBe(true)
  })

  it('keeps a valid polish style and active context', () => {
    const settings = normalizeDictationSettings({ polishStyle: 'polished', activeContextType: 'email' })

    expect(settings.polishStyle).toBe('polished')
    expect(settings.activeContextType).toBe('email')
  })
})
