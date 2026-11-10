import { useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import wordmark from './assets/voiceos-wordmark.png'
import cloudsBlue from './voiceos-notch/assets/cloudsBlue.png'
import lensOverlay from './voiceos-notch/assets/lens.png'
import {
  DUMMY_HISTORY_SESSIONS,
  HistoryPage
} from './features/history/HistoryPage'
import type { HistorySession } from './features/history/HistoryPage'
import {
  AISparkleIcon,
  AvatarIcon,
  BlocksIcon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  DiscordIcon,
  ExternalLinkIcon,
  GiftIcon,
  HistoryIcon,
  HomeIcon,
  InsightsIcon,
  MicIcon
} from './components/dashboard-icons'

type WindowAction = 'minimize' | 'maximize' | 'close'
type TabId = 'dashboard' | 'insights' | 'history' | 'dictation' | 'agent' | 'apps'

interface NavItem {
  id: TabId
  label: string
  icon: JSX.Element
}

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

export default function App(): JSX.Element {
  const greeting = getGreeting(new Date().getHours())
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [historySessions, setHistorySessions] = useState<HistorySession[]>(
    DUMMY_HISTORY_SESSIONS
  )

  const handleDeleteHistorySession = (id: string): void => {
    setHistorySessions((sessions) =>
      sessions.filter((session) => session.id !== id)
    )
  }

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

      <aside className="sidebar">
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
                    ? ' liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark'
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

        <button
          type="button"
          className="sidebar-discord liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark"
          onMouseMove={trackShine}
        >
          <span className="sidebar-discord-inner">
            <DiscordIcon className="discord-icon" />
            <span>Join our Discord community</span>
          </span>
        </button>

        <button type="button" className="sidebar-account">
          <span className="avatar" aria-hidden="true">
            <AvatarIcon className="avatar-icon" />
            <img src={lensOverlay} alt="" className="avatar-lens" />
          </span>
          <span className="account-name">Faiz</span>
          <ChevronDownIcon className="account-chevron" />
        </button>
      </aside>

      <main className="dashboard-main">
        {activeTab === 'dashboard' && (
          <div className="dashboard-content">
            <div className="greeting">
            <div className="orb" role="img" aria-label="VoiceOS orb">
              <div
                className="cloud-viewport orb-cloud"
                style={{ backgroundImage: `url(${cloudsBlue})` }}
              />
              <img src={lensOverlay} alt="" className="orb-lens" />
            </div>
            <h1>
              {greeting}, Faiz
            </h1>
          </div>

          <div className="quick-start-grid">
            <section className="card quick-card">
              <h4 className="quick-title">
                <MicIcon className="quick-title-icon" />
                Dictation Mode
              </h4>
              <div className="quick-meta">
                <span>Hold</span>
                <span className="key-group">
                  <kbd className="keycap">control (left)</kbd>
                  <span className="key-plus">+</span>
                  <kbd className="keycap">shift (left)</kbd>
                </span>
                <span>in any text field</span>
              </div>
            </section>

            <section className="card quick-card">
              <h4 className="quick-title">
                <AISparkleIcon className="quick-title-icon" />
                Agent Mode
              </h4>
              <div className="quick-meta">
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
            <h3 className="share-heading">Share the love</h3>
            <div className="card share-card">
              <div className="share-row">
                <div className="share-left">
                  <div className="liquid-glass-badge liquid-glass-badge--dark">
                    <span className="liquid-glass-badge__icon">
                      <GiftIcon className="badge-icon" />
                    </span>
                  </div>
                  <div className="share-copy">
                    <h4>Refer a friend</h4>
                    <p>Give a free month, get one when they subscribe.</p>
                  </div>
                </div>
                <button type="button" className="ghost-button">
                  Invite friends
                </button>
              </div>

              <div className="share-divider" />

              <div className="share-row">
                <div className="share-left">
                  <div className="liquid-glass-badge liquid-glass-badge--dark">
                    <span className="liquid-glass-badge__icon">
                      <CircleDollarSignIcon className="badge-icon" />
                    </span>
                  </div>
                  <div className="share-copy">
                    <h4>Affiliate Program</h4>
                    <p>Earn 25% commission for a full year on everyone you refer.</p>
                  </div>
                </div>
                <button type="button" className="ghost-button">
                  Learn more
                  <ExternalLinkIcon className="ghost-button-icon" />
                </button>
              </div>
            </div>
          </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="dashboard-content">
            <HistoryPage
              sessions={historySessions}
              onDeleteSession={handleDeleteHistorySession}
            />
          </div>
        )}
      </main>
    </div>
  )
}
