import { useState } from 'react'
import type { JSX } from 'react'
import { Card } from './Card'
import { UsersIcon } from './icons'

export interface TeamSettingsTabProps {
  isDarkMode?: boolean
  onNavigateToSubscription: () => void
}

export function TeamSettingsTab({
  isDarkMode = true,
  onNavigateToSubscription
}: TeamSettingsTabProps): JSX.Element {
  const [hasTeam, setHasTeam] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [teamName, setTeamName] = useState('VoiceOS Team')
  const [isEditingTeamName, setIsEditingTeamName] = useState(false)

  return (
    <div className="voiceos-tab-content space-y-4">
      {!hasTeam ? (
        <div>
          <h3 className="voiceos-section-header">Create Team</h3>
          <Card isDarkMode={isDarkMode} className="p-5">
            <div className="voiceos-setting-row">
              <div className="voiceos-setting-copy flex items-center gap-2">
                <UsersIcon size={20} className="text-gray-300" />
                <div>
                  <h4 className="voiceos-row-title">Team plan required</h4>
                  <p className="voiceos-row-desc">
                    Upgrade to VoiceOS Team to create and manage a team
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHasTeam(true)}
                  className="voiceos-change-btn text-xs"
                  title="Preview active team interface"
                >
                  Preview active
                </button>
                <button
                  type="button"
                  onClick={onNavigateToSubscription}
                  className="voiceos-change-btn voiceos-change-btn--primary"
                >
                  Upgrade
                </button>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="voiceos-section-header">Your Team</h3>
            <button
              type="button"
              onClick={() => setHasTeam(false)}
              className="voiceos-change-btn text-xs"
            >
              Back to upgrade preview
            </button>
          </div>

          <Card isDarkMode={isDarkMode} className="p-5">
            <div className="space-y-4">
              {/* Team Name row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UsersIcon size={20} className="text-gray-300" />
                  {isEditingTeamName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="voiceos-input-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setIsEditingTeamName(false)}
                        className="voiceos-change-btn voiceos-change-btn--primary"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div>
                      <h4 className="voiceos-row-title">{teamName}</h4>
                      <p className="voiceos-row-desc">4 of 5 seats available</p>
                    </div>
                  )}
                </div>
                {!isEditingTeamName && (
                  <button
                    type="button"
                    onClick={() => setIsEditingTeamName(true)}
                    className="voiceos-change-btn"
                  >
                    Edit
                  </button>
                )}
              </div>

              {/* Invite member row */}
              <div className="voiceos-invite-row">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="voiceos-input-sm flex-1"
                />
                <button
                  type="button"
                  disabled={!inviteEmail.trim()}
                  className="voiceos-change-btn voiceos-change-btn--primary"
                >
                  Invite
                </button>
              </div>

              <div className="voiceos-divider" />

              {/* Members list */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Team Members
                </h4>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="voiceos-team-avatar">F</span>
                    <div>
                      <p className="voiceos-row-title">Faiz (You)</p>
                      <p className="voiceos-row-desc">faiz@voiceos.com</p>
                    </div>
                  </div>
                  <span className="voiceos-role-badge">Owner</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

