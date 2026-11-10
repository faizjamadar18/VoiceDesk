import { useState } from 'react'
import type { JSX } from 'react'
import { AboutYouSection } from './AboutYouSection'
import { ActionsSection } from './ActionsSection'
import { AgentVoiceSection } from './AgentVoiceSection'
import { DEFAULT_AGENT_SETTINGS } from './dummy-data'
import type {
  AgentActionId,
  AgentPageProps,
  AgentSettings,
  AgentSpeedPreset,
  UserProfile
} from './types'

export function AgentPage({
  initialSettings,
  onSaveSettings,
  onToggleAction,
  onAddMemory,
  onDeleteMemory,
  onToggleMemoryCore,
  onUpdateUserProfile,
  onSelectVoice,
  onSelectSpeed,
  onToggleVoiceConfirmation
}: AgentPageProps): JSX.Element {
  const [settings, setSettings] = useState<AgentSettings>({
    ...DEFAULT_AGENT_SETTINGS,
    ...initialSettings,
    userProfile: {
      ...DEFAULT_AGENT_SETTINGS.userProfile,
      ...initialSettings?.userProfile
    },
    memories: initialSettings?.memories ?? DEFAULT_AGENT_SETTINGS.memories,
    actions: initialSettings?.actions ?? DEFAULT_AGENT_SETTINGS.actions
  })

  const updateSettings = (updater: (prev: AgentSettings) => AgentSettings): void => {
    setSettings((prev) => {
      const next = updater(prev)
      onSaveSettings?.(next)
      return next
    })
  }

  const handleSelectVoice = (voiceId: string): void => {
    updateSettings((prev) => ({
      ...prev,
      voiceId
    }))
    onSelectVoice?.(voiceId)
  }

  const handleSelectSpeed = (voiceSpeed: AgentSpeedPreset): void => {
    updateSettings((prev) => ({
      ...prev,
      voiceSpeed
    }))
    onSelectSpeed?.(voiceSpeed)
  }

  const handleToggleConfirmation = (voiceConfirmationEnabled: boolean): void => {
    updateSettings((prev) => ({
      ...prev,
      voiceConfirmationEnabled
    }))
    onToggleVoiceConfirmation?.(voiceConfirmationEnabled)
  }

  const handleUpdateProfile = (userProfile: UserProfile): void => {
    updateSettings((prev) => ({
      ...prev,
      userProfile
    }))
    onUpdateUserProfile?.(userProfile)
  }

  const handleAddMemory = (fact: string): void => {
    const newMemory = {
      id: `mem-${Date.now()}`,
      fact,
      drawnAt: new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      isCore: false
    }

    updateSettings((prev) => ({
      ...prev,
      memories: [newMemory, ...prev.memories]
    }))
    onAddMemory?.(fact)
  }

  const handleDeleteMemory = (id: string): void => {
    updateSettings((prev) => ({
      ...prev,
      memories: prev.memories.filter((m) => m.id !== id)
    }))
    onDeleteMemory?.(id)
  }

  const handleToggleMemoryCore = (id: string, isCore: boolean): void => {
    updateSettings((prev) => ({
      ...prev,
      memories: prev.memories.map((m) => (m.id === id ? { ...m, isCore } : m))
    }))
    onToggleMemoryCore?.(id, isCore)
  }

  const handleToggleAction = (actionId: AgentActionId, enabled: boolean): void => {
    updateSettings((prev) => ({
      ...prev,
      actions: prev.actions.map((a) => (a.id === actionId ? { ...a, enabled } : a))
    }))
    onToggleAction?.(actionId, enabled)
  }

  return (
    <div className="agent-page">
      <h1 className="agent-title">Agent</h1>

      <AgentVoiceSection
        selectedVoiceId={settings.voiceId}
        selectedSpeed={settings.voiceSpeed}
        confirmationEnabled={settings.voiceConfirmationEnabled}
        onSelectVoice={handleSelectVoice}
        onSelectSpeed={handleSelectSpeed}
        onToggleConfirmation={handleToggleConfirmation}
      />

      <AboutYouSection
        profile={settings.userProfile}
        memories={settings.memories}
        onUpdateProfile={handleUpdateProfile}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onToggleMemoryCore={handleToggleMemoryCore}
      />

      <ActionsSection
        actions={settings.actions}
        onToggleAction={handleToggleAction}
      />
    </div>
  )
}

export default AgentPage
