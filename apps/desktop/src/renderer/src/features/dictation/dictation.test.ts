import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICTATION_SETTINGS,
  DICTIONARY_EXAMPLES,
  POLISH_OPTIONS,
  REPLACEMENT_EXAMPLES,
  WRITING_CONTEXT_TABS,
  getPresetsForContext,
  getPreviewText
} from './dummy-data'
import { getGlassCardStyle } from './PolishingSection'

describe('Dictation Configuration & Dummy Data', () => {
  it('defines the three core polishing levels with matching metadata', () => {
    expect(POLISH_OPTIONS).toHaveLength(3)

    const ids = POLISH_OPTIONS.map((o) => o.id)
    expect(ids).toEqual(['none', 'light', 'polished'])

    const tags = POLISH_OPTIONS.map((o) => o.tag)
    expect(tags).toEqual(['Instant', 'Fast', 'Smart'])

    const lightOption = POLISH_OPTIONS.find((o) => o.id === 'light')
    expect(lightOption?.example).toContain('meeting got moved to Friday')
    expect(lightOption?.annotated).toBe(
      '~~Um~~ ==So== the meeting got moved to ~~thursday no wait~~ ==Friday,== ~~so~~ so we should ~~uh~~ prep the deck before that.'
    )

    const polishedOption = POLISH_OPTIONS.find((o) => o.id === 'polished')
    expect(polishedOption?.annotated).toBe(
      '~~Um so~~ ==The== meeting got moved to ~~thursday no wait~~ ==Friday,== ~~so~~ so we should ~~uh~~ prep the deck ~~before that~~ ==beforehand==.'
    )
  })

  it('computes exact glassCardStyle matching VoiceOS in dark and light modes', () => {
    const unselectedDark = getGlassCardStyle(false, true)
    expect(unselectedDark.background).toBe('var(--dark-preview-background, #1b1c1f)')
    expect(unselectedDark.border).toBe('2px solid transparent')
    expect(unselectedDark.boxShadow).toBe('0 2px 8px rgba(0, 0, 0, 0.22)')

    const selectedDark = getGlassCardStyle(true, true)
    expect(selectedDark.border).toBe('2px solid var(--dark-border-selected, rgba(223, 226, 232, 0.18))')
    expect(selectedDark.boxShadow).toBe('0 3px 10px rgba(0, 0, 0, 0.24)')

    const unselectedLight = getGlassCardStyle(false, false)
    expect(unselectedLight.background).toBe(
      'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))'
    )
    expect(unselectedLight.border).toBe('2px solid transparent')
    expect(unselectedLight.boxShadow).toBe('0 1px 3px rgba(0, 0, 0, 0.055)')

    const selectedLight = getGlassCardStyle(true, false)
    expect(selectedLight.border).toBe('2px solid rgba(100, 116, 139, 0.14)')
    expect(selectedLight.boxShadow).toBe('0 2px 8px rgba(0, 0, 0, 0.06)')
  })

  it('defines four writing destinations matching VoiceOS specification', () => {
    expect(WRITING_CONTEXT_TABS).toHaveLength(4)
    expect(WRITING_CONTEXT_TABS.map((t) => t.id)).toEqual([
      'personal_chat',
      'work_chat',
      'email',
      'other'
    ])
  })

  it('returns four presets for personal chat and three for others', () => {
    const personalPresets = getPresetsForContext('personal_chat')
    expect(personalPresets).toHaveLength(4)
    expect(personalPresets.map((p) => p.id)).toEqual([
      'formal',
      'casual',
      'veryCasual',
      'excited'
    ])

    const workPresets = getPresetsForContext('work_chat')
    expect(workPresets).toHaveLength(3)
    expect(workPresets.map((p) => p.id)).toEqual(['formal', 'casual', 'excited'])
  })

  it('returns expected preview copy for iMessage personal chat presets', () => {
    expect(getPreviewText('personal_chat', 'formal')).toBe(
      "Hey, are you free for coffee tomorrow? Let's meet at 2 if that works for you."
    )
    expect(getPreviewText('personal_chat', 'casual')).toBe(
      "Hey are you free for coffee tomorrow? Let's meet at 2 if that works for you"
    )
    expect(getPreviewText('personal_chat', 'veryCasual')).toBe(
      "hey are you free for coffee tomorrow? let's meet at 2 if that works for you"
    )
    expect(getPreviewText('personal_chat', 'excited')).toBe(
      "Hey, are you free for coffee tomorrow? Let's meet at 2 if that works for you!"
    )
  })

  it('includes exact dictionary example candidates matching VoiceOS', () => {
    const words = DICTIONARY_EXAMPLES.map((e) => e.text)
    expect(words).toEqual(['VoiceOS', 'Claude', 'lmk', 'GTM', 'tmr'])
  })

  it('includes exact replacement candidates matching VoiceOS', () => {
    const titles = REPLACEMENT_EXAMPLES.map((e) => e.title)
    expect(titles).toContain('my calendar link')
    expect(titles).toContain('patent rewrite')
  })

  it('initializes default settings with light polish and formal personal chat preset', () => {
    expect(DEFAULT_DICTATION_SETTINGS.polishStyle).toBe('light')
    expect(DEFAULT_DICTATION_SETTINGS.activeContextType).toBe('personal_chat')
    expect(DEFAULT_DICTATION_SETTINGS.selectedPresets.personal_chat).toBe('formal')
    expect(DEFAULT_DICTATION_SETTINGS.showSpellingExamples).toBe(true)
    expect(DEFAULT_DICTATION_SETTINGS.showReplacementExamples).toBe(true)
  })
})
