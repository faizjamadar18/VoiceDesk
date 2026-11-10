import type {
  AgentActionItem,
  AgentSettings,
  AgentSpeedPreset,
  AgentVoiceOption
} from './types'

export interface AgentSpeedOption {
  id: AgentSpeedPreset
  label: string
  speed: number
}

export const AGENT_SPEED_OPTIONS: AgentSpeedOption[] = [
  { id: 'slow', label: 'Slow', speed: 0.85 },
  { id: 'normal', label: 'Normal', speed: 1.2 },
  { id: 'fast', label: 'Fast', speed: 2.0 }
]

export const AGENT_VOICE_OPTIONS: AgentVoiceOption[] = [
  {
    id: 'gemini-live-zephyr',
    name: 'Sky',
    description: 'Warm and friendly',
    cloudTone: 'blue',
    previewText: 'I can help you communicate clearly and naturally.'
  },
  {
    id: 'gemini-live-umbriel',
    name: 'Dawn',
    description: 'Energetic and upbeat',
    cloudTone: 'orange',
    previewText: "I'll keep things moving and make the next step feel easy."
  },
  {
    id: 'gemini-live-laomedeia',
    name: 'Dusk',
    description: 'Smooth and balanced',
    cloudTone: 'pink',
    previewText: "I'll keep the tone steady while I work through the details."
  },
  {
    id: 'gemini-live-midnight',
    name: 'Midnight',
    description: 'Deep and steady',
    cloudTone: 'darkBlue',
    previewText: "I'll keep watch on the details while you focus."
  },
  {
    id: 'xai-leo',
    name: 'Jarvis',
    description: 'Authoritative and strong',
    cloudTone: 'darkBlue',
    isCustomIcon: true,
    previewText: "Right away, sir. I'll see to the details and keep you informed."
  }
]

export const INITIAL_ACTIONS: AgentActionItem[] = [
  {
    id: 'insertText',
    title: 'Point and ask about your screen',
    description: 'Point your cursor at anything on screen and ask about it',
    enabled: true,
    available: true,
    glyph: 'pointerTrail'
  },
  {
    id: 'createPrompt',
    title: 'Create prompt',
    description: 'Circle things on screen while you talk — get a ready-to-paste prompt for Claude, ChatGPT, or Cursor',
    enabled: true,
    available: true,
    glyph: 'promptDocument'
  },
  {
    id: 'editText',
    title: 'Edit selected text',
    description: 'Rewrite, translate, or fix highlighted text, then replace your selection',
    enabled: true,
    available: true,
    glyph: 'textSelection'
  },
  {
    id: 'reminders',
    title: 'Set reminders',
    description: 'Remind you at a time you pick (e.g. "remind me in 10 minutes")',
    enabled: true,
    available: true,
    glyph: 'clock'
  },
  {
    id: 'controlPlayback',
    title: 'Control music',
    description: 'Play, pause, skip tracks, and adjust system volume',
    enabled: true,
    available: true,
    glyph: 'music'
  },
  {
    id: 'openApp',
    title: 'Open app',
    description: 'Launch or focus an app by name (e.g. "open Chrome")',
    enabled: true,
    available: true,
    glyph: 'appLaunch'
  }
]

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  voiceId: 'gemini-live-zephyr',
  voiceSpeed: 'normal',
  voiceConfirmationEnabled: true,
  userProfile: {
    firstName: 'Faiz',
    lastName: '',
    preferencesMd: '',
    hasPreviousPreferences: false
  },
  preferencesMd: '',
  previousPreferencesMd: null,
  isSavingPreferences: false,
  memories: [],
  actions: INITIAL_ACTIONS
}

export function getVoiceById(id: string): AgentVoiceOption {
  return (
    AGENT_VOICE_OPTIONS.find((v) => v.id === id) ?? AGENT_VOICE_OPTIONS[0]
  )
}
