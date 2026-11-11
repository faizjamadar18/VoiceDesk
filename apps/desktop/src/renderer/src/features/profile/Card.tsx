import type { JSX, MouseEvent, ReactNode } from 'react'
import { useSystemTheme } from '../../context/ThemeContext'

export interface CardProps {
  children: ReactNode
  className?: string
  borderRadius?: 'lg' | 'xl' | '2xl'
  isDarkMode?: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  style?: React.CSSProperties
}

export function Card({
  children,
  className = '',
  borderRadius = '2xl',
  isDarkMode: propIsDarkMode,
  onClick,
  style = {}
}: CardProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const borderRadiusStyles: Record<'lg' | 'xl' | '2xl', string> = {
    lg: '12px',
    xl: '16px',
    '2xl': '18px'
  }

  const darkCardBackground = 'var(--dark-dashboard-card-background, #222327)'
  const darkCardBorder = '1px solid var(--dark-border-subtle, rgba(223, 226, 232, 0.06))'
  const darkCardShadow =
    '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 var(--dark-surface-highlight, rgba(239, 241, 245, 0.02))'

  return (
    <div
      className={`voiceos-card squircle-card backdrop-blur-sm ${className}`}
      onClick={onClick}
      style={{
        background: isDarkMode
          ? darkCardBackground
          : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
        borderRadius: borderRadiusStyles[borderRadius],
        border: isDarkMode ? darkCardBorder : '1px solid #ffffff',
        boxShadow: isDarkMode ? darkCardShadow : 'none',
        ...style
      }}
    >
      {children}
    </div>
  )
}
