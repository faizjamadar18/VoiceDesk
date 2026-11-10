import { useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { PlusIcon, TrashIcon } from '../../components/dashboard-icons'
import { ChevronDownIcon, LockIcon, LockOpenIcon, UserRoundIcon } from './icons'
import { PREFERENCES_STRINGS, PreferencesFileEditor } from './PreferencesFileEditor'
import type { AgentMemory, UserProfile } from './types'

export interface AboutYouSectionProps {
  profile: UserProfile
  memories: AgentMemory[]
  preferencesMd?: string | null
  previousPreferencesMd?: string | null
  isSavingPreferences?: boolean
  onUpdateProfile: (profile: UserProfile) => void
  onSavePreferences?: (preferencesMd: string) => Promise<void> | void
  onUndoPreferences?: () => Promise<void> | void
  onAddMemory?: (fact: string) => void
  onDeleteMemory?: (id: string) => void
  onToggleMemoryCore?: (id: string, isCore: boolean) => void
}

export function AboutYouSection({
  profile,
  memories,
  preferencesMd,
  previousPreferencesMd,
  isSavingPreferences,
  onUpdateProfile,
  onSavePreferences,
  onUndoPreferences,
  onAddMemory,
  onDeleteMemory,
  onToggleMemoryCore
}: AboutYouSectionProps): JSX.Element {
  const [isMemoriesExpanded, setIsMemoriesExpanded] = useState(false)
  const [isAddingMemory, setIsAddingMemory] = useState(false)
  const [newMemoryFact, setNewMemoryFact] = useState('')

  const resolvedPreferencesMd =
    preferencesMd !== undefined ? preferencesMd : (profile.preferencesMd ?? '')
  const hasPreferencesFile = resolvedPreferencesMd !== null
  const hasPrevious = Boolean(
    previousPreferencesMd || profile.hasPreviousPreferences
  )

  const handleSaveMemory = (e: FormEvent): void => {
    e.preventDefault()
    const trimmed = newMemoryFact.trim()
    if (!trimmed) return

    onAddMemory?.(trimmed)
    setNewMemoryFact('')
    setIsAddingMemory(false)
  }

  return (
    <section className="agent-card about-you-card" aria-labelledby="about-you-heading">
      <div className="agent-card-header">
        <div className="agent-section-info">
          <UserRoundIcon
            width={20}
            height={20}
            className="agent-section-icon"
          />
          <div>
            <h2 id="about-you-heading" className="agent-section-title">
              About you
            </h2>
            <p className="agent-section-desc">
              Your name and the things Agent Mode has learned about you from your conversations.
            </p>
          </div>
        </div>
      </div>

      <div className="agent-name-row">
        <input
          type="text"
          value={profile.firstName}
          onChange={(e) =>
            onUpdateProfile({ ...profile, firstName: e.target.value })
          }
          placeholder="First name"
          aria-label="First name"
          className="agent-name-input"
        />

        <input
          type="text"
          value={profile.lastName}
          onChange={(e) =>
            onUpdateProfile({ ...profile, lastName: e.target.value })
          }
          placeholder="Last name"
          aria-label="Last name"
          className="agent-name-input"
        />
      </div>

      <div className="agent-memory-drawer">
        <button
          type="button"
          onClick={() => setIsMemoriesExpanded((prev) => !prev)}
          aria-expanded={isMemoriesExpanded}
          aria-controls="agent-memories-panel"
          className="agent-memory-drawer-header"
        >
          <span className="agent-memory-drawer-left">
            <span className="agent-memory-drawer-title">
              {hasPreferencesFile
                ? PREFERENCES_STRINGS.agentPreferencesTitle
                : 'Memories'}
            </span>
            {!hasPreferencesFile && (
              <span className="agent-memories-badge">{memories.length}</span>
            )}
          </span>

          <span className="agent-memory-drawer-right">
            <span>{isMemoriesExpanded ? 'Hide' : 'Show'}</span>
            <ChevronDownIcon
              width={14}
              height={14}
              className={`agent-memory-drawer-chevron ${
                isMemoriesExpanded ? 'agent-memory-drawer-chevron--expanded' : ''
              }`}
            />
          </span>
        </button>

        {isMemoriesExpanded && (
          <div id="agent-memories-panel" className="agent-memory-drawer-body">
            {hasPreferencesFile ? (
              <>
                <p className="agent-memory-drawer-desc">
                  {PREFERENCES_STRINGS.agentPreferencesDesc}
                </p>
                <PreferencesFileEditor
                  preferencesMd={resolvedPreferencesMd}
                  hasPrevious={hasPrevious}
                  isSaving={isSavingPreferences}
                  onSave={onSavePreferences}
                  onUndo={onUndoPreferences}
                />
              </>
            ) : (
              <>
                <div className="agent-memories-panel-header">
                  <p className="agent-memories-panel-desc">
                    What the VoiceOS agent remembers about you, so it can help with your tasks.
                  </p>

                  <button
                    type="button"
                    onClick={() => setIsAddingMemory((prev) => !prev)}
                    className="agent-add-memory-btn"
                  >
                    <PlusIcon className="agent-mini-icon" />
                    <span>Add memory</span>
                  </button>
                </div>

                {isAddingMemory && (
                  <form onSubmit={handleSaveMemory} className="agent-memory-form">
                    <input
                      type="text"
                      value={newMemoryFact}
                      onChange={(e) => setNewMemoryFact(e.target.value)}
                      placeholder='Something durable and useful, like "prefers concise replies"'
                      autoFocus
                      className="agent-memory-input"
                    />
                    <button
                      type="submit"
                      className="agent-memory-save-btn"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingMemory(false)
                        setNewMemoryFact('')
                      }}
                      className="agent-memory-cancel-btn"
                    >
                      Cancel
                    </button>
                  </form>
                )}

                {memories.length === 0 ? (
                  <p className="agent-memories-empty">
                    Memories will appear here as Agent Mode learns useful facts from your conversations.
                  </p>
                ) : (
                  <ul className="agent-memories-list">
                    {memories.map((memory) => (
                      <li
                        key={memory.id}
                        className={`agent-memory-item ${
                          memory.isCore ? 'agent-memory-item--core' : ''
                        }`}
                      >
                        <div className="agent-memory-content">
                          <p className="agent-memory-fact">
                            {memory.fact}
                          </p>
                          {memory.drawnAt && (
                            <p className="agent-memory-date">
                              {memory.drawnAt}
                            </p>
                          )}
                        </div>

                        <div className="agent-memory-actions">
                          <button
                            type="button"
                            onClick={() =>
                              onToggleMemoryCore?.(memory.id, !memory.isCore)
                            }
                            title={
                              memory.isCore
                                ? 'Locked so it is never forgotten. Click to unlock.'
                                : 'Lock this memory so it is never forgotten.'
                            }
                            aria-label={
                              memory.isCore
                                ? 'Allow auto-forget'
                                : 'Keep forever (never auto-deleted)'
                            }
                            className="agent-memory-action-btn"
                          >
                            {memory.isCore ? (
                              <LockIcon width={14} height={14} />
                            ) : (
                              <LockOpenIcon width={14} height={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteMemory?.(memory.id)}
                            title="Delete memory"
                            aria-label="Delete memory"
                            className="agent-memory-action-btn agent-memory-action-btn--delete"
                          >
                            <TrashIcon className="agent-mini-icon" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
