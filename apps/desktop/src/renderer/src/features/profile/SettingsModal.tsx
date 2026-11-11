import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useSystemTheme } from '../../context/ThemeContext'
import { AccountSettingsTab } from './AccountSettingsTab'
import { AppearanceSettingsTab } from './AppearanceSettingsTab'
import { GeneralSettingsTab } from './GeneralSettingsTab'
import { SubscriptionSettingsTab } from './SubscriptionSettingsTab'
import { TeamSettingsTab } from './TeamSettingsTab'
import {
  CloseIcon,
  CreditCardIcon,
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
  userEmail?: string
  userName?: string
  onSignOut?: () => void
}

export function SettingsModal({
  isOpen,
  onClose,
  defaultTab = 'general',
  userEmail,
  userName,
  onSignOut
}: SettingsModalProps): JSX.Element | null {
  const { isDarkMode } = useSystemTheme()
  const [activeTab, setActiveTab] = useState<SettingsTabId>(defaultTab)

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
        style={{
          width: '1050px',
          height: '600px',
          maxWidth: '90vw',
          maxHeight: '85vh',
          backgroundColor: isDarkMode ? 'var(--dark-modal-background)' : '#f5f5f5',
          border: isDarkMode ? '1px solid var(--dark-modal-border)' : '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: isDarkMode
            ? 'var(--dark-modal-shadow)'
            : '0 24px 64px -20px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Left Navigation Rail */}
        <aside
          className="settings-sidebar"
          style={{
            width: '200px',
            backgroundColor: isDarkMode ? 'var(--dark-modal-background)' : 'rgba(0, 0, 0, 0.02)',
            borderRight: isDarkMode
              ? '1px solid var(--dark-modal-divider)'
              : '1px solid rgba(0, 0, 0, 0.06)'
          }}
        >
          <h2 className={`settings-sidebar-title ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            Settings
          </h2>
          <nav className="settings-sidebar-nav" role="tablist" aria-label="Settings">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              const activeStyle = isDarkMode
                ? {
                    background: 'var(--dark-segment-track)',
                    border: '1px solid var(--dark-border-subtle)',
                    boxShadow: 'inset 0 1px 0 var(--dark-surface-highlight)',
                    color: 'rgba(255, 255, 255, 0.95)'
                  }
                : {
                    background:
                      'linear-gradient(-75deg, rgba(230, 245, 255, 0.08), rgba(255, 255, 255, 0.2), rgba(230, 245, 255, 0.08))',
                    boxShadow:
                      'inset 0 2px 2px 0 rgba(0, 0, 0, 0.05), inset 0 -2px 2px 0 rgba(255, 255, 255, 0.5), 0 4px 2px -2px rgba(30, 30, 30, 0.15), inset 0 0 1.6px 4px rgba(210, 235, 255, 0.2)',
                    border: '1px solid transparent',
                    color: 'rgba(0, 0, 0, 0.9)'
                  }
              const inactiveStyle = {
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
              }

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`settings-nav-item ${isActive ? 'settings-nav-item--active' : ''}`}
                  style={isActive ? activeStyle : inactiveStyle}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = isDarkMode
                        ? 'rgba(255, 255, 255, 0.04)'
                        : 'rgba(0, 0, 0, 0.04)'
                      e.currentTarget.style.color = isDarkMode
                        ? 'rgba(255, 255, 255, 0.8)'
                        : 'rgba(0, 0, 0, 0.7)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.color = isDarkMode
                        ? 'rgba(255, 255, 255, 0.6)'
                        : 'rgba(0, 0, 0, 0.5)'
                    }
                  }}
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
        <main
          className="settings-content-wrapper"
          style={{
            backgroundColor: isDarkMode ? 'var(--dark-modal-background)' : '#f5f5f5'
          }}
        >
          <header
            className="settings-top-bar"
            style={{
              borderBottom: isDarkMode
                ? '1px solid rgba(255, 255, 255, 0.04)'
                : '1px solid rgba(0, 0, 0, 0.06)'
            }}
          >
            <h2 className={`settings-top-title ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <button
              type="button"
              className="modal-close-btn settings-close-btn"
              onClick={onClose}
              aria-label="Close"
              style={{
                color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'
              }}
            >
              <CloseIcon size={18} />
            </button>
          </header>

          <div className="settings-content-body">
            {activeTab === 'general' && <GeneralSettingsTab isDarkMode={isDarkMode} />}
            {activeTab === 'appearance' && <AppearanceSettingsTab isDarkMode={isDarkMode} />}
            {activeTab === 'subscription' && <SubscriptionSettingsTab isDarkMode={isDarkMode} />}
            {activeTab === 'account' && (
              <AccountSettingsTab
                isDarkMode={isDarkMode}
                onClose={onClose}
                userEmail={userEmail}
                userName={userName}
                onSignOut={onSignOut}
              />
            )}
            {activeTab === 'team' && (
              <TeamSettingsTab
                isDarkMode={isDarkMode}
                onNavigateToSubscription={() => setActiveTab('subscription')}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
