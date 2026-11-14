import { useRef, type JSX, type MouseEvent } from 'react'
import {
  AISparkleIcon,
  BlocksIcon,
  HistoryIcon,
  HomeIcon,
  InsightsIcon,
  MicIcon
} from './dashboard-icons'
import { useSystemTheme } from '../context/ThemeContext'

export type TabId = 'dashboard' | 'insights' | 'history' | 'dictation' | 'agent' | 'apps'

export interface NavItemConfig {
  id: TabId
  label: string
  icon: JSX.Element
}

export const SIDEBAR_NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <HomeIcon /> },
  { id: 'insights', label: 'Insights', icon: <InsightsIcon /> },
  { id: 'history', label: 'History', icon: <HistoryIcon /> },
  { id: 'dictation', label: 'Dictation', icon: <MicIcon /> },
  { id: 'agent', label: 'Agent', icon: <AISparkleIcon /> },
  { id: 'apps', label: 'Apps', icon: <BlocksIcon /> }
]

export interface SidebarNavItemProps {
  icon: JSX.Element
  label: string
  isActive: boolean
  isCollapsed?: boolean
  onClick: () => void
}

export function SidebarNavItem({
  icon,
  label,
  isActive,
  isCollapsed = false,
  onClick
}: SidebarNavItemProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>): void => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    buttonRef.current.style.setProperty('--mouse-x', `${x}%`)
    buttonRef.current.style.setProperty('--mouse-y', `${y}%`)
  }

  const glassThemeClass = isDarkMode
    ? 'liquid-glass-sidebar-tab--dark liquid-glass-sidebar-tab--cursor-shine--dark'
    : 'liquid-glass-sidebar-tab--light liquid-glass-sidebar-tab--cursor-shine--light'

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`nav-item w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
        isActive
          ? `liquid-glass-sidebar-tab liquid-glass-sidebar-tab--no-shimmer liquid-glass-sidebar-tab--cursor-shine ${glassThemeClass} font-semibold`
          : isDarkMode
            ? 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            : 'text-gray-600 hover:text-gray-900 hover:bg-black/[0.04]'
      }`}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      title={isCollapsed ? label : undefined}
    >
      <span className="nav-icon flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      {!isCollapsed && <span className="nav-label truncate">{label}</span>}
    </button>
  )
}
