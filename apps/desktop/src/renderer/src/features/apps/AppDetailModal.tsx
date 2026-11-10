import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useSystemTheme } from '../../context/ThemeContext'
import { AppleSwitch } from '../agent/AppleSwitch'
import { getAppActions } from './app-actions-catalog'
import type { AppActionItem, AppItem } from './types'

export interface AppDetailModalProps {
  app: AppItem | null
  onClose: () => void
  onToggleConnect?: (id: string, connected: boolean) => void
  onToggleActionPermission?: (appId: string, actionId: string, asksFirst: boolean) => void
  isDarkMode?: boolean
}

function CloseIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function UserCircleIcon({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  )
}

function LockIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function LockOpenIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

export function AppDetailModal({
  app,
  onClose,
  onToggleConnect,
  onToggleActionPermission,
  isDarkMode: propIsDarkMode
}: AppDetailModalProps): JSX.Element | null {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const actions = useMemo<AppActionItem[]>(() => {
    if (!app) return []
    return getAppActions(app.id || app.slug)
  }, [app])

  const [permissions, setPermissions] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!app) return
    const initialPerms: Record<string, boolean> = {}
    for (const action of actions) {
      initialPerms[action.id] = action.asksFirst
    }
    setPermissions(initialPerms)
  }, [app, actions])

  useEffect(() => {
    if (!app) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [app, onClose])

  if (!app) return null

  const handleTogglePermission = (actionId: string, currentAsksFirst: boolean): void => {
    const nextValue = !currentAsksFirst
    setPermissions((prev) => ({ ...prev, [actionId]: nextValue }))
    onToggleActionPermission?.(app.id, actionId, nextValue)
  }

  const cells = [
    {
      label: 'VERSION',
      value: '1.0.0',
      caption: 'Built-in'
    },
    {
      label: 'DEVELOPER',
      value: <UserCircleIcon size={22} />,
      caption: 'VoiceOS'
    },
    {
      label: 'ACTIONS',
      value: String(actions.length),
      caption: actions.length === 1 ? 'action' : 'actions'
    }
  ]

  const modalElement = (
    <div
      className="modal-backdrop app-detail-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={app.name}
    >
      <div
        className="app-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Close Button */}
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="app-detail-close"
        >
          <CloseIcon size={18} />
        </button>

        {/* Scrollable Modal Content */}
        <div className="app-detail-scroll-body">
          {/* Hero Header */}
          <div className="app-detail-hero">
            <img
              src={app.iconUrl}
              alt={app.name}
              width={80}
              height={80}
              className="app-detail-hero-icon"
            />

            <div className="app-detail-hero-info">
              <div className="app-detail-title-row">
                <h3 className="app-detail-title">
                  {app.name}
                </h3>
                {app.beta && (
                  <span className="app-detail-beta-tag">BETA</span>
                )}
                {app.connected && (
                  <span style={{ marginLeft: 'auto' }}>
                    <AppleSwitch
                      checked={true}
                      label={`${app.name}: Disconnect`}
                      onToggle={() => onToggleConnect?.(app.id, false)}
                      isDarkMode={isDarkMode}
                      variant="green"
                    />
                  </span>
                )}
              </div>

              <p className="app-detail-desc">{app.description}</p>

              {!app.connected && (
                <div className="app-detail-connect-row">
                  <button
                    type="button"
                    onClick={() => onToggleConnect?.(app.id, true)}
                    className="app-detail-connect-btn"
                  >
                    Connect
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Info Strip */}
          <div className="app-detail-info-strip">
            {cells.map((cell) => (
              <div key={cell.label} className="app-detail-info-cell">
                <span className="app-detail-info-label">{cell.label}</span>
                <span className="app-detail-info-val">{cell.value}</span>
                <span className="app-detail-info-caption">{cell.caption}</span>
              </div>
            ))}
          </div>

          {/* Actions Section */}
          {actions.length > 0 && (
            <div className="app-detail-actions-section">
              <div>
                <h4 className="app-detail-actions-title">Actions</h4>
                <p className="app-detail-actions-subtitle">
                  What Agent Mode can do with this app.
                </p>
              </div>

              <div className="app-actions-card">
                {actions.map((action) => {
                  const asksFirst = permissions[action.id] ?? action.asksFirst

                  return (
                    <div key={action.id} className="app-action-row">
                      <div className="app-action-text">
                        <h5 className="app-action-title">{action.name}</h5>
                        {action.description && (
                          <p className="app-action-desc">{action.description}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        aria-pressed={asksFirst}
                        aria-label={`${action.name}: ${asksFirst ? 'Ask permission' : "Don't ask"}`}
                        onClick={() => handleTogglePermission(action.id, asksFirst)}
                        className={`app-action-pill ${
                          asksFirst ? 'app-action-pill--active' : 'app-action-pill--inactive'
                        }`}
                      >
                        {asksFirst ? (
                          <LockIcon size={11} />
                        ) : (
                          <LockOpenIcon size={11} />
                        )}
                        <span>{asksFirst ? 'Ask permission' : "Don't ask"}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalElement, document.body)
  }

  return modalElement
}
