import type { JSX } from 'react'
import { useSystemTheme } from '../../context/ThemeContext'

export interface AppleSwitchProps {
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  label: string
  id?: string
  variant?: 'green' | 'monochrome'
  isDarkMode?: boolean
}

export function AppleSwitch({
  checked,
  onToggle,
  disabled = false,
  label,
  id,
  variant = 'green',
  isDarkMode: propIsDarkMode
}: AppleSwitchProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode
  const isMonochrome = variant === 'monochrome'

  // Exact matching for Voice OS:
  // Card 1 (monochrome): Dark track with clean white border, white knob on right when active.
  // Card 3 (green): Apple #30d158 background, white knob on right when active.
  const backgroundColor = isMonochrome
    ? (checked
        ? (isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
        : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'))
    : (checked
        ? '#30d158'
        : (isDarkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)'))

  const border = isMonochrome
    ? (checked
        ? (isDarkMode ? '1.5px solid rgba(255, 255, 255, 0.55)' : '1.5px solid rgba(0, 0, 0, 0.45)')
        : (isDarkMode ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.18)'))
    : 'none'

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`agent-switch ${disabled ? 'agent-switch--disabled' : ''}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 38,
        height: 22,
        minWidth: 38,
        minHeight: 22,
        borderRadius: 9999,
        border,
        padding: 0,
        backgroundColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        outline: 'none',
        transition:
          'background-color 200ms cubic-bezier(0.32, 0.72, 0, 1), border-color 200ms cubic-bezier(0.32, 0.72, 0, 1)'
      }}
    >
      <span
        className="agent-switch-knob"
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          display: 'block',
          width: 18,
          height: 18,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
          pointerEvents: 'none',
          transform: `translateX(${checked ? 16 : 0}px)`,
          transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)'
        }}
      />
    </button>
  )
}
