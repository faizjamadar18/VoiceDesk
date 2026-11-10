import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AboutYouSection } from './AboutYouSection'
import {
  AGENT_SPEED_OPTIONS,
  AGENT_VOICE_OPTIONS,
  DEFAULT_AGENT_SETTINGS,
  INITIAL_ACTIONS,
  getVoiceById
} from './dummy-data'
import {
  PREFERENCES_FILE_MAX_CHARS,
  PREFERENCES_STRINGS,
  PreferencesFileEditor
} from './PreferencesFileEditor'
import type { AgentActionId, AgentMemory, AgentSettings, UserProfile } from './types'

describe('Agent Feature Configuration & Data', () => {
  it('defines the five VoiceOS voices with correct metadata', () => {
    expect(AGENT_VOICE_OPTIONS).toHaveLength(5)

    const names = AGENT_VOICE_OPTIONS.map((v) => v.name)
    expect(names).toEqual(['Sky', 'Dawn', 'Dusk', 'Midnight', 'Jarvis'])

    const sky = getVoiceById('gemini-live-zephyr')
    expect(sky.name).toBe('Sky')
    expect(sky.description).toBe('Warm and friendly')
    expect(sky.cloudTone).toBe('blue')

    const jarvis = getVoiceById('xai-leo')
    expect(jarvis.name).toBe('Jarvis')
    expect(jarvis.isCustomIcon).toBe(true)

    // Fallback behavior
    expect(getVoiceById('unknown-id').name).toBe('Sky')
  })

  it('defines the three voice speed options', () => {
    expect(AGENT_SPEED_OPTIONS).toHaveLength(3)
    expect(AGENT_SPEED_OPTIONS.map((s) => s.id)).toEqual(['slow', 'normal', 'fast'])
    expect(AGENT_SPEED_OPTIONS.find((s) => s.id === 'normal')?.speed).toBe(1.2)
  })

  it('defines all six native agent actions matching the VoiceOS specification', () => {
    expect(INITIAL_ACTIONS).toHaveLength(6)

    const actionIds = INITIAL_ACTIONS.map((a) => a.id)
    expect(actionIds).toEqual([
      'insertText',
      'createPrompt',
      'editText',
      'reminders',
      'controlPlayback',
      'openApp'
    ])

    const titles = INITIAL_ACTIONS.map((a) => a.title)
    expect(titles).toEqual([
      'Point and ask about your screen',
      'Create prompt',
      'Edit selected text',
      'Set reminders',
      'Control music',
      'Open app'
    ])

    expect(INITIAL_ACTIONS.every((a) => a.enabled)).toBe(true)
    expect(INITIAL_ACTIONS.every((a) => a.available)).toBe(true)
  })

  it('initializes default settings with Sky voice, Faiz user, and empty memories', () => {
    expect(DEFAULT_AGENT_SETTINGS.voiceId).toBe('gemini-live-zephyr')
    expect(DEFAULT_AGENT_SETTINGS.voiceSpeed).toBe('normal')
    expect(DEFAULT_AGENT_SETTINGS.voiceConfirmationEnabled).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.userProfile.firstName).toBe('Faiz')
    expect(DEFAULT_AGENT_SETTINGS.userProfile.lastName).toBe('')
    expect(DEFAULT_AGENT_SETTINGS.userProfile.preferencesMd).toBe('')
    expect(DEFAULT_AGENT_SETTINGS.preferencesMd).toBe('')
    expect(DEFAULT_AGENT_SETTINGS.previousPreferencesMd).toBeNull()
    expect(DEFAULT_AGENT_SETTINGS.memories).toEqual([])
  })
})

describe('Agent State Transitions & Handlers', () => {
  it('toggles an action enabled state without mutating other actions', () => {
    let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }

    const toggleAction = (id: AgentActionId, enabled: boolean): void => {
      settings = {
        ...settings,
        actions: settings.actions.map((a) => (a.id === id ? { ...a, enabled } : a))
      }
    }

    toggleAction('editText', false)
    expect(settings.actions.find((a) => a.id === 'editText')?.enabled).toBe(false)
    expect(settings.actions.find((a) => a.id === 'insertText')?.enabled).toBe(true)

    toggleAction('editText', true)
    expect(settings.actions.find((a) => a.id === 'editText')?.enabled).toBe(true)
  })

  it('handles user profile name changes', () => {
    let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }

    const updateProfile = (profile: UserProfile): void => {
      settings = { ...settings, userProfile: profile }
    }

    updateProfile({ firstName: 'Faiz', lastName: 'Khan' })
    expect(settings.userProfile.firstName).toBe('Faiz')
    expect(settings.userProfile.lastName).toBe('Khan')
  })

  it('manages adding, locking, and deleting memories', () => {
    let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }

    const addMemory = (fact: string): void => {
      const memory: AgentMemory = {
        id: `mem-${settings.memories.length + 1}`,
        fact,
        drawnAt: 'Nov 10, 2026',
        isCore: false
      }
      settings = { ...settings, memories: [memory, ...settings.memories] }
    }

    const toggleCore = (id: string, isCore: boolean): void => {
      settings = {
        ...settings,
        memories: settings.memories.map((m) => (m.id === id ? { ...m, isCore } : m))
      }
    }

    const deleteMemory = (id: string): void => {
      settings = {
        ...settings,
        memories: settings.memories.filter((m) => m.id !== id)
      }
    }

    addMemory('Prefers concise Slack summaries')
    expect(settings.memories).toHaveLength(1)
    expect(settings.memories[0].fact).toBe('Prefers concise Slack summaries')
    expect(settings.memories[0].isCore).toBe(false)

    toggleCore('mem-1', true)
    expect(settings.memories[0].isCore).toBe(true)

    deleteMemory('mem-1')
    expect(settings.memories).toHaveLength(0)
  })

  it('updates voice confirmation and voice speed presets', () => {
    let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }

    settings = { ...settings, voiceConfirmationEnabled: false }
    expect(settings.voiceConfirmationEnabled).toBe(false)

    settings = { ...settings, voiceSpeed: 'fast' }
    expect(settings.voiceSpeed).toBe('fast')

    settings = { ...settings, voiceId: 'xai-leo' }
    expect(settings.voiceId).toBe('xai-leo')
  })

  it('manages saving and undoing agent preferences (memory) markdown', () => {
    let settings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }

    const savePreferences = (markdown: string): void => {
      settings = {
        ...settings,
        previousPreferencesMd: settings.preferencesMd ?? '',
        preferencesMd: markdown,
        userProfile: {
          ...settings.userProfile,
          preferencesMd: markdown,
          hasPreviousPreferences: true
        }
      }
    }

    const undoPreferences = (): void => {
      const restored = settings.previousPreferencesMd ?? ''
      settings = {
        ...settings,
        preferencesMd: restored,
        previousPreferencesMd: null,
        userProfile: {
          ...settings.userProfile,
          preferencesMd: restored,
          hasPreviousPreferences: false
        }
      }
    }

    expect(settings.preferencesMd).toBe('')
    expect(settings.previousPreferencesMd).toBeNull()

    savePreferences('# About me\n\n- Prefers short emails\n- Uses Todoist for reminders')
    expect(settings.preferencesMd).toContain('Prefers short emails')
    expect(settings.previousPreferencesMd).toBe('')
    expect(settings.userProfile.hasPreviousPreferences).toBe(true)

    undoPreferences()
    expect(settings.preferencesMd).toBe('')
    expect(settings.previousPreferencesMd).toBeNull()
    expect(settings.userProfile.hasPreviousPreferences).toBe(false)
  })
})

describe('Memory Drawer & PreferencesFileEditor UI Components', () => {
  it('renders AboutYouSection with closed memory pill by default', () => {
    const html = renderToStaticMarkup(
      createElement(AboutYouSection, {
        profile: DEFAULT_AGENT_SETTINGS.userProfile,
        memories: [],
        preferencesMd: '',
        onUpdateProfile: () => {}
      })
    )

    // Pill header
    expect(html).toContain('agent-memory-drawer')
    expect(html).toContain('agent-memory-drawer-header')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Memory')
    expect(html).toContain('Show')
    // Body is hidden
    expect(html).not.toContain('agent-memory-drawer-body')
    expect(html).not.toContain(PREFERENCES_STRINGS.agentPreferencesDesc)
  })

  it('renders PreferencesFileEditor in empty view state with Goal & Preferences pending hints', () => {
    const html = renderToStaticMarkup(
      createElement(PreferencesFileEditor, {
        preferencesMd: '',
        hasPrevious: false
      })
    )

    expect(html).toContain('agent-preferences-container')
    expect(html).toContain('agent-preferences-preview')
    expect(html).toContain(PREFERENCES_STRINGS.agentPreferencesEmpty)
    expect(html).toContain(PREFERENCES_STRINGS.agentPreferencesGoalLabel)
    expect(html).toContain('VoiceOS fills this in once it can tell')
    expect(html).toContain(PREFERENCES_STRINGS.agentPreferencesPreferencesLabel)
    expect(html).toContain('always use Todoist')
    expect(html).toContain(PREFERENCES_STRINGS.agentPreferencesUndo)
    expect(html).toContain(PREFERENCES_STRINGS.agentPreferencesEdit)
    // Disabled undo button
    expect(html).toContain('disabled=""')
  })

  it('renders PreferencesFileEditor with markdown elements and suppresses fulfilled pending sections', () => {
    const sampleMd = `# About me

## Goals and Objective
- Launch product by end of Q4

## Preferences
- Prefers bulleted updates
- \`code\` blocks when discussing technical items
- **High priority** tasks first`

    const html = renderToStaticMarkup(
      createElement(PreferencesFileEditor, {
        preferencesMd: sampleMd,
        hasPrevious: true
      })
    )

    expect(html).toContain('agent-md-h1')
    expect(html).toContain('About me')
    expect(html).toContain('agent-md-h2')
    expect(html).toContain('Goals and Objective')
    expect(html).toContain('Launch product by end of Q4')
    expect(html).toContain('agent-md-code')
    expect(html).toContain('code')
    expect(html).toContain('agent-md-strong')
    expect(html).toContain('High priority')

    // Since sampleMd contains goal and preference headings, neither pending hint should be rendered
    expect(html).not.toContain(PREFERENCES_STRINGS.agentPreferencesGoalPending)
    expect(html).not.toContain(PREFERENCES_STRINGS.agentPreferencesPreferencesPending)
    // Undo button should not be disabled
    expect(html).not.toContain('disabled=""')
  })

  it('exposes maximum character limit of 4000', () => {
    expect(PREFERENCES_FILE_MAX_CHARS).toBe(4000)
  })

  it('falls back to legacy itemized memories when preferencesMd is explicitly null', () => {
    const dummyMemories: AgentMemory[] = [
      {
        id: 'mem-1',
        fact: 'Lives in San Francisco',
        drawnAt: 'Nov 10, 2026',
        isCore: true
      }
    ]

    const html = renderToStaticMarkup(
      createElement(AboutYouSection, {
        profile: { firstName: 'Faiz', lastName: '', preferencesMd: null },
        memories: dummyMemories,
        preferencesMd: null,
        onUpdateProfile: () => {}
      })
    )

    expect(html).toContain('Memories')
    expect(html).toContain('agent-memories-badge')
    expect(html).toContain('1')
  })
})
