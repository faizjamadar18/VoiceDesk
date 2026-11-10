import type { JSX } from 'react'
import {
  BrainIcon,
  CheckCircleIcon,
  SparklesIcon,
  TimerIcon,
  ZapIcon
} from '../../components/dashboard-icons'
import { POLISH_OPTIONS } from './dummy-data'
import type { PolishStyle } from './types'

export interface PolishingSectionProps {
  selectedStyle: PolishStyle
  onSelectStyle: (style: PolishStyle) => void
}

function getTagIcon(style: PolishStyle): JSX.Element {
  switch (style) {
    case 'none':
      return <ZapIcon className="w-3 h-3 text-amber-400" />
    case 'light':
      return <TimerIcon className="w-3 h-3 text-sky-400" />
    case 'polished':
      return <BrainIcon className="w-3 h-3 text-purple-400" />
  }
}

export function PolishingSection({
  selectedStyle,
  onSelectStyle
}: PolishingSectionProps): JSX.Element {
  return (
    <section className="dictation-card" aria-labelledby="polishing-heading">
      <div className="dictation-card-header">
        <div className="dictation-section-info">
          <SparklesIcon className="dictation-section-icon" />
          <div>
            <h2 id="polishing-heading" className="dictation-section-title">
              Polishing
            </h2>
            <p className="dictation-section-desc">
              Choose how much VoiceOS cleans up your dictation
            </p>
          </div>
        </div>
      </div>

      <div className="dictation-polish-grid">
        {POLISH_OPTIONS.map((option) => {
          const isSelected = option.id === selectedStyle

          return (
            <button
              key={option.id}
              type="button"
              className={`dictation-preset-button group ${
                isSelected ? 'dictation-preset-button--selected' : ''
              }`}
              onClick={() => onSelectStyle(option.id)}
              aria-pressed={isSelected}
            >
              <div className="dictation-preset-top-row">
                <div className="dictation-preset-label-group">
                  <span
                    className={`dictation-preset-label ${
                      isSelected ? 'dictation-preset-label--active' : ''
                    }`}
                  >
                    {option.label}
                  </span>
                  {isSelected && (
                    <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                </div>

                <span className="dictation-tag-badge">
                  {getTagIcon(option.id)}
                  <span>{option.tag}</span>
                </span>
              </div>

              <div
                className={`dictation-preset-card-body ${
                  isSelected ? 'dictation-preset-card-body--selected' : ''
                }`}
              >
                <ul className="dictation-preset-bullets">
                  {option.desc.map((line) => (
                    <li key={line}>
                      <span className="dictation-bullet-dot">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <div className="dictation-preset-bubble-wrapper">
                  <div className="dictation-quote-bubble">{option.example}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
