import type { JSX } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipData {
  x: number
  y: number
  title: string
  detail: string
}

export interface ChartTooltipProps {
  tooltip: TooltipData | null
  isDarkMode?: boolean
}

const HALF_WIDTH = 90

export function ChartTooltip({ tooltip, isDarkMode = true }: ChartTooltipProps): JSX.Element | null {
  if (!tooltip) return null

  const left = Math.min(
    Math.max(tooltip.x, HALF_WIDTH),
    typeof window !== 'undefined' ? window.innerWidth - HALF_WIDTH : tooltip.x
  )

  return createPortal(
    <div
      className="fixed z-[100] pointer-events-none select-none"
      style={{
        left,
        top: tooltip.y,
        transform: 'translate(-50%, calc(-100% - 10px))'
      }}
    >
      <div
        className="px-3 py-1.5 rounded-xl text-center shadow-xl border backdrop-blur-md transition-all duration-150"
        style={{
          backgroundColor: isDarkMode ? '#222327' : '#ffffff',
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
          boxShadow: isDarkMode
            ? '0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            : '0 8px 24px rgba(0, 0, 0, 0.12)'
        }}
      >
        <p
          className={`text-xs font-semibold whitespace-nowrap ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
        >
          {tooltip.title}
        </p>
        <p
          className={`text-[11px] whitespace-nowrap mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
        >
          {tooltip.detail}
        </p>
      </div>
    </div>,
    document.body
  )
}
