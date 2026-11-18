import { useEffect, useRef, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import voiceOsWordmarkWhite from './assets/voiceos-wordmark.png'
import voiceOsWordmarkBlack from './assets/voiceos-wordmark-black.png'
import voiceOsLogoWhite from './assets/voiceOsLogoWhite.png'
import voiceOsLogoBlack from './assets/voiceOsLogoBlack.png'
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
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  ExternalLinkIcon,
  GiftIcon,
  HistoryIcon,
  HomeIcon,
  InsightsIcon,
  MicIcon
} from './components/dashboard-icons'
import { ThemeProvider, useSystemTheme } from './context/ThemeContext'
import { LoginPage } from './features/auth/LoginPage'
import { useAuth } from './features/auth/useAuth'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'
import { InsightsTab } from './components/insights/InsightsTab'

type WindowAction = 'minimize' | 'maximize' | 'close'
type TabId = 'dashboard' | 'insights' | 'history' | 'dictation' | 'agent' | 'apps'

interface NavItem {
  id: TabId
  label: string
  icon: JSX.Element
}

const COLLAPSED_SIDEBAR_WIDTH = 85
const EXPANDED_SIDEBAR_WIDTH = 220
const NAV_PADDING = 16
const ICON_SIZE = 20
const BORDER_WIDTH = 1
const BUTTON_WIDTH_COLLAPSED = COLLAPSED_SIDEBAR_WIDTH - NAV_PADDING * 2
const BUTTON_CONTENT_WIDTH = BUTTON_WIDTH_COLLAPSED - BORDER_WIDTH * 2
const ICON_LEFT_OFFSET = (BUTTON_CONTENT_WIDTH - ICON_SIZE) / 2

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <HomeIcon /> },
  { id: 'insights', label: 'Insights', icon: <InsightsIcon /> },
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

interface SidebarNavItemProps {
  icon: JSX.Element
  label: string
  isActive: boolean
  isCollapsed: boolean
  onClick: () => void
}

function SidebarNavItem({
  icon,
  label,
  isActive,
  isCollapsed,
  onClick
}: SidebarNavItemProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()

  const liquidGlassClasses = isActive
    ? `liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine ${
        isDarkMode
          ? 'liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark'
          : 'liquid-glass-sidebar-tab--light liquid-glass-sidebar-tab--cursor-shine--light'
      }`
    : ''

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={trackShine}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`nav-item group relative flex items-center select-none overflow-hidden ${liquidGlassClasses}`}
      style={{
        width: '100%',
        height: '44px',
        paddingLeft: `${ICON_LEFT_OFFSET}px`,
        paddingRight: isCollapsed ? `${ICON_LEFT_OFFSET}px` : '16px',
        gap: '12px',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        borderRadius: '12px',
        outline: 'none',
        color: isDarkMode
          ? isActive
            ? 'rgba(255, 255, 255, 0.98)'
            : 'rgba(255, 255, 255, 0.5)'
          : isActive
            ? 'rgba(0, 0, 0, 0.9)'
            : 'rgba(0, 0, 0, 0.5)',
        fontWeight: 500,
        transition: 'padding 300ms cubic-bezier(0.25, 0.1, 0.25, 1.0), color 200ms ease'
      }}
    >
      <div
        className={`flex items-center justify-center flex-shrink-0 ${isActive ? 'relative z-10' : ''}`}
        style={{ width: `${ICON_SIZE}px`, height: `${ICON_SIZE}px` }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div
        className={`whitespace-nowrap ${isActive ? 'relative z-10' : ''}`}
        style={{
          opacity: isCollapsed ? 0 : 1,
          transition: 'opacity 200ms ease-out'
        }}
      >
        <span className="text-sm">{label}</span>
      </div>
    </button>
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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('voiceos_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('voiceos_sidebar_collapsed', String(isSidebarCollapsed))
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed])

  const [showCollapseArrow, setShowCollapseArrow] = useState(false)
  const dropdownHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (dropdownHoverTimeoutRef.current) {
        clearTimeout(dropdownHoverTimeoutRef.current)
      }
    }
  }, [])

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

  return (
    <div className="dashboard-root">
      <div
        className="top-drag-strip transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
        style={{
          left: isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`
        }}
        aria-hidden="true"
      />

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

      <aside
        className={`sidebar flex flex-col flex-shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] relative z-[60] sidebar-vibrancy ${
          isDarkMode ? 'sidebar-vibrancy-dark' : 'sidebar-vibrancy-light'
        }`}
        style={{
          width: isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`,
          height: '100%'
        }}
      >
        <div
          className="sidebar-logo px-4 pt-10 pb-4 flex items-center justify-center relative"
          onMouseEnter={() => setShowCollapseArrow(true)}
          onMouseLeave={() => setShowCollapseArrow(false)}
          style={
            {
              WebkitAppRegion: 'drag',
              minHeight: '90px'
            } as React.CSSProperties
          }
        >
          <div
            className="relative flex items-center justify-center z-20 cursor-pointer"
            style={
              {
                width: '100%',
                height: '40px',
                WebkitAppRegion: 'no-drag'
              } as React.CSSProperties
            }
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
          >
            {/* Collapsed square icon */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: isSidebarCollapsed ? 1 : 0,
                transform: isSidebarCollapsed ? 'scale(1)' : 'scale(0.97)',
                pointerEvents: isSidebarCollapsed ? 'auto' : 'none',
                transition: 'opacity 150ms ease-out, transform 200ms ease-out',
                paddingTop: '8px'
              }}
            >
              <img
                src={isDarkMode ? voiceOsLogoWhite : voiceOsLogoBlack}
                alt="VoiceOS Logo"
                className="w-10 h-10 object-contain"
              />
            </div>

            {/* Expanded wordmark */}
            <div
              className="absolute inset-0 flex items-center justify-start"
              style={{
                opacity: isSidebarCollapsed ? 0 : 1,
                transform: isSidebarCollapsed ? 'translateX(-4px)' : 'translateX(0)',
                pointerEvents: isSidebarCollapsed ? 'none' : 'auto',
                paddingLeft: '8px',
                transition: 'opacity 150ms ease-out, transform 200ms ease-out'
              }}
            >
              <img
                src={isDarkMode ? voiceOsWordmarkWhite : voiceOsWordmarkBlack}
                alt="VoiceOS"
                className="h-[22px] object-contain"
              />
              <div
                className="flex items-center ml-1.5"
                style={{
                  paddingLeft: '7px',
                  paddingRight: '7px',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                  borderRadius: '9px',
                  transform: 'translateY(4px)',
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                  background: isDarkMode
                    ? 'linear-gradient(-75deg, rgba(140, 150, 170, 0.05), rgba(255, 255, 255, 0.08), rgba(140, 150, 170, 0.05))'
                    : 'linear-gradient(-75deg, rgba(230, 245, 255, 0.08), rgba(255, 255, 255, 0.2), rgba(230, 245, 255, 0.08))',
                  boxShadow: isDarkMode
                    ? 'rgba(0, 0, 0, 0.6) 0px 1px 2px 0px inset, rgba(255, 255, 255, 0.3) 0px -1px 0.5px 0px inset, rgba(0, 0, 0, 0.2) 0px 2px 2px -1px, rgba(255, 255, 255, 0.15) 0px 1px 1.5px 1px inset'
                    : 'rgba(0, 0, 0, 0.04) 0px 1px 1px 0px inset, rgba(255, 255, 255, 0.5) 0px -1px 1px 0px inset, rgba(30, 30, 30, 0.1) 0px 2px 2px -1px, rgba(210, 235, 255, 0.2) 0px 0px 1px 2px inset'
                }}
              >
                <span
                  className="font-semibold leading-none"
                  style={{
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.45)',
                    fontSize: '9px',
                    letterSpacing: '0.04em'
                  }}
                >
                  PRO
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Collapse toggle arrow */}
        <div
          className="absolute top-0 -right-5 w-6 h-full z-50 transition-all duration-200 flex items-center justify-start pointer-events-none"
          onMouseEnter={() => setShowCollapseArrow(true)}
          onMouseLeave={() => setShowCollapseArrow(false)}
        >
          <div
            className={`w-1 h-full transition-all duration-200 ${showCollapseArrow ? 'w-1.5' : ''}`}
            style={{
              background: 'rgba(255, 255, 255, 0.0)'
            }}
          />
          <button
            type="button"
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`absolute left-1/2 -translate-x-1/2 transition-opacity duration-200 cursor-pointer pointer-events-auto pr-5 ${
              showCollapseArrow ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{
              top: '54px',
              marginLeft: '-9px'
            }}
            onClick={(e) => {
              e.stopPropagation()
              setIsSidebarCollapsed((prev) => !prev)
            }}
          >
            {isSidebarCollapsed ? (
              <ChevronRightIcon
                className="w-5 h-5"
                style={{
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)'
                }}
                size={20}
              />
            ) : (
              <ChevronLeftIcon
                className="w-5 h-5"
                style={{
                  color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)'
                }}
                size={20}
              />
            )}
          </button>
        </div>

        <nav
          className="sidebar-nav flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide pt-1"
          aria-label="Primary"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <SidebarNavItem
              key={id}
              icon={icon}
              label={label}
              isActive={activeTab === id}
              isCollapsed={isSidebarCollapsed}
              onClick={() => setActiveTab(id)}
            />
          ))}
        </nav>

        <div
          className={`sidebar-account-container relative ${isSidebarCollapsed ? 'mx-4' : 'mx-3'} mb-3`}
          onMouseEnter={() => {
            if (isSidebarCollapsed) {
              if (dropdownHoverTimeoutRef.current) {
                clearTimeout(dropdownHoverTimeoutRef.current)
                dropdownHoverTimeoutRef.current = null
              }
              setIsProfileMenuOpen(true)
            }
          }}
          onMouseLeave={() => {
            if (isSidebarCollapsed) {
              dropdownHoverTimeoutRef.current = setTimeout(() => {
                setIsProfileMenuOpen(false)
              }, 150)
            }
          }}
        >
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
            isCollapsed={isSidebarCollapsed}
          />
          <button
            type="button"
            className="sidebar-account w-full flex items-center"
            onClick={() => !isSidebarCollapsed && setIsProfileMenuOpen((prev) => !prev)}
            aria-expanded={isProfileMenuOpen}
            style={{
              height: '40px',
              paddingLeft: isSidebarCollapsed ? '14px' : '10px',
              paddingRight: isSidebarCollapsed ? '14px' : '10px',
              gap: '10px',
              backgroundColor: isProfileMenuOpen
                ? isDarkMode
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.06)'
                : 'transparent',
              borderRadius: '10px',
              transition: 'padding 300ms cubic-bezier(0.25, 0.1, 0.25, 1.0), background-color 150ms ease'
            }}
          >
            <span className="profile-drawer-avatar flex-shrink-0" aria-hidden="true">
              <span className="profile-drawer-avatar-text">{(userName || 'User').charAt(0).toUpperCase()}</span>
              <img src={lensOverlay} alt="" className="profile-drawer-avatar-lens" />
            </span>
            <div
              className="flex-1 flex items-center justify-between min-w-0"
              style={{
                opacity: isSidebarCollapsed ? 0 : 1,
                transition: 'opacity 200ms ease-out'
              }}
            >
              <span
                className="account-name text-sm font-medium truncate text-left"
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
                  className="account-chevron w-3.5 h-3.5 flex-shrink-0"
                  style={{
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)'
                  }}
                />
              ) : (
                <ChevronDownIcon
                  className="account-chevron w-3.5 h-3.5 flex-shrink-0"
                  style={{
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'
                  }}
                />
              )}
            </div>
          </button>
        </div>
      </aside>

      <main
        className="dashboard-main-pane transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
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
            <div
              className="dashboard-window-drag transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
              style={{
                left: isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`
              }}
            />
            <div
              className="dashboard-bottom-fade transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
              style={{
                left: isSidebarCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`
              }}
            />

            <div className="dashboard-content-centering">
              <div className="dashboard-content @container w-full min-w-0">
                {activeTab === 'dashboard' && (
                  <div className="dashboard-home-view @container w-full min-w-0">
                    <div className="greeting flex min-w-0 items-center gap-4 mb-6">
                      <div className="orb" role="img" aria-label="VoiceOS orb">
                        <div
                          className="cloud-viewport orb-cloud"
                          style={{ backgroundImage: `url(${cloudsBlue})` }}
                        />
                        <img src={lensOverlay} alt="" className="orb-lens" />
                      </div>
                      <h1 className="min-w-0 break-words text-[1.7rem] @max-[480px]:text-[1.4rem] font-semibold">{greeting}, {userName}</h1>
                    </div>

                    <div className="quick-start-grid mb-6 grid gap-4 grid-cols-1 @[600px]:grid-cols-2">
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

                {activeTab === 'insights' && <InsightsTab />}

                {activeTab === 'history' && (
                  <HistoryPage
                    records={historyRecords}
                    onDeleteRecord={handleDeleteHistoryRecord}
                  />
                )}

                {activeTab === 'dictation' && (
                  <DictationPage userName={userName} userEmail={userEmail} />
                )}

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
