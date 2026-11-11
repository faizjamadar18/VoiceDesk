import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AboutYouSection } from './AboutYouSection'
import { ActionDetailModal } from './ActionDetailModal'
import { ActionsSection } from './ActionsSection'
import { AgentPage } from './AgentPage'
import { AgentVoiceSection } from './AgentVoiceSection'
import { NATIVE_ACTION_META, getActionMeta } from './action-detail-catalog'
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

describe('Agent Card Stacking Context & Section Classes', () => {
  it('renders AgentVoiceSection with agent-voice-card class to ensure dropdown floats over subsequent cards', () => {
    const html = renderToStaticMarkup(
      createElement(AgentVoiceSection, {
        selectedVoiceId: DEFAULT_AGENT_SETTINGS.voiceId,
        selectedSpeed: DEFAULT_AGENT_SETTINGS.voiceSpeed,
        confirmationEnabled: DEFAULT_AGENT_SETTINGS.voiceConfirmationEnabled,
        onSelectVoice: () => {},
        onSelectSpeed: () => {},
        onToggleConfirmation: () => {}
      })
    )

    expect(html).toContain('agent-card')
    expect(html).toContain('agent-voice-card')
    expect(html).toContain('agent-voice-dropdown-wrapper')
  })

  it('renders AboutYouSection with about-you-card class', () => {
    const html = renderToStaticMarkup(
      createElement(AboutYouSection, {
        profile: DEFAULT_AGENT_SETTINGS.userProfile,
        memories: [],
        preferencesMd: '',
        onUpdateProfile: () => {}
      })
    )

    expect(html).toContain('agent-card')
    expect(html).toContain('about-you-card')
  })

  it('renders ActionsSection with agent-actions-card class', () => {
    const html = renderToStaticMarkup(
      createElement(ActionsSection, {
        actions: INITIAL_ACTIONS,
        onToggleAction: () => {}
      })
    )

    expect(html).toContain('agent-card')
    expect(html).toContain('agent-actions-card')
  })
})

describe('Agent Action Detail Metadata Catalog', () => {
  it('defines exact metadata for all six native actions matching VoiceOS specification', () => {
    const actionIds: AgentActionId[] = [
      'insertText',
      'createPrompt',
      'editText',
      'reminders',
      'controlPlayback',
      'openApp'
    ]

    for (const id of actionIds) {
      const meta = getActionMeta(id)
      expect(meta).toBeDefined()
      expect(meta.developer).toBe('VoiceOS')
      expect(meta.type).toBe('System action')
      expect(meta.glyph).toBeTruthy()

      const en = meta.copy.en
      expect(en.heroCaption).toBeTruthy()
      expect(en.glanceCaption).toBeTruthy()
      expect(en.queryChunks.length).toBeGreaterThan(0)
      expect(en.answer).toBeTruthy()
      expect(en.about).toBeTruthy()
      expect(en.sampleCommands.length).toBeGreaterThanOrEqual(3)
    }

    expect(NATIVE_ACTION_META.insertText.glyph).toBe('pointerTrail')
    expect(NATIVE_ACTION_META.insertText.copy.en.heroCaption).toBe(
      'Point at it, ask about it'
    )
    expect(NATIVE_ACTION_META.insertText.copy.en.glanceCaption).toBe(
      'Answers land in the notch'
    )
    expect(NATIVE_ACTION_META.insertText.copy.en.answer).toContain('API key')

    expect(NATIVE_ACTION_META.editText.glyph).toBe('textSelection')
    expect(NATIVE_ACTION_META.editText.copy.en.heroCaption).toBe(
      'Highlight it, say the change'
    )
    expect(NATIVE_ACTION_META.editText.copy.en.answer).toContain(
      'Could you send the file?'
    )

    expect(NATIVE_ACTION_META.createPrompt.glyph).toBe('promptDocument')
    expect(NATIVE_ACTION_META.createPrompt.copy.en.heroCaption).toBe(
      'Circle it, get the prompt'
    )

    expect(NATIVE_ACTION_META.controlPlayback.glyph).toBe('music')
    expect(NATIVE_ACTION_META.controlPlayback.copy.en.heroCaption).toBe(
      'Skip without switching apps'
    )

    expect(NATIVE_ACTION_META.openApp.glyph).toBe('appLaunch')
    expect(NATIVE_ACTION_META.openApp.copy.en.heroCaption).toBe('Any app, hands free')

    expect(NATIVE_ACTION_META.reminders.glyph).toBe('clock')
    expect(NATIVE_ACTION_META.reminders.copy.en.heroCaption).toBe(
      'Say it now, get reminded later'
    )
  })
})

describe('Agent Action Detail Modal', () => {
  it('returns null when action is null', () => {
    const html = renderToStaticMarkup(
      createElement(ActionDetailModal, {
        action: null,
        onClose: () => {}
      })
    )
    expect(html).toBe('')
  })

  it('renders ActionDetailModal for insertText with full specifications', () => {
    const action = INITIAL_ACTIONS.find((a) => a.id === 'insertText')!
    const html = renderToStaticMarkup(
      createElement(ActionDetailModal, {
        action,
        onClose: () => {},
        isDarkMode: true
      })
    )

    // Accessible dialog sheet
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Close"')

    // Header info & switch
    expect(html).toContain(action.title)
    expect(html).toContain(action.description)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')

    // 3-column InfoStrip
    expect(html).toContain('STATUS')
    expect(html).toContain('On')
    expect(html).toContain('Agent')
    expect(html).toContain('TYPE')
    expect(html).toContain('System action')
    expect(html).toContain('DEVELOPER')
    expect(html).toContain('VoiceOS')

    // Preview carousel & figcaptions
    expect(html).toContain('Preview')
    expect(html).toContain('Point at it, ask about it')
    expect(html).toContain('Answers land in the notch')
    expect(html).toContain(
      "The API key isn&#x27;t set — nothing is providing API_KEY when the client starts. Add it to .env.local and restart the dev server."
    )

    // About section
    expect(html).toContain('About')
    expect(html).toContain('Give the agent a live view of your screen.')

    // Try saying section
    expect(html).toContain('Try saying')
    expect(html).toContain('“What does this error mean?”')
    expect(html).toContain('“Summarize this page”')
    expect(html).toContain('“What should I reply here?”')

    // Information section with Screen Recording permissions row
    expect(html).toContain('Information')
    expect(html).toContain('Permissions')
    expect(html).toContain('Screen Recording')
  })

  it('renders ActionDetailModal for controlPlayback with music scene and disabled status when toggled off', () => {
    const action = {
      ...INITIAL_ACTIONS.find((a) => a.id === 'controlPlayback')!,
      enabled: false
    }

    const html = renderToStaticMarkup(
      createElement(ActionDetailModal, {
        action,
        onClose: () => {},
        isDarkMode: false
      })
    )

    expect(html).toContain('Control music')
    expect(html).toContain('STATUS')
    expect(html).toContain('Off')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('Skip without switching apps')
    expect(html).toContain('It names the track it moved to')
    expect(html).toContain('Skipped — now playing Golden Hour by JVKE.')
    expect(html).toContain('Pause the music')
  })
})

describe('ActionsSection Interaction & Accessibility', () => {
  it('renders action cards with cursor-pointer, role=button, and tabIndex=0 for keyboard accessibility', () => {
    const html = renderToStaticMarkup(
      createElement(ActionsSection, {
        actions: INITIAL_ACTIONS,
        onToggleAction: () => {},
        onSelectAction: () => {}
      })
    )

    expect(html).toContain('cursor-pointer')
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders AgentPage and mounts ActionDetailModal without errors', () => {
    const html = renderToStaticMarkup(
      createElement(AgentPage, {
        initialSettings: DEFAULT_AGENT_SETTINGS
      })
    )

    expect(html).toContain('agent-page')
    expect(html).toContain('Actions')
    expect(html).toContain('Point and ask about your screen')
  })
})
