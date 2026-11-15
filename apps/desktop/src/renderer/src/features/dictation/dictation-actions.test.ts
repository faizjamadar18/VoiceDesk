import { describe, expect, it } from 'vitest'
import {
  DICTATION_LIMITS,
  DEFAULT_DICTATION_SETTINGS,
  getStructureForPreset
} from '@shared/dictation'
import type { DictationSettings } from '@shared/dictation'
import { applyDictationAction } from './dictation-actions'

function makeSettings(overrides: Partial<DictationSettings> = {}): DictationSettings {
  return {
    ...structuredClone(DEFAULT_DICTATION_SETTINGS),
    ...overrides
  }
}

describe('applyDictationAction', () => {
  it('selects a polish style', () => {
    const settings = makeSettings()
    const next = applyDictationAction(settings, { type: 'selectPolishStyle', style: 'polished' })

    expect(next.polishStyle).toBe('polished')
    expect(next).not.toBe(settings)
  })

  it('selects the active context', () => {
    const settings = makeSettings()
    const next = applyDictationAction(settings, { type: 'selectContext', contextType: 'email' })

    expect(next.activeContextType).toBe('email')
  })

  it('applies a preset to the active context only', () => {
    const settings = makeSettings({ activeContextType: 'work_chat' })
    const next = applyDictationAction(settings, { type: 'selectPreset', presetId: 'casual' })

    const workChat = next.writingContexts.find((ctx) => ctx.type === 'work_chat')
    const personalChat = next.writingContexts.find((ctx) => ctx.type === 'personal_chat')

    expect(workChat?.structure).toEqual(getStructureForPreset('casual'))
    expect(personalChat?.structure).toEqual(
      settings.writingContexts.find((ctx) => ctx.type === 'personal_chat')?.structure
    )
    expect(next.selectedPresets).toEqual({
      ...settings.selectedPresets,
      work_chat: 'casual'
    })
    expect(next.selectedPresets.personal_chat).toBe(settings.selectedPresets.personal_chat)
  })

  describe('spelling', () => {
    it('trims text and description, keeps the id, and caps the description', () => {
      const settings = makeSettings()
      const next = applyDictationAction(settings, {
        type: 'addSpelling',
        entry: {
          id: 'spelling-1',
          text: '  VoiceOS  ',
          description: `  ${'a'.repeat(60)}  `
        }
      })

      expect(next.spellingEntries).toHaveLength(1)
      expect(next.spellingEntries[0].id).toBe('spelling-1')
      expect(next.spellingEntries[0].text).toBe('VoiceOS')
      expect(next.spellingEntries[0].description).toBe('a'.repeat(DICTATION_LIMITS.spellingDescriptionChars))
    })

    it('drops an empty description', () => {
      const settings = makeSettings()
      const next = applyDictationAction(settings, {
        type: 'addSpelling',
        entry: { id: 'spelling-1', text: 'Claude', description: '   ' }
      })

      expect(next.spellingEntries[0].description).toBeUndefined()
    })

    it('ignores empty text', () => {
      const settings = makeSettings()
      const next = applyDictationAction(settings, {
        type: 'addSpelling',
        entry: { id: 'spelling-1', text: '   ' }
      })

      expect(next.spellingEntries).toHaveLength(0)
    })

    it('ignores case-insensitive duplicates', () => {
      const settings = makeSettings({
        spellingEntries: [{ id: 'existing', text: 'VoiceOS' }]
      })
      const next = applyDictationAction(settings, {
        type: 'addSpelling',
        entry: { id: 'new', text: 'voiceos' }
      })

      expect(next.spellingEntries).toHaveLength(1)
      expect(next.spellingEntries[0].id).toBe('existing')
    })

    it('caps the list length', () => {
      const settings = makeSettings({
        spellingEntries: Array.from({ length: DICTATION_LIMITS.spellingEntries }, (_, i) => ({
          id: `existing-${i}`,
          text: `word-${i}`
        }))
      })
      const next = applyDictationAction(settings, {
        type: 'addSpelling',
        entry: { id: 'overflow', text: 'overflow' }
      })

      expect(next.spellingEntries).toHaveLength(DICTATION_LIMITS.spellingEntries)
      expect(next.spellingEntries.some((entry) => entry.id === 'overflow')).toBe(false)
    })

    it('deletes an entry by id', () => {
      const settings = makeSettings({
        spellingEntries: [
          { id: 'a', text: 'Alpha' },
          { id: 'b', text: 'Beta' }
        ]
      })
      const next = applyDictationAction(settings, { type: 'deleteSpelling', id: 'a' })

      expect(next.spellingEntries).toEqual([{ id: 'b', text: 'Beta' }])
    })

    it('dismisses the examples', () => {
      const settings = makeSettings({ showSpellingExamples: true })
      const next = applyDictationAction(settings, { type: 'dismissSpellingExamples' })

      expect(next.showSpellingExamples).toBe(false)
    })
  })

  describe('replacements', () => {
    it('trims and truncates title and content', () => {
      const settings = makeSettings()
      const next = applyDictationAction(settings, {
        type: 'addReplacement',
        entry: {
          id: 'rep-1',
          title: `  ${'t'.repeat(DICTATION_LIMITS.replacementTitleChars + 10)}  `,
          content: `  ${'c'.repeat(DICTATION_LIMITS.replacementContentChars + 10)}  `
        }
      })

      expect(next.replacementEntries[0].id).toBe('rep-1')
      expect(next.replacementEntries[0].title).toBe('t'.repeat(DICTATION_LIMITS.replacementTitleChars))
      expect(next.replacementEntries[0].content).toBe(
        'c'.repeat(DICTATION_LIMITS.replacementContentChars)
      )
    })

    it('ignores entries with an empty title or content', () => {
      const settings = makeSettings()
      expect(
        applyDictationAction(settings, {
          type: 'addReplacement',
          entry: { id: 'rep-1', title: '  ', content: 'hello' }
        }).replacementEntries
      ).toHaveLength(0)
      expect(
        applyDictationAction(settings, {
          type: 'addReplacement',
          entry: { id: 'rep-2', title: 'hello', content: '  ' }
        }).replacementEntries
      ).toHaveLength(0)
    })

    it('caps the list length', () => {
      const settings = makeSettings({
        replacementEntries: Array.from(
          { length: DICTATION_LIMITS.replacementEntries },
          (_, i) => ({ id: `existing-${i}`, title: `title-${i}`, content: 'content' })
        )
      })
      const next = applyDictationAction(settings, {
        type: 'addReplacement',
        entry: { id: 'overflow', title: 'overflow', content: 'content' }
      })

      expect(next.replacementEntries).toHaveLength(DICTATION_LIMITS.replacementEntries)
      expect(next.replacementEntries.some((entry) => entry.id === 'overflow')).toBe(false)
    })

    it('deletes an entry by id', () => {
      const settings = makeSettings({
        replacementEntries: [
          { id: 'a', title: 'Alpha', content: 'a' },
          { id: 'b', title: 'Beta', content: 'b' }
        ]
      })
      const next = applyDictationAction(settings, { type: 'deleteReplacement', id: 'b' })

      expect(next.replacementEntries).toEqual([{ id: 'a', title: 'Alpha', content: 'a' }])
    })

    it('dismisses the examples', () => {
      const settings = makeSettings({ showReplacementExamples: true })
      const next = applyDictationAction(settings, { type: 'dismissReplacementExamples' })

      expect(next.showReplacementExamples).toBe(false)
    })
  })

  describe('pinned apps', () => {
    it('moves an app out of another context when pinning', () => {
      const settings = makeSettings()
      settings.writingContexts = settings.writingContexts.map((ctx) => {
        if (ctx.type === 'work_chat') return { ...ctx, assignedApps: ['Slack', 'Teams'] }
        if (ctx.type === 'personal_chat') return { ...ctx, assignedApps: ['Messages'] }
        return ctx
      })

      const next = applyDictationAction(settings, {
        type: 'pinApp',
        contextType: 'personal_chat',
        appName: '  slack  '
      })

      expect(
        next.writingContexts.find((ctx) => ctx.type === 'personal_chat')?.assignedApps
      ).toEqual(['Messages', 'slack'])
      expect(
        next.writingContexts.find((ctx) => ctx.type === 'work_chat')?.assignedApps
      ).toEqual(['Teams'])
    })

    it('does not duplicate a case variant already in the target', () => {
      const settings = makeSettings()
      settings.writingContexts = settings.writingContexts.map((ctx) =>
        ctx.type === 'personal_chat' ? { ...ctx, assignedApps: ['Messages', 'WhatsApp'] } : ctx
      )

      const next = applyDictationAction(settings, {
        type: 'pinApp',
        contextType: 'personal_chat',
        appName: 'messages'
      })

      expect(
        next.writingContexts.find((ctx) => ctx.type === 'personal_chat')?.assignedApps
      ).toEqual(['WhatsApp', 'messages'])
    })

    it('ignores an empty app name', () => {
      const settings = makeSettings()
      const next = applyDictationAction(settings, {
        type: 'pinApp',
        contextType: 'personal_chat',
        appName: '   '
      })

      expect(next.writingContexts).toEqual(settings.writingContexts)
    })

    it('caps the apps per context', () => {
      const settings = makeSettings()
      settings.writingContexts = settings.writingContexts.map((ctx) =>
        ctx.type === 'personal_chat'
          ? {
              ...ctx,
              assignedApps: Array.from(
                { length: DICTATION_LIMITS.assignedAppsPerContext },
                (_, i) => `app-${i}`
              )
            }
          : ctx
      )

      const next = applyDictationAction(settings, {
        type: 'pinApp',
        contextType: 'personal_chat',
        appName: 'overflow'
      })

      const apps = next.writingContexts.find((ctx) => ctx.type === 'personal_chat')?.assignedApps
      expect(apps).toHaveLength(DICTATION_LIMITS.assignedAppsPerContext)
      expect(apps).not.toContain('overflow')
    })

    it('unpins only from the given context, matching case-insensitively', () => {
      const settings = makeSettings()
      settings.writingContexts = settings.writingContexts.map((ctx) => {
        if (ctx.type === 'work_chat') return { ...ctx, assignedApps: ['Slack', 'Teams'] }
        if (ctx.type === 'personal_chat') return { ...ctx, assignedApps: ['Slack'] }
        return ctx
      })

      const next = applyDictationAction(settings, {
        type: 'unpinApp',
        contextType: 'work_chat',
        appName: 'slack'
      })

      expect(
        next.writingContexts.find((ctx) => ctx.type === 'work_chat')?.assignedApps
      ).toEqual(['Teams'])
      expect(
        next.writingContexts.find((ctx) => ctx.type === 'personal_chat')?.assignedApps
      ).toEqual(['Slack'])
    })
  })

  it('never mutates the input settings', () => {
    const settings = makeSettings({
      spellingEntries: [{ id: 'a', text: 'Alpha' }],
      replacementEntries: [{ id: 'r', title: 'Title', content: 'Content' }]
    })
    const snapshot = structuredClone(settings)

    applyDictationAction(settings, { type: 'selectPolishStyle', style: 'none' })
    applyDictationAction(settings, { type: 'selectContext', contextType: 'email' })
    applyDictationAction(settings, { type: 'selectPreset', presetId: 'excited' })
    applyDictationAction(settings, { type: 'addSpelling', entry: { id: 'b', text: 'Beta' } })
    applyDictationAction(settings, { type: 'deleteSpelling', id: 'a' })
    applyDictationAction(settings, { type: 'dismissSpellingExamples' })
    applyDictationAction(settings, {
      type: 'addReplacement',
      entry: { id: 'r2', title: 'T', content: 'C' }
    })
    applyDictationAction(settings, { type: 'deleteReplacement', id: 'r' })
    applyDictationAction(settings, { type: 'dismissReplacementExamples' })
    applyDictationAction(settings, {
      type: 'pinApp',
      contextType: 'personal_chat',
      appName: 'Slack'
    })
    applyDictationAction(settings, {
      type: 'unpinApp',
      contextType: 'personal_chat',
      appName: 'Slack'
    })

    expect(settings).toEqual(snapshot)
  })
})
