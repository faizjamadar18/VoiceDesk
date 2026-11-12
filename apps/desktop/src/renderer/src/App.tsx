import { useEffect, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import wordmark from './assets/voiceos-wordmark.png'
import cloudsBlue from './voiceos-notch/assets/cloudsBlue.png'
import lensOverlay from './voiceos-notch/assets/lens.png'
import { HistoryPage } from './features/history/HistoryPage'
import type { HistoryRecord } from '../../shared/types'
import { DictationPage } from './features/dictation/DictationPage'
import { AgentPage } from './features/agent/AgentPage'
import { AppsPage } from './features/apps/AppsPage'
import { ProfileDrawer } from './features/profile/ProfileDrawer'
import { SettingsModal } from './features/profile/SettingsModal'
import { HelpCenterModal } from './features/profile/HelpCenterModal'
import { ChevronUpIcon } from './features/profile/icons'
import type { SettingsTabId } from './features/profile/types'
import {
  AISparkleIcon,
  BlocksIcon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  ExternalLinkIcon,
  GiftIcon,
  HistoryIcon,
  HomeIcon,
  MicIcon
} from './components/dashboard-icons'
import { ThemeProvider, useSystemTheme } from './context/ThemeContext'
import { LoginPage } from './features/auth/LoginPage'
import { useAuth } from './features/auth/useAuth'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'

type WindowAction = 'minimize' | 'maximize' | 'close'
type TabId = 'dashboard' | 'history' | 'dictation' | 'agent' | 'apps'

interface NavItem {
  id: TabId
  label: string
  icon: JSX.Element
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <HomeIcon /> },
  { id: 'history', label: 'History', icon: <HistoryIcon /> },
  { id: 'dictation', label: 'Dictation', icon: <MicIcon /> },
  { id: 'agent', label: 'Agent', icon: <AISparkleIcon /> },
  { id: 'apps', label: 'Apps', icon: <BlocksIcon /> }
]

const STOPLIGHTS: Array<{ action: WindowAction; ariaLabel: string; color: string }> = [
  { action: 'minimize', ariaLabel: 'Minimize window', color: '#a0a0a0' },
  { action: 'maximize', ariaLabel: 'Maximize window', color: '#28c840' },
  { action: 'close', ariaLabel: 'Close window', color: '#ff5f57' }
]

function getGreeting(hour: number): string {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function runWindowAction(action: WindowAction): void {
  if (action === 'minimize') {
    window.kestrel?.minimizeWindow()
  } else if (action === 'maximize') {
    window.kestrel?.toggleMaximizeWindow()
  } else {
    window.kestrel?.closeWindow()
  }
}

function trackShine(event: MouseEvent<HTMLElement>): void {
  const target = event.currentTarget
  const rect = target.getBoundingClientRect()
  target.style.setProperty('--mouse-x', `${((event.clientX - rect.left) / rect.width) * 100}%`)
  target.style.setProperty('--mouse-y', `${((event.clientY - rect.top) / rect.height) * 100}%`)
}

function StoplightGlyph({ action }: { action: WindowAction }): JSX.Element {
  return (
    <svg
      className="stoplight-icon"
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
    >
      {action === 'close' && (
        <path
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1.2"
          d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5"
        />
      )}
      {action === 'minimize' && (
        <line x1="1" y1="4" x2="7" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" />
      )}
      {action === 'maximize' && (
        <path
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1.2"
          fill="none"
          d="M1.5 2.5L4 0.5L6.5 2.5M1.5 5.5L4 7.5L6.5 5.5"
        />
      )}
    </svg>
  )
}

function DashboardApp(): JSX.Element {
  const { user, signOut } = useAuth()
  const userName = user?.name || user?.email?.split('@')[0] || 'Faiz'
  const userEmail = user?.email || 'faiz@voiceos.com'
  const { isDarkMode, systemTheme } = useSystemTheme()
  const greeting = getGreeting(new Date().getHours())
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([])

  useEffect(() => {
    void window.kestrel.listHistory().then(setHistoryRecords)
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      void window.kestrel.listHistory().then(setHistoryRecords)
    }
  }, [activeTab])

  useEffect(
    () =>
      window.kestrel.onHistoryChanged(() => {
        void window.kestrel.listHistory().then(setHistoryRecords)
      }),
    []
  )

  const handleDeleteHistoryRecord = (id: string): void => {
    void window.kestrel.deleteHistory(id).then(setHistoryRecords)
  }

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<SettingsTabId>('general')
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false)

  const glassThemeClass = isDarkMode
    ? 'liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark'
    : 'liquid-glass-sidebar-tab--light liquid-glass-sidebar-tab--cursor-shine--light'

  return (
    <div className="dashboard-root">
      <div className="top-drag-strip" aria-hidden="true" />

      <div className="stoplight-controls">
        {STOPLIGHTS.map(({ action, ariaLabel, color }) => (
          <button
            key={action}
            type="button"
            className="stoplight-btn"
            style={{ backgroundColor: color }}
            onClick={() => runWindowAction(action)}
            aria-label={ariaLabel}
          >
            <StoplightGlyph action={action} />
          </button>
        ))}
      </div>

      <aside className={`sidebar ${isDarkMode ? 'sidebar-vibrancy-dark' : 'sidebar-vibrancy-light'}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-row">
            <img src={wordmark} alt="VoiceOS" className="sidebar-wordmark" />
            <span className="pro-badge">PRO</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {NAV_ITEMS.map(({ id, label, icon }) => {
            const isActive = activeTab === id

            return (
              <button
                key={id}
                type="button"
                className={`nav-item${
                  isActive
                    ? ` liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine ${glassThemeClass}`
                    : ''
                }`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveTab(id)}
                onMouseMove={trackShine}
              >
                <span className="nav-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="nav-label">{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-account-container">
          <ProfileDrawer
            isOpen={isProfileMenuOpen}
            onClose={() => setIsProfileMenuOpen(false)}
            onOpenSettings={() => {
              setSettingsDefaultTab('general')
              setIsSettingsOpen(true)
            }}
            onOpenHelpCenter={() => {
              setIsHelpCenterOpen(true)
            }}
            userName={userName}
          />
          <button
            type="button"
            className="sidebar-account"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            aria-expanded={isProfileMenuOpen}
            style={{
              backgroundColor: isProfileMenuOpen
                ? isDarkMode
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)'
                : undefined
            }}
          >
            <span className="profile-drawer-avatar" aria-hidden="true">
              <span className="profile-drawer-avatar-text">{(userName || 'User').charAt(0).toUpperCase()}</span>
              <img src={lensOverlay} alt="" className="profile-drawer-avatar-lens" />
            </span>
            <span
              className="account-name"
              style={{
                color: isDarkMode
                  ? isProfileMenuOpen
                    ? 'rgba(255, 255, 255, 0.95)'
                    : 'rgba(255, 255, 255, 0.7)'
                  : isProfileMenuOpen
                    ? 'rgba(0, 0, 0, 0.9)'
                    : 'rgba(0, 0, 0, 0.6)'
              }}
            >
              {userName}
            </span>
            {isProfileMenuOpen ? (
              <ChevronUpIcon
                className="account-chevron"
                style={{
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)'
                }}
              />
            ) : (
              <ChevronDownIcon
                className="account-chevron"
                style={{
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
                }}
              />
            )}
          </button>
        </div>
      </aside>

      <main
        className="dashboard-main-pane"
        style={{
          backgroundColor:
            systemTheme === 'light' ? 'rgba(243, 247, 254, 0.15)' : 'rgba(36, 36, 36, 0.15)'
        }}
      >
        <div
          className="dashboard-content-frame"
          style={{
            background: 'var(--content-background-gradient)',
            border: systemTheme === 'light' ? '1px solid rgba(255, 255, 255, 0.8)' : 'none',
            boxShadow: systemTheme === 'dark' ? '0 0 0 1px var(--dark-modal-border)' : 'none'
          }}
        >
          <div className="dashboard-scroll-area">
            <div className="dashboard-window-drag" />
            <div className="dashboard-bottom-fade" />

            <div className="dashboard-content-centering">
              <div className="dashboard-content">
                {activeTab === 'dashboard' && (
                  <div className="dashboard-home-view">
                    <div className="greeting">
                      <div className="orb" role="img" aria-label="VoiceOS orb">
                        <div
                          className="cloud-viewport orb-cloud"
                          style={{ backgroundImage: `url(${cloudsBlue})` }}
                        />
                        <img src={lensOverlay} alt="" className="orb-lens" />
                      </div>
                      <h1>{greeting}, {userName}</h1>
                    </div>

                    <div className="quick-start-grid">
                      <section
                        className="card quick-card"
                        style={{
                          background: isDarkMode
                            ? 'var(--dark-dashboard-card-background, #222327)'
                            : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
                          border: isDarkMode
                            ? '1px solid var(--dark-border-subtle, rgba(223, 226, 232, 0.06))'
                            : '1px solid #ffffff',
                          boxShadow: isDarkMode
                            ? '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 var(--dark-surface-highlight, rgba(239, 241, 245, 0.02))'
                            : 'none'
                        }}
                      >
                        <h4 className={`quick-title ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          <MicIcon
                            className={`quick-title-icon ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                            width={20}
                            height={20}
                          />
                          Dictation Mode
                        </h4>
                        <div className={`quick-meta ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span>Hold</span>
                          <span className="key-group">
                            <kbd className="keycap">control (left)</kbd>
                            <span className="key-plus">+</span>
                            <kbd className="keycap">shift (left)</kbd>
                          </span>
                          <span>in any text field</span>
                        </div>
                      </section>

                      <section
                        className="card quick-card"
                        style={{
                          background: isDarkMode
                            ? 'var(--dark-dashboard-card-background, #222327)'
                            : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
                          border: isDarkMode
                            ? '1px solid var(--dark-border-subtle, rgba(223, 226, 232, 0.06))'
                            : '1px solid #ffffff',
                          boxShadow: isDarkMode
                            ? '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 var(--dark-surface-highlight, rgba(239, 241, 245, 0.02))'
                            : 'none'
                        }}
                      >
                        <h4 className={`quick-title ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          <AISparkleIcon
                            className={`quick-title-icon ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                            width={20}
                            height={20}
                          />
                          Agent Mode
                        </h4>
                        <div className={`quick-meta ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span>Hold</span>
                          <span className="key-group">
                            <kbd className="keycap">alt</kbd>
                            <kbd className="keycap">control</kbd>
                          </span>
                          <span>to ask</span>
                        </div>
                      </section>
                    </div>

                    <section className="share-section">
                      <h3 className={`share-heading ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        Share the love
                      </h3>
                      <div
                        className="card share-card"
                        style={{
                          background: isDarkMode
                            ? 'var(--dark-dashboard-card-background, #222327)'
                            : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
                          border: isDarkMode
                            ? '1px solid var(--dark-border-subtle, rgba(223, 226, 232, 0.06))'
                            : '1px solid #ffffff',
                          boxShadow: isDarkMode
                            ? '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 var(--dark-surface-highlight, rgba(239, 241, 245, 0.02))'
                            : 'none'
                        }}
                      >
                        <div className="share-row">
                          <div className="share-left">
                            <div
                              className={`liquid-glass-badge ${
                                isDarkMode ? 'liquid-glass-badge--dark' : 'liquid-glass-badge--light'
                              }`}
                            >
                              <span className="liquid-glass-badge__icon">
                                <GiftIcon
                                  className={`badge-icon ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                                  width={20}
                                  height={20}
                                />
                              </span>
                            </div>
                            <div className="share-copy">
                              <h4 className={isDarkMode ? 'text-gray-100' : 'text-gray-900'}>
                                Refer a friend
                              </h4>
                              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                                Give a free month, get one when they subscribe.
                              </p>
                            </div>
                          </div>
                          <button type="button" className="ghost-button">
                            Invite friends
                          </button>
                        </div>

                        <div className={`share-divider ${isDarkMode ? 'bg-white/[0.06]' : 'bg-black/[0.06]'}`} />

                        <div className="share-row">
                          <div className="share-left">
                            <div
                              className={`liquid-glass-badge ${
                                isDarkMode ? 'liquid-glass-badge--dark' : 'liquid-glass-badge--light'
                              }`}
                            >
                              <span className="liquid-glass-badge__icon">
                                <CircleDollarSignIcon
                                  className={`badge-icon ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                                  width={20}
                                  height={20}
                                />
                              </span>
                            </div>
                            <div className="share-copy">
                              <h4 className={isDarkMode ? 'text-gray-100' : 'text-gray-900'}>
                                Affiliate Program
                              </h4>
                              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                                Earn 25% commission for a full year on everyone you refer.
                              </p>
                            </div>
                          </div>
                          <button type="button" className="ghost-button">
                            Learn more
                            <ExternalLinkIcon className="ghost-button-icon" width={14} height={14} />
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'history' && (
                  <HistoryPage
                    records={historyRecords}
                    onDeleteRecord={handleDeleteHistoryRecord}
                  />
                )}

                {activeTab === 'dictation' && <DictationPage />}

                {activeTab === 'agent' && <AgentPage />}

                {activeTab === 'apps' && <AppsPage />}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        defaultTab={settingsDefaultTab}
        userEmail={userEmail}
        userName={userName}
        onSignOut={signOut}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Help Center Modal */}
      <HelpCenterModal
        isOpen={isHelpCenterOpen}
        onClose={() => setIsHelpCenterOpen(false)}
      />
    </div>
  )
}

function AuthenticatedRouter(): JSX.Element {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('onboarding_completed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (user?.id) {
      try {
        const userSpecific = localStorage.getItem(`onboarding_completed_${user.id}`) === 'true'
        const globalCompleted = localStorage.getItem('onboarding_completed') === 'true'
        if (userSpecific || globalCompleted) {
          setIsOnboardingCompleted(true)
        }
      } catch {
        // ignore
      }
    }
  }, [user?.id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#16171a] text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  if (!isOnboardingCompleted) {
    return <OnboardingFlow onComplete={() => setIsOnboardingCompleted(true)} />
  }

  return <DashboardApp />
}

export default function App(): JSX.Element {
  return (
    <ThemeProvider>
      <AuthenticatedRouter />
    </ThemeProvider>
  )
}
