import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STRUCTURES,
  resolveWritingContext,
  resolveWritingContextForSettings
} from './window-context'
import {
  DEFAULT_DICTATION_SETTINGS,
  FORMAL_STRUCTURE,
  normalizeDictationSettings,
  type DictationSettings,
  type WritingContextType,
  type WritingStructure
} from '../../shared/dictation'

const CASUAL: WritingStructure = {
  capitalization: 'auto',
  sentenceEndings: 'light',
  exclamation: 'off',
  greeting: 'inline'
}

function makeSettings(
  contexts: Array<{
    type: WritingContextType
    structure?: WritingStructure
    assignedApps?: string[]
  }> = [],
  extra: Partial<DictationSettings> = {}
): DictationSettings {
  return normalizeDictationSettings({
    ...DEFAULT_DICTATION_SETTINGS,
    writingContexts: contexts.map((context) => ({
      type: context.type,
      structure: context.structure ?? FORMAL_STRUCTURE,
      assignedApps: context.assignedApps ?? []
    })),
    ...extra
  })
}

describe('resolveWritingContextForSettings', () => {
  it('matches a pinned app exactly against a .exe process name', () => {
    const settings = makeSettings([{ type: 'work_chat', assignedApps: ['Mycrm'] }])

    expect(
      resolveWritingContextForSettings({ processName: 'Mycrm.exe' }, settings).type
    ).toBe('work_chat')
  })

  it('matches a pin by its distinctive token', () => {
    const settings = makeSettings([{ type: 'email', assignedApps: ['Teams'] }])

    expect(
      resolveWritingContextForSettings({ appName: 'Microsoft Teams' }, settings).type
    ).toBe('email')
  })

  it('matches a pin against a browser hostname', () => {
    const settings = makeSettings([{ type: 'email', assignedApps: ['Google Chat'] }])

    expect(
      resolveWritingContextForSettings({ url: 'https://chat.google.com/client/abc' }, settings).type
    ).toBe('email')
  })

  it('lets a pinned app override the heuristic classification', () => {
    const settings = makeSettings([{ type: 'email', assignedApps: ['Slack'] }])

    // The heuristic alone classifies Slack as work chat.
    expect(resolveWritingContext({ processName: 'slack.exe', windowTitle: 'Slack' }).type).toBe(
      'work_chat'
    )
    expect(
      resolveWritingContextForSettings(
        { processName: 'slack.exe', windowTitle: 'Slack' },
        settings
      ).type
    ).toBe('email')
  })

  it('falls back to the heuristic when no app is pinned', () => {
    const settings = makeSettings([{ type: 'work_chat', structure: CASUAL }])

    expect(
      resolveWritingContextForSettings({ processName: 'slack.exe', windowTitle: 'Slack' }, settings)
        .type
    ).toBe('work_chat')
  })

  it('takes the structure from settings instead of DEFAULT_STRUCTURES', () => {
    const settings = makeSettings([{ type: 'work_chat', structure: CASUAL }])

    const resolved = resolveWritingContextForSettings({ processName: 'slack.exe' }, settings)

    expect(resolved.structure).toEqual(CASUAL)
    expect(resolved.structure).not.toEqual(DEFAULT_STRUCTURES.work_chat)
  })

  it('resolves a null window to the other context and its configured structure', () => {
    const otherStructure: WritingStructure = {
      capitalization: 'never',
      sentenceEndings: 'none',
      exclamation: 'off',
      greeting: 'inline'
    }
    const settings = makeSettings([{ type: 'other', structure: otherStructure }])

    expect(resolveWritingContextForSettings(null, settings)).toEqual({
      type: 'other',
      structure: otherStructure
    })
  })

  it('returns fresh copies that never alias the settings', () => {
    const settings = makeSettings([{ type: 'work_chat', structure: CASUAL }])
    const stored = settings.writingContexts.find((context) => context.type === 'work_chat')
      ?.structure

    const first = resolveWritingContextForSettings({ processName: 'slack.exe' }, settings)
    const second = resolveWritingContextForSettings({ processName: 'slack.exe' }, settings)

    expect(first.structure).not.toBe(stored)
    expect(second.structure).not.toBe(first.structure)

    first.structure.capitalization = 'never'
    expect(second.structure.capitalization).toBe('auto')
    expect(stored?.capitalization).toBe('auto')
  })

  it('honours custom mappings when no pin matches', () => {
    const settings = makeSettings()

    expect(
      resolveWritingContextForSettings({ processName: 'notepad.exe' }, settings, {
        notepad: 'email'
      }).type
    ).toBe('email')
  })
})
