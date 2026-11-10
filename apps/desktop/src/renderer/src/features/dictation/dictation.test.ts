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

describe('Dictation Configuration & Dummy Data', () => {
  it('defines the three core polishing levels with matching metadata', () => {
    expect(POLISH_OPTIONS).toHaveLength(3)

    const ids = POLISH_OPTIONS.map((o) => o.id)
    expect(ids).toEqual(['none', 'light', 'polished'])

    const tags = POLISH_OPTIONS.map((o) => o.tag)
    expect(tags).toEqual(['Instant', 'Fast', 'Smart'])

    const lightOption = POLISH_OPTIONS.find((o) => o.id === 'light')
    expect(lightOption?.example).toContain('meeting got moved to Friday')
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
