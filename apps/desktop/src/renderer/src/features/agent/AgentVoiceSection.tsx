import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { SparklesIcon } from '../../components/dashboard-icons'
import { AgentVoiceOrb } from './AgentVoiceOrb'
import { AppleSwitch } from './AppleSwitch'
import { CheckIcon, ChevronDownIcon } from './icons'
import {
  AGENT_SPEED_OPTIONS,
  AGENT_VOICE_OPTIONS,
  getVoiceById
} from './dummy-data'
import type { AgentSpeedPreset, AgentVoiceOption } from './types'

export interface AgentVoiceSectionProps {
  selectedVoiceId: string
  selectedSpeed: AgentSpeedPreset
  confirmationEnabled: boolean
  onSelectVoice: (voiceId: string) => void
  onSelectSpeed: (speed: AgentSpeedPreset) => void
  onToggleConfirmation: (enabled: boolean) => void
}

export function AgentVoiceSection({
  selectedVoiceId,
  selectedSpeed,
  confirmationEnabled,
  onSelectVoice,
  onSelectSpeed,
  onToggleConfirmation
}: AgentVoiceSectionProps): JSX.Element {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedVoice: AgentVoiceOption = getVoiceById(selectedVoiceId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  return (
    <section className="agent-card" aria-labelledby="agent-voice-heading">
      <div className="agent-card-header">
        <div className="agent-section-info">
          <SparklesIcon className="agent-section-icon" />
          <div>
            <h2 id="agent-voice-heading" className="agent-section-title">
              Agent voice
            </h2>
            <p className="agent-section-desc">
              Choose the voice used for short Agent Mode confirmations.
            </p>
          </div>
        </div>

        <div className="agent-voice-header-right">
          <div
            role="group"
            aria-label="Voice speed"
            className="agent-speed-group"
          >
            {AGENT_SPEED_OPTIONS.map((option) => {
              const isSelected = selectedSpeed === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!confirmationEnabled}
                  onClick={() => onSelectSpeed(option.id)}
                  className={`agent-speed-btn ${
                    isSelected ? 'agent-speed-btn--selected' : ''
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <AppleSwitch
            checked={confirmationEnabled}
            onToggle={() => onToggleConfirmation(!confirmationEnabled)}
            label="Enable Agent voice"
            variant="monochrome"
          />
        </div>
      </div>

      <div className="agent-voice-dropdown-wrapper" ref={dropdownRef}>
        <button
          type="button"
          disabled={!confirmationEnabled}
          onClick={() => setDropdownOpen((open) => !open)}
          aria-expanded={dropdownOpen}
          aria-label={`Selected Agent voice: ${selectedVoice.name}`}
          className="agent-voice-selector-btn"
        >
          <span className="agent-voice-selector-left">
            <AgentVoiceOrb voice={selectedVoice} size={26} />
            <span className="agent-voice-label-group">
              <span className="agent-voice-name">{selectedVoice.name}</span>
              <span className="agent-voice-desc">{selectedVoice.description}</span>
            </span>
          </span>

          <ChevronDownIcon
            width={14}
            height={14}
            className={`agent-voice-chevron ${
              dropdownOpen ? 'agent-voice-chevron--open' : ''
            }`}
          />
        </button>

        {dropdownOpen && (
          <div className="agent-voice-menu">
            <div className="agent-voice-menu-scroll">
              {AGENT_VOICE_OPTIONS.map((voice) => {
                const isSelected = voice.id === selectedVoice.id
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => {
                      onSelectVoice(voice.id)
                      setDropdownOpen(false)
                    }}
                    className={`agent-voice-menu-item ${
                      isSelected ? 'agent-voice-menu-item--selected' : ''
                    }`}
                  >
                    <span className="agent-voice-selector-left">
                      <AgentVoiceOrb voice={voice} size={24} />
                      <span className="agent-voice-menu-text">
                        <span className="agent-voice-name">{voice.name}</span>
                        <span className="agent-voice-desc">
                          {voice.description}
                        </span>
                      </span>
                    </span>

                    {isSelected && (
                      <CheckIcon
                        width={16}
                        height={16}
                        className="agent-voice-check"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
