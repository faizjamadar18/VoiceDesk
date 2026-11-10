import { useEffect, useState } from 'react'
import type { JSX } from 'react'
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
}

export function SettingsModal({
  isOpen,
  onClose,
  defaultTab = 'general'
}: SettingsModalProps): JSX.Element | null {
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
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Left Navigation Rail */}
        <aside className="settings-sidebar">
          <h2 className="settings-sidebar-title">Settings</h2>
          <nav className="settings-sidebar-nav" role="tablist" aria-label="Settings">
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

          <div className="settings-content-body">
            {activeTab === 'general' && <GeneralSettingsTab isDarkMode />}
            {activeTab === 'appearance' && <AppearanceSettingsTab isDarkMode />}
            {activeTab === 'subscription' && <SubscriptionSettingsTab isDarkMode />}
            {activeTab === 'account' && <AccountSettingsTab isDarkMode onClose={onClose} />}
            {activeTab === 'team' && (
              <TeamSettingsTab
                isDarkMode
                onNavigateToSubscription={() => setActiveTab('subscription')}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
