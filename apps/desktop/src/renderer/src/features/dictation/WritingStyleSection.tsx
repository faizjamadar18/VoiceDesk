import { useState } from 'react'
import type { JSX } from 'react'
import {
  BriefcaseIcon,
  CheckCircleIcon,
  GlobeIcon,
  MailIcon,
  MessageCircleIcon,
  PenLineIcon,
  PlusIcon,
  XIcon
} from '../../components/dashboard-icons'
import {
  WRITING_CONTEXT_TABS,
  getPresetsForContext,
  getPreviewText
} from './dummy-data'
import type { WritingContextType, WritingStylePresetId } from './types'

export interface WritingStyleSectionProps {
  activeContext: WritingContextType
  selectedPreset: WritingStylePresetId
  onSelectContext: (type: WritingContextType) => void
  onSelectPreset: (presetId: WritingStylePresetId) => void
  pinnedApps?: string[]
  onPinApp?: (appName: string) => void
  onUnpinApp?: (appName: string) => void
}

function getContextIcon(type: WritingContextType): JSX.Element {
  switch (type) {
    case 'personal_chat':
      return <MessageCircleIcon className="w-4 h-4" />
    case 'work_chat':
      return <BriefcaseIcon className="w-4 h-4" />
    case 'email':
      return <MailIcon className="w-4 h-4" />
    case 'other':
      return <GlobeIcon className="w-4 h-4" />
  }
}

export function WritingStyleSection({
  activeContext,
  selectedPreset,
  onSelectContext,
  onSelectPreset,
  pinnedApps = [],
  onPinApp,
  onUnpinApp
}: WritingStyleSectionProps): JSX.Element {
  const presets = getPresetsForContext(activeContext)
  const [isPinModalOpen, setIsPinModalOpen] = useState(false)
  const [newAppName, setNewAppName] = useState('')

  const handleAddPin = (): void => {
    const trimmed = newAppName.trim()
    if (!trimmed) return
    onPinApp?.(trimmed)
    setNewAppName('')
    setIsPinModalOpen(false)
  }

  return (
    <section className="dictation-card" aria-labelledby="writing-style-heading">
      <div className="dictation-card-header">
        <div className="dictation-section-info">
          <PenLineIcon className="dictation-section-icon" />
          <div>
            <h2 id="writing-style-heading" className="dictation-section-title">
              Writing Style
            </h2>
            <p className="dictation-section-desc">
              Choose by destination. Unpinned AI tools, code editors and unknown apps use Other.
            </p>
          </div>
        </div>
      </div>

      <div className="dictation-segmented-control-wrapper">
        <div
          role="tablist"
          aria-label="Writing destination categories"
          className="dictation-segmented-control"
        >
          {WRITING_CONTEXT_TABS.map((tab) => {
            const isSelected = tab.id === activeContext

            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                className={`dictation-segment-btn ${
                  isSelected ? 'dictation-segment-btn--selected' : ''
                }`}
                onClick={() => onSelectContext(tab.id)}
              >
                <span className="dictation-segment-icon">
                  {getContextIcon(tab.id)}
                </span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        className={`dictation-style-grid ${
          presets.length === 4
            ? 'dictation-style-grid--4cols'
            : 'dictation-style-grid--3cols'
        }`}
      >
        {presets.map((preset) => {
          const isSelected = preset.id === selectedPreset
          const previewText = getPreviewText(activeContext, preset.id)

          return (
            <button
              key={preset.id}
              type="button"
              className={`dictation-preset-button group ${
                isSelected ? 'dictation-preset-button--selected' : ''
              }`}
              onClick={() => onSelectPreset(preset.id)}
              aria-pressed={isSelected}
            >
              <div className="dictation-preset-top-row">
                <div className="dictation-preset-label-group">
                  <span
                    className={`dictation-preset-label ${
                      isSelected ? 'dictation-preset-label--active' : ''
                    }`}
                  >
                    {preset.label}
                  </span>
                  {isSelected && (
                    <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                </div>
              </div>

              <div
                className={`dictation-preset-card-body ${
                  isSelected ? 'dictation-preset-card-body--selected' : ''
                }`}
              >
                {activeContext === 'personal_chat' && (
                  <div className="imessage-preview-container">
                    <div className="imessage-sender-label">Faiz</div>
                    <div className="imessage-bubble-row">
                      <div className="imessage-bubble">
                        <span className="imessage-bubble-tail" aria-hidden="true" />
                        <span className="imessage-bubble-cutout" aria-hidden="true" />
                        <span className="imessage-bubble-text">{previewText}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeContext === 'work_chat' && (
                  <div className="slack-preview-container">
                    <div className="slack-preview-header">
                      <span className="slack-avatar">F</span>
                      <span className="slack-sender">Faiz</span>
                      <span className="slack-time">10:42 AM</span>
                    </div>
                    <p className="slack-body">{previewText}</p>
                  </div>
                )}

                {activeContext === 'email' && (
                  <div className="email-preview-container">
                    <div className="email-header-row">
                      <span className="email-label">From:</span>
                      <span className="email-sender">Faiz &lt;faiz@example.com&gt;</span>
                    </div>
                    <div className="email-body">{previewText}</div>
                  </div>
                )}

                {activeContext === 'other' && (
                  <div className="other-preview-container">
                    <p className="other-preview-text">{previewText}</p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="dictation-pinned-apps-bar">
        <div className="dictation-pinned-apps-left">
          <span className="dictation-pinned-apps-hint">
            {pinnedApps.length === 0
              ? 'Pinned apps always dictate in this style'
              : `Pinned (${pinnedApps.length}):`}
          </span>

          {pinnedApps.length > 0 && (
            <div className="dictation-pinned-tags">
              {pinnedApps.map((app) => (
                <span key={app} className="dictation-app-tag">
                  {app}
                  {onUnpinApp && (
                    <button
                      type="button"
                      className="dictation-app-tag-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUnpinApp(app)
                      }}
                      aria-label={`Unpin ${app}`}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="dictation-pin-app-btn"
          onClick={() => setIsPinModalOpen(true)}
        >
          <PlusIcon className="w-3 h-3" />
          <span>Pin app</span>
        </button>
      </div>

      {isPinModalOpen && (
        <div
          className="dictation-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-app-title"
        >
          <div className="dictation-modal-box">
            <div className="dictation-modal-header">
              <h3 id="pin-app-title" className="dictation-modal-title">
                Pin App to {activeContext.replace('_', ' ')}
              </h3>
              <button
                type="button"
                className="dictation-modal-close"
                onClick={() => setIsPinModalOpen(false)}
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="dictation-modal-body">
              <label htmlFor="pin-app-input" className="dictation-input-label">
                App name or executable
              </label>
              <input
                id="pin-app-input"
                type="text"
                className="dictation-input"
                placeholder="e.g., Slack, WhatsApp, Notion"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPin()
                }}
                autoFocus
              />
            </div>

            <div className="dictation-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsPinModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dictation-primary-button"
                onClick={handleAddPin}
                disabled={!newAppName.trim()}
              >
                Pin App
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
