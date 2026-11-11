import type { CSSProperties, JSX } from 'react'

export interface KeyDisplayInfo {
  label: string
  symbol?: string
  isModifier: boolean
  side?: string
}

export function getKeyDisplayInfo(keyName: string, platform = 'darwin'): KeyDisplayInfo {
  const normalizedKey = keyName.toLowerCase()

  if (normalizedKey.includes('-') || normalizedKey.includes(' ')) {
    const parts = normalizedKey.split(/[- ]/)
    const baseKey = parts[0]
    const side = parts[1] || 'left'

    switch (baseKey) {
      case 'command':
      case 'cmd':
        return {
          label: 'command',
          symbol: platform === 'darwin' ? '⌘' : 'Win',
          isModifier: true,
          side
        }
      case 'control':
      case 'ctrl':
        return {
          label: 'control',
          symbol: platform === 'darwin' ? '⌃' : 'Ctrl',
          isModifier: true,
          side
        }
      case 'shift':
        return {
          label: 'shift',
          symbol: '⇧',
          isModifier: true,
          side
        }
      case 'fn':
      case 'option':
      case 'alt':
        return {
          label: platform === 'darwin' ? 'option' : 'alt',
          symbol: platform === 'darwin' ? '⌥' : 'Alt',
          isModifier: true,
          side
        }
    }
  }

  switch (normalizedKey) {
    case 'control':
    case 'ctrl':
      return {
        label: 'control',
        symbol: platform === 'darwin' ? '⌃' : 'Ctrl',
        isModifier: true,
        side: 'left'
      }
    case 'alt':
    case 'option':
      return {
        label: platform === 'darwin' ? 'option' : 'alt',
        symbol: platform === 'darwin' ? '⌥' : 'Alt',
        isModifier: true,
        side: 'left'
      }
    case 'shift':
      return {
        label: 'shift',
        symbol: '⇧',
        isModifier: true,
        side: 'left'
      }
    case 'fn':
      return {
        label: 'fn',
        isModifier: true
      }
    default:
      return {
        label: keyName,
        isModifier: false
      }
  }
}

export function getSideHintLabel(side?: string): string {
  if (!side) return ''
  return `(${side})`
}

export function getKeyDisplay(
  keyboardKey: string,
  platform = 'darwin',
  options: { showDirectionalText?: boolean; format?: 'symbol' | 'label' | 'both' } = {}
): string {
  const { showDirectionalText = false, format = 'symbol' } = options
  const displayInfo = getKeyDisplayInfo(keyboardKey, platform)
  const dirIndicator = displayInfo.side ? getSideHintLabel(displayInfo.side) : ''
  const label = displayInfo.label
  let result: string
  if (displayInfo.isModifier && displayInfo.symbol) {
    if (format === 'symbol') {
      result = displayInfo.symbol
      if (dirIndicator && showDirectionalText) {
        result = `${result} ${dirIndicator}`
      }
    } else if (format === 'label') {
      result = label
      if (dirIndicator && showDirectionalText) {
        result = `${result} ${dirIndicator}`
      }
    } else {
      result = `${displayInfo.symbol} ${label}`
      if (dirIndicator && showDirectionalText) {
        result = `${result} ${dirIndicator}`
      }
    }
  } else {
    result = label
  }
  return result
}

export function ModifierKey({
  keyboardKey,
  symbol,
  side,
  isDarkMode = false
}: {
  keyboardKey: string
  symbol?: string
  side?: string
  isDarkMode?: boolean
}): JSX.Element {
  const primaryColor = isDarkMode ? '#ccc' : '#666'
  const secondaryColor = isDarkMode ? '#999' : '#999'

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      className="select-none"
    >
      <text
        x="40"
        y="28"
        fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="18"
        fontWeight="400"
        fill={primaryColor}
        textAnchor="middle"
      >
        {symbol}
      </text>
      <text
        x="40"
        y={side ? '55' : '60'}
        fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="11"
        fontWeight="400"
        fill={primaryColor}
        textAnchor="middle"
      >
        {keyboardKey}
      </text>
      {side && (
        <text
          x="40"
          y="69"
          fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
          fontSize="8"
          fontWeight="400"
          fill={secondaryColor}
          textAnchor="middle"
        >
          {getSideHintLabel(side)}
        </text>
      )}
    </svg>
  )
}

export function DefaultKey({
  keyboardKey,
  isDarkMode = false
}: {
  keyboardKey: string
  isDarkMode?: boolean
}): JSX.Element {
  let label = keyboardKey
  if (/^[a-zA-Z]$/.test(label)) label = label.toUpperCase()
  let fontSize = 20
  if (label.length > 3) fontSize = 18
  if (label.length > 6) fontSize = 16
  const textColor = isDarkMode ? '#ccc' : '#666'

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      className="select-none"
    >
      <text
        x="40"
        y="44"
        fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize={fontSize}
        fontWeight="400"
        fill={textColor}
        textAnchor="middle"
      >
        {label}
      </text>
    </svg>
  )
}

export function KeyToRender({
  keyboardKey,
  platform = 'darwin',
  isDarkMode = false,
  hideModifierSide = false
}: {
  keyboardKey: string
  platform?: string
  isDarkMode?: boolean
  hideModifierSide?: boolean
}): JSX.Element {
  const displayInfo = getKeyDisplayInfo(keyboardKey, platform)
  if (displayInfo.isModifier && displayInfo.symbol) {
    return (
      <ModifierKey
        keyboardKey={displayInfo.label}
        symbol={displayInfo.symbol}
        side={hideModifierSide ? undefined : displayInfo.side}
        isDarkMode={isDarkMode}
      />
    )
  }
  return <DefaultKey keyboardKey={displayInfo.label} isDarkMode={isDarkMode} />
}

export interface KeyboardKeyProps {
  keyboardKey: string
  className?: string
  variant?: 'inline' | 'tile'
  isDarkMode?: boolean
  isPressed?: boolean
  hideModifierSide?: boolean
  style?: CSSProperties
  onClick?: () => void
}

export function KeyboardKey({
  keyboardKey,
  className = '',
  variant = 'tile',
  isDarkMode = false,
  isPressed = false,
  hideModifierSide = false,
  style,
  onClick
}: KeyboardKeyProps): JSX.Element {
  const platform = 'darwin'

  if (variant === 'inline') {
    const displayInfo = getKeyDisplayInfo(keyboardKey, platform)
    let finalDisplay = displayInfo.label
    if (!hideModifierSide && displayInfo.side) {
      finalDisplay += ` ${getSideHintLabel(displayInfo.side)}`
    }

    return (
      <kbd
        onClick={onClick}
        className={`inline-flex select-none items-center justify-center rounded-lg text-xs font-semibold backdrop-blur-sm transition-all duration-200 hover:brightness-105 active:scale-95 ${
          isPressed
            ? isDarkMode
              ? 'bg-blue-500/30 border border-blue-400/50 text-white shadow-input-dark'
              : 'bg-blue-100/90 border border-blue-200 text-blue-900 shadow-input'
            : isDarkMode
              ? 'bg-white/12 border border-white/2 text-white/90 shadow-input-dark'
              : 'bg-white/25 border border-white text-black shadow-input'
        } ${className}`.trim()}
        style={style}
      >
        {finalDisplay}
      </kbd>
    )
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.()
        }
      }}
      className={`rounded-lg backdrop-blur-sm transition-all duration-200 flex items-center justify-center ${
        isPressed
          ? isDarkMode
            ? 'bg-blue-500/30 border border-blue-400/50 shadow-input-dark'
            : 'bg-blue-100/90 border border-blue-200 shadow-input'
          : isDarkMode
            ? 'bg-white/10 border border-white/2 shadow-input-dark'
            : 'bg-white/25 border border-white shadow-input'
      } ${className}`.trim()}
      style={style}
    >
      <KeyToRender
        keyboardKey={keyboardKey}
        platform={platform}
        isDarkMode={isDarkMode}
        hideModifierSide={hideModifierSide}
      />
    </div>
  )
}
