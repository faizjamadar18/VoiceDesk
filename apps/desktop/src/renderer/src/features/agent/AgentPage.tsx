import { useState } from 'react'
import type { JSX } from 'react'
import { AboutYouSection } from './AboutYouSection'
import { ActionDetailModal } from './ActionDetailModal'
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
  onSavePreferences,
  onUndoPreferences,
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
    preferencesMd:
      initialSettings?.preferencesMd !== undefined
        ? initialSettings.preferencesMd
        : (initialSettings?.userProfile?.preferencesMd ??
          DEFAULT_AGENT_SETTINGS.preferencesMd),
    previousPreferencesMd:
      initialSettings?.previousPreferencesMd !== undefined
        ? initialSettings.previousPreferencesMd
        : DEFAULT_AGENT_SETTINGS.previousPreferencesMd,
    memories: initialSettings?.memories ?? DEFAULT_AGENT_SETTINGS.memories,
    actions: initialSettings?.actions ?? DEFAULT_AGENT_SETTINGS.actions
  })

  const [selectedActionId, setSelectedActionId] = useState<AgentActionId | null>(null)

  const selectedAction = selectedActionId
    ? settings.actions.find((a) => a.id === selectedActionId) ?? null
    : null

  const updateSettings = (updater: (prev: AgentSettings) => AgentSettings): void => {
    setSettings((prev) => {
      const next = updater(prev)
      onSaveSettings?.(next)
      return next
    })
  }

  const handleSavePreferences = async (preferencesMd: string): Promise<void> => {
    updateSettings((prev) => ({
      ...prev,
      previousPreferencesMd: prev.preferencesMd ?? '',
      preferencesMd,
      userProfile: {
        ...prev.userProfile,
        preferencesMd,
        hasPreviousPreferences: true
      }
    }))
    await onSavePreferences?.(preferencesMd)
  }

  const handleUndoPreferences = async (): Promise<void> => {
    updateSettings((prev) => {
      const restored = prev.previousPreferencesMd ?? ''
      return {
        ...prev,
        preferencesMd: restored,
        previousPreferencesMd: null,
        userProfile: {
          ...prev.userProfile,
          preferencesMd: restored,
          hasPreviousPreferences: false
        }
      }
    })
    await onUndoPreferences?.()
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
        preferencesMd={settings.preferencesMd}
        previousPreferencesMd={settings.previousPreferencesMd}
        isSavingPreferences={settings.isSavingPreferences}
        onUpdateProfile={handleUpdateProfile}
        onSavePreferences={handleSavePreferences}
        onUndoPreferences={handleUndoPreferences}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onToggleMemoryCore={handleToggleMemoryCore}
      />

      <ActionsSection
        actions={settings.actions}
        onToggleAction={handleToggleAction}
        onSelectAction={setSelectedActionId}
      />

      <ActionDetailModal
        action={selectedAction}
        onClose={() => setSelectedActionId(null)}
        onToggleAction={handleToggleAction}
      />
    </div>
  )
}

export default AgentPage
