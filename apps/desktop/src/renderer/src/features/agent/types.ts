export type AgentSpeedPreset = 'slow' | 'normal' | 'fast'

export type AgentActionId =
  | 'insertText'
  | 'createPrompt'
  | 'editText'
  | 'reminders'
  | 'controlPlayback'
  | 'openApp'

export type AgentActionGlyph =
  | 'pointerTrail'
  | 'promptDocument'
  | 'textSelection'
  | 'clock'
  | 'music'
  | 'appLaunch'

export type AgentCloudTone = 'blue' | 'orange' | 'pink' | 'darkBlue'

export interface AgentVoiceOption {
  id: string
  name: string
  description: string
  cloudTone: AgentCloudTone
  isCustomIcon?: boolean
  previewText: string
}

export interface UserProfile {
  firstName: string
  lastName: string
}

export interface AgentMemory {
  id: string
  fact: string
  drawnAt: string
  isCore: boolean
}

export interface AgentActionItem {
  id: AgentActionId
  title: string
  description: string
  enabled: boolean
  available: boolean
  glyph: AgentActionGlyph
}

export interface AgentSettings {
  voiceId: string
  voiceSpeed: AgentSpeedPreset
  voiceConfirmationEnabled: boolean
  userProfile: UserProfile
  memories: AgentMemory[]
  actions: AgentActionItem[]
}

export interface AgentPageProps {
  initialSettings?: Partial<AgentSettings>
  onSaveSettings?: (settings: AgentSettings) => void
  onToggleAction?: (actionId: AgentActionId, enabled: boolean) => void
  onAddMemory?: (fact: string) => void
  onDeleteMemory?: (id: string) => void
  onToggleMemoryCore?: (id: string, isCore: boolean) => void
  onUpdateUserProfile?: (profile: UserProfile) => void
  onSelectVoice?: (voiceId: string) => void
  onSelectSpeed?: (speed: AgentSpeedPreset) => void
  onToggleVoiceConfirmation?: (enabled: boolean) => void
}
