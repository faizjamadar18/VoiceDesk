import type { JSX } from 'react'
import {
  BrainIcon,
  CheckCircleIcon,
  SparklesIcon,
  TimerIcon,
  ZapIcon
} from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import { Card } from '../profile/Card'
import { POLISH_OPTIONS } from './dummy-data'
import type { PolishStyle } from './types'

export interface PolishingSectionProps {
  selectedStyle: PolishStyle
  onSelectStyle: (style: PolishStyle) => void
  isDarkMode?: boolean
}

function parseAnnotatedExample(
  example: string
): Array<{ text: string; kind: 'plain' | 'removed' | 'fixed' }> {
  const spans: Array<{ text: string; kind: 'plain' | 'removed' | 'fixed' }> = []
  const marker = /~~(.+?)~~|==(.+?)==/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = marker.exec(example)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        text: example.slice(lastIndex, match.index),
        kind: 'plain'
      })
    }
    if (match[1] !== undefined) {
      spans.push({ text: match[1], kind: 'removed' })
    } else if (match[2] !== undefined) {
      spans.push({ text: match[2], kind: 'fixed' })
    }
    lastIndex = marker.lastIndex
  }
  if (lastIndex < example.length) {
    spans.push({ text: example.slice(lastIndex), kind: 'plain' })
  }
  return spans
}

const EDIT_MARK_BLUE_LIGHT = '10, 74, 179'
const EDIT_MARK_BLUE_DARK = '77, 141, 255'

function AnnotatedExample({
  markup,
  isDarkMode
}: {
  markup: string
  isDarkMode: boolean
}): JSX.Element {
  const blue = isDarkMode ? EDIT_MARK_BLUE_DARK : EDIT_MARK_BLUE_LIGHT
  return (
    <>
      {parseAnnotatedExample(markup).map((span, idx) => {
        if (span.kind === 'removed') {
          return (
            <span
              key={idx}
              className="line-through decoration-[1.5px]"
              style={{
                color: `rgba(${blue}, 0.85)`,
                textDecorationColor: `rgb(${blue})`
              }}
            >
              {span.text}
            </span>
          )
        }
        if (span.kind === 'fixed') {
          return (
            <span
              key={idx}
              className="rounded px-0.5 font-medium"
              style={{
                backgroundColor: `rgba(${blue}, ${isDarkMode ? 0.24 : 0.15})`,
                color: `rgb(${blue})`
              }}
            >
              {span.text}
            </span>
          )
        }
        return <span key={idx}>{span.text}</span>
      })}
    </>
  )
}

const PREVIEW_CARD_DARK_BACKGROUND = 'var(--dark-preview-background, #1b1c1f)'
const PREVIEW_CARD_LIGHT_BACKGROUND =
  'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))'

export function getGlassCardStyle(
  isSelected: boolean,
  isDarkMode: boolean
): React.CSSProperties {
  return {
    background: isDarkMode ? PREVIEW_CARD_DARK_BACKGROUND : PREVIEW_CARD_LIGHT_BACKGROUND,
    border: isSelected
      ? isDarkMode
        ? '2px solid var(--dark-border-selected, rgba(223, 226, 232, 0.18))'
        : '2px solid rgba(100, 116, 139, 0.14)'
      : '2px solid transparent',
    boxShadow: isSelected
      ? isDarkMode
        ? '0 3px 10px rgba(0, 0, 0, 0.24)'
        : '0 2px 8px rgba(0, 0, 0, 0.06)'
      : isDarkMode
        ? '0 2px 8px rgba(0, 0, 0, 0.22)'
        : '0 1px 3px rgba(0, 0, 0, 0.055)',
    transition: 'border-color 0.25s ease, background 0.3s ease, box-shadow 0.3s ease'
  }
}

function getTagIcon(style: PolishStyle): JSX.Element {
  switch (style) {
    case 'none':
      return <ZapIcon className="w-3 h-3" />
    case 'light':
      return <TimerIcon className="w-3 h-3" />
    case 'polished':
      return <BrainIcon className="w-3 h-3" />
  }
}

export function PolishingSection({
  selectedStyle,
  onSelectStyle,
  isDarkMode: propIsDarkMode
}: PolishingSectionProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const bubbleClass = `w-full rounded-2xl rounded-br-md px-3 py-2 text-[12px] leading-relaxed whitespace-pre-line ${
    isDarkMode ? 'bg-white/[0.055] text-gray-300' : 'bg-black/[0.025] text-gray-600'
  }`

  return (
    <Card isDarkMode={isDarkMode} className="p-5 mb-5">
      <div className="flex items-center gap-3 mb-4">
        <SparklesIcon
          className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
        />
        <div>
          <h3
            id="polishing-heading"
            className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
          >
            Polishing
          </h3>
          <p
            className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
          >
            Choose how much VoiceOS cleans up your dictation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-stretch">
        {POLISH_OPTIONS.map((option) => {
          const isSelected = option.id === selectedStyle

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectStyle(option.id)}
              className="group text-left flex flex-col border-0 bg-transparent glass-preset-card p-0 outline-none"
            >
              <div className="pb-1.5 px-0.5 flex items-center justify-between gap-2">
                <div
                  className={`text-xs transition-all duration-200 flex items-center gap-1 ${
                    isSelected
                      ? 'font-semibold text-[var(--color-voiceos-blue,#126ff6)]'
                      : `font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`
                  }`}
                >
                  {option.label}
                  {isSelected && (
                    <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                </div>

                <span
                  className={`flex-shrink-0 inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full text-[10px] font-medium tracking-wide ${
                    isDarkMode ? 'bg-white/[0.08] text-gray-400' : 'bg-black/[0.05] text-gray-500'
                  }`}
                >
                  {getTagIcon(option.id)}
                  {option.tag}
                </span>
              </div>

              <div className="flex-1 flex flex-col">
                <div
                  className="rounded-xl overflow-hidden flex flex-col h-full"
                  style={getGlassCardStyle(isSelected, isDarkMode)}
                >
                  <div className="px-3 pt-2.5 pb-1">
                    <ul
                      className={`text-[10px] leading-snug space-y-0.5 ${
                        isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      {option.desc.map((line) => (
                        <li key={line} className="flex gap-1.5">
                          <span className="flex-shrink-0">·</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="px-3 pb-3 pt-1.5 flex-1">
                    {option.annotated ? (
                      <div className="relative w-full">
                        <div
                          className={`${bubbleClass} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
                        >
                          <AnnotatedExample
                            markup={option.annotated}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                        <div
                          className={`${bubbleClass} absolute inset-x-0 top-0 opacity-100 group-hover:opacity-0 transition-opacity duration-200`}
                        >
                          {option.example}
                        </div>
                      </div>
                    ) : (
                      <div className={bubbleClass}>{option.example}</div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
