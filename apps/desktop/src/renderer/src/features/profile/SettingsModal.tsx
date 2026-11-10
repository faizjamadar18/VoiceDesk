import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { AppleSwitch } from '../agent/AppleSwitch'
import { KeyTile } from './KeyTile'
import {
  CloseIcon,
  CreditCardIcon,
  HandIcon,
  SettingsGearIcon,
  SunMoonIcon,
  UserRoundIcon,
  UsersIcon
} from './icons'
import type { SettingsTabId } from './types'

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: SettingsTabId
}

export function SettingsModal({
  isOpen,
  onClose,
  defaultTab = 'general'
}: SettingsModalProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(defaultTab)

  // Shortcut states
  const [dictationDoubleTap, setDictationDoubleTap] = useState(false)
  const [agentDoubleTap, setAgentDoubleTap] = useState(false)

  // Appearance tab state
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark')
  const [notchMaterial, setNotchMaterial] = useState<'liquidGlass' | 'solidBlack'>('liquidGlass')

  // Account tab state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab)
    }
  }, [isOpen, defaultTab])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const tabs: Array<{ id: SettingsTabId; label: string; icon: JSX.Element }> = [
    { id: 'general', label: 'General', icon: <SettingsGearIcon size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <SunMoonIcon size={16} /> },
    { id: 'subscription', label: 'Subscription', icon: <CreditCardIcon size={16} /> },
    { id: 'account', label: 'Account', icon: <UserRoundIcon size={16} /> },
    { id: 'team', label: 'Team', icon: <UsersIcon size={16} /> }
  ]

  const handleCheckUpdate = () => {
    setIsCheckingUpdate(true)
    setUpdateStatus(null)
    setTimeout(() => {
      setIsCheckingUpdate(false)
      setUpdateStatus("You're up to date.")
    }, 1000)
  }

  return (
    <div
      className="modal-backdrop settings-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Navigation Sidebar */}
        <aside className="settings-sidebar">
          <h2 className="settings-sidebar-title">Settings</h2>
          <nav className="settings-sidebar-nav" role="tablist" aria-label="Settings Navigation">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`settings-nav-item ${isActive ? 'settings-nav-item--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="settings-nav-icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                  <span className="settings-nav-label">{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Right Content Area */}
        <main className="settings-content-wrapper">
          {/* Top Bar */}
          <header className="settings-top-bar">
            <h2 className="settings-top-title">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <button
              type="button"
              className="modal-close-btn settings-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </header>

          {/* Scrollable Body */}
          <div className="settings-content-body">
            {activeTab === 'general' && (
              <div className="settings-section">
                <h3 className="settings-section-heading">Shortcuts</h3>

                {/* 1. Agent Mode Card */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-icon-title">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="settings-card-icon"
                        aria-hidden="true"
                      >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <div className="settings-card-text">
                        <h4 className="settings-card-title">Agent Mode</h4>
                        <p className="settings-card-desc">
                          Ask AI to do things in Slack, Gmail, and more
                        </p>
                      </div>
                    </div>

                    <div className="settings-card-action">
                      <div className="settings-keys-group">
                        <KeyTile label="Alt" sublabel="alt" />
                        <KeyTile label="Ctrl" sublabel="control" />
                      </div>
                      <button type="button" className="settings-change-btn">
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Dictation Mode Card */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-icon-title">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="settings-card-icon"
                        aria-hidden="true"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                      <div className="settings-card-text">
                        <h4 className="settings-card-title">Dictation Mode</h4>
                        <p className="settings-card-desc">Hold to dictate</p>
                      </div>
                    </div>

                    <div className="settings-card-action">
                      <div className="settings-keys-group">
                        <KeyTile label="Ctrl" sublabel="control" />
                        <KeyTile label="⇧" sublabel="shift" />
                      </div>
                      <button type="button" className="settings-change-btn">
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Hands-Free Dictation Card */}
                <div className="settings-card settings-card--multi">
                  <div className="settings-card-header settings-card-header--align-start">
                    <div className="settings-card-icon-title">
                      <HandIcon size={18} className="settings-card-icon" />
                      <div className="settings-card-text">
                        <h4 className="settings-card-title">Hands-Free Dictation</h4>
                        <p className="settings-card-desc">
                          Use either option to start and stop without holding a key
                        </p>
                      </div>
                    </div>

                    <div className="settings-hands-free-options">
                      {/* Option 1: Double tap */}
                      <div className="settings-option-box">
                        <div className="settings-option-text">
                          <span className="settings-option-title">Double tap</span>
                          <span className="settings-option-subtitle">
                            Uses your Dictation shortcut
                          </span>
                        </div>
                        <div className="settings-option-controls">
                          <div className="settings-keys-group">
                            <KeyTile label="Ctrl" sublabel="control" />
                            <KeyTile label="⇧" sublabel="shift" />
                          </div>
                          <AppleSwitch
                            checked={dictationDoubleTap}
                            onToggle={() => setDictationDoubleTap((prev) => !prev)}
                            label="Hands-Free Dictation: Double tap"
                          />
                        </div>
                      </div>

                      {/* Option 2: Press once */}
                      <div className="settings-option-box">
                        <div className="settings-option-text">
                          <span className="settings-option-title">Press once</span>
                        </div>
                        <div className="settings-option-controls">
                          <div className="settings-keys-group">
                            <KeyTile label="Ctrl" sublabel="control" />
                            <KeyTile label="⇧" sublabel="shift" />
                            <KeyTile label="space" sublabel="space" />
                          </div>
                          <button type="button" className="settings-change-btn">
                            Change
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Hands-Free Agent Card */}
                <div className="settings-card settings-card--multi">
                  <div className="settings-card-header settings-card-header--align-start">
                    <div className="settings-card-icon-title">
                      <HandIcon size={18} className="settings-card-icon" />
                      <div className="settings-card-text">
                        <h4 className="settings-card-title">Hands-Free Agent</h4>
                        <p className="settings-card-desc">
                          Double-tap your Agent shortcut to speak without holding a key
                        </p>
                      </div>
                    </div>

                    <div className="settings-hands-free-options">
                      <div className="settings-option-box">
                        <div className="settings-option-text">
                          <span className="settings-option-title">Double tap</span>
                          <span className="settings-option-subtitle">
                            Uses your Agent shortcut
                          </span>
                        </div>
                        <div className="settings-option-controls">
                          <div className="settings-keys-group">
                            <KeyTile label="Alt" sublabel="alt" />
                            <KeyTile label="Ctrl" sublabel="control" />
                          </div>
                          <AppleSwitch
                            checked={agentDoubleTap}
                            onToggle={() => setAgentDoubleTap((prev) => !prev)}
                            label="Hands-Free Agent: Double tap"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h3 className="settings-section-heading">Appearance</h3>

                {/* Theme Selector */}
                <div className="settings-card">
                  <div className="settings-card-content">
                    <h4 className="settings-card-title">Theme</h4>
                    <p className="settings-card-desc">
                      Choose between light, dark, or system default
                    </p>

                    <div className="settings-theme-selector">
                      {(['system', 'light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`settings-theme-tile ${
                            theme === t ? 'settings-theme-tile--active' : ''
                          }`}
                          onClick={() => setTheme(t)}
                        >
                          <div className={`settings-theme-preview settings-theme-preview--${t}`} />
                          <span className="settings-theme-label">
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notch Material */}
                <div className="settings-card" style={{ marginTop: '16px' }}>
                  <div className="settings-card-content">
                    <h4 className="settings-card-title">Notch Material</h4>
                    <p className="settings-card-desc">
                      Select the material appearance for the dynamic notch
                    </p>

                    <div className="settings-theme-selector">
                      {[
                        { id: 'liquidGlass', label: 'Liquid Glass' },
                        { id: 'solidBlack', label: 'Solid Black' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`settings-theme-tile ${
                            notchMaterial === item.id ? 'settings-theme-tile--active' : ''
                          }`}
                          onClick={() =>
                            setNotchMaterial(item.id as 'liquidGlass' | 'solidBlack')
                          }
                        >
                          <div
                            className={`settings-notch-preview settings-notch-preview--${item.id}`}
                          />
                          <span className="settings-theme-label">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div className="settings-section">
                <h3 className="settings-section-heading">Subscription</h3>

                <div className="settings-card">
                  <div className="settings-subscription-header">
                    <div>
                      <div className="settings-sub-plan-badge">PRO PLAN</div>
                      <h4 className="settings-sub-title">VoiceOS Pro</h4>
                      <p className="settings-card-desc">$20 / month · Renews monthly</p>
                    </div>
                    <span className="settings-sub-status-pill">Active</span>
                  </div>

                  <div className="settings-sub-features">
                    <div className="settings-sub-feature-item">
                      <span className="settings-sub-check">✓</span>
                      <span>Unlimited fast dictation with AI polishing</span>
                    </div>
                    <div className="settings-sub-feature-item">
                      <span className="settings-sub-check">✓</span>
                      <span>Full Agent Mode screen-awareness & native automations</span>
                    </div>
                    <div className="settings-sub-feature-item">
                      <span className="settings-sub-check">✓</span>
                      <span>Custom vocabularies, snippets & cross-device sync</span>
                    </div>
                  </div>

                  <div className="settings-sub-footer">
                    <button type="button" className="settings-primary-btn">
                      Manage Subscription
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="settings-section">
                <h3 className="settings-section-heading">Account</h3>

                <div className="settings-card">
                  <div className="settings-account-field">
                    <label className="settings-field-label">Name</label>
                    <input
                      type="text"
                      readOnly
                      value="Faiz"
                      className="settings-text-input"
                    />
                  </div>

                  <div className="settings-account-field" style={{ marginTop: '16px' }}>
                    <label className="settings-field-label">Email</label>
                    <input
                      type="email"
                      readOnly
                      value="faiz@voiceos.com"
                      className="settings-text-input"
                    />
                  </div>

                  <div className="settings-account-divider" />

                  <div className="settings-account-version-row">
                    <div>
                      <h4 className="settings-card-title">Version</h4>
                      <p className="settings-card-desc">VoiceOS v0.1.40</p>
                      {updateStatus && (
                        <p className="settings-update-status">{updateStatus}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="settings-change-btn"
                      onClick={handleCheckUpdate}
                      disabled={isCheckingUpdate}
                    >
                      {isCheckingUpdate ? 'Checking…' : 'Check updates'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'team' && (
              <div className="settings-section">
                <h3 className="settings-section-heading">Team</h3>

                <div className="settings-card">
                  <h4 className="settings-card-title">Invite Team Members</h4>
                  <p className="settings-card-desc">
                    Collaborate with your workspace team in VoiceOS
                  </p>

                  <div className="settings-team-invite-row">
                    <input
                      type="email"
                      placeholder="teammate@company.com"
                      className="settings-text-input"
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="settings-primary-btn">
                      Invite
                    </button>
                  </div>

                  <div className="settings-account-divider" />

                  <div className="settings-team-member-item">
                    <div className="settings-team-member-info">
                      <span className="settings-team-avatar">F</span>
                      <div>
                        <p className="settings-team-member-name">Faiz (You)</p>
                        <p className="settings-team-member-email">faiz@voiceos.com</p>
                      </div>
                    </div>
                    <span className="settings-team-role-pill">Owner</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

