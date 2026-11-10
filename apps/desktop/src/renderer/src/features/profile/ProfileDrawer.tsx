import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useSystemTheme } from '../../context/ThemeContext'
import lensOverlay from '../../voiceos-notch/assets/lens.png'
import { HelpCircleIcon, SettingsGearIcon } from './icons'

export interface ProfileDrawerProps {
  isOpen: boolean
  onClose: () => void
  onOpenSettings: () => void
  onOpenHelpCenter: () => void
  userName?: string
}

export function ProfileDrawer({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenHelpCenter,
  userName = 'Faiz'
}: ProfileDrawerProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement>(null)
  const { theme: systemTheme } = useSystemTheme()
  const isDarkMode = systemTheme === 'dark'

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={popoverRef}
      className="profile-drawer-menu"
      role="menu"
      aria-label="Account options"
      style={{
        background: isDarkMode
          ? 'var(--dark-dashboard-card-background, #1e1f23)'
          : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
        border: isDarkMode
          ? '1px solid rgba(255, 255, 255, 0.08)'
          : '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: isDarkMode
          ? '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          : '0 12px 32px rgba(0, 0, 0, 0.15)'
      }}
    >
      <div className="profile-drawer-user-row">
        <span className="profile-drawer-avatar" aria-hidden="true">
          <span className="profile-drawer-avatar-text">{userName.charAt(0) || 'F'}</span>
          <img src={lensOverlay} alt="" className="profile-drawer-avatar-lens" />
        </span>
        <span
          className="profile-drawer-user-name"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)'
          }}
        >
          {userName}
        </span>
      </div>

      <div
        className="profile-drawer-divider"
        style={{
          backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
        }}
      />

      <div className="profile-drawer-actions">
        <button
          type="button"
          role="menuitem"
          className="profile-drawer-item"
          onClick={() => {
            onClose()
            onOpenSettings()
          }}
        >
          <SettingsGearIcon size={16} className="profile-drawer-item-icon" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="profile-drawer-item"
          onClick={() => {
            onClose()
            onOpenHelpCenter()
          }}
        >
          <HelpCircleIcon size={16} className="profile-drawer-item-icon" />
          <span>Help Center</span>
        </button>
      </div>
    </div>
  )
}
