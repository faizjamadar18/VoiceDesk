import { useState } from 'react'
import type { JSX } from 'react'
import {
  BriefcaseIcon,
  CheckCircleIcon,
  GlobeIcon,
  MailIcon,
  MessageCircleIcon,
  PenLineIcon,
  PenOffIcon,
  PlusIcon,
  XIcon
} from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import { Card } from '../profile/Card'
import { getGlassCardStyle } from './PolishingSection'
import {
  WRITING_CONTEXT_TABS,
  getPresetsForContext,
  getPreviewText
} from './dummy-data'
import type {
  PolishStyle,
  WritingContextType,
  WritingStylePresetId
} from './types'

export interface WritingStyleSectionProps {
  activeContext: WritingContextType
  selectedPreset: WritingStylePresetId
  onSelectContext: (type: WritingContextType) => void
  onSelectPreset: (presetId: WritingStylePresetId) => void
  pinnedApps?: string[]
  onPinApp?: (appName: string) => void
  onUnpinApp?: (appName: string) => void
  polishStyle?: PolishStyle
  isDarkMode?: boolean
  userName?: string
  userEmail?: string
}

function getContextIcon(type: WritingContextType): JSX.Element {
  switch (type) {
    case 'personal_chat':
      return <MessageCircleIcon className="w-3.5 h-3.5" />
    case 'work_chat':
      return <BriefcaseIcon className="w-3.5 h-3.5" />
    case 'email':
      return <MailIcon className="w-3.5 h-3.5" />
    case 'other':
      return <GlobeIcon className="w-3.5 h-3.5" />
  }
}

function SlackLogo({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" fill="none" aria-hidden="true">
      <path
        d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2S.8 87.3.8 80s5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2s13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2s-13.2-5.9-13.2-13.2V80z"
        fill="#E01E5A"
      />
      <path
        d="M47 27c-7.3 0-13.2-5.9-13.2-13.2S39.7.6 47 .6s13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9s5.9-13.2 13.2-13.2H47z"
        fill="#36C5F0"
      />
      <path
        d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2s13.2 5.9 13.2 13.2-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2s-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6s13.2 5.9 13.2 13.2v33.1z"
        fill="#2EB67D"
      />
      <path
        d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2s5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H80.1z"
        fill="#ECB22E"
      />
    </svg>
  )
}

const PREVIEW_CARD_DARK_BACKGROUND = 'var(--dark-preview-background, #1b1c1f)'
const PREVIEW_CARD_LIGHT_BACKGROUND =
  'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))'

export function WritingStyleSection({
  activeContext,
  selectedPreset,
  onSelectContext,
  onSelectPreset,
  pinnedApps = [],
  onPinApp,
  onUnpinApp,
  polishStyle = 'light',
  isDarkMode: propIsDarkMode,
  userName = 'Faiz',
  userEmail = 'faiz@example.com'
}: WritingStyleSectionProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const stylesDisabled = polishStyle === 'none'
  const presets = getPresetsForContext(activeContext)
  const [isPinModalOpen, setIsPinModalOpen] = useState(false)
  const [newAppName, setNewAppName] = useState('')

  const userInitials =
    userName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0]?.toUpperCase())
      .join('')
      .slice(0, 2) || 'F'

  const handleAddPin = (): void => {
    const trimmed = newAppName.trim()
    if (!trimmed) return
    onPinApp?.(trimmed)
    setNewAppName('')
    setIsPinModalOpen(false)
  }

  const bubbleColor = '#0b84fe'
  const cardBg = isDarkMode ? PREVIEW_CARD_DARK_BACKGROUND : PREVIEW_CARD_LIGHT_BACKGROUND

  return (
    <Card isDarkMode={isDarkMode} className="p-5 mt-3">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <PenLineIcon
            className={`w-5 h-5 transition-opacity duration-300 ${
              stylesDisabled ? 'opacity-40' : ''
            } ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          />
          <div>
            <h3
              id="writing-style-heading"
              className={`text-sm font-medium transition-opacity duration-300 ${
                stylesDisabled ? 'opacity-40' : ''
              } ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
            >
              Writing Style
            </h3>
            <p
              className={`text-xs mt-0.5 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              {stylesDisabled
                ? "Polishing is set to None, so writing styles aren't applied — choose Light or Polished above to use them."
                : 'Choose by destination. Unpinned AI tools, code editors, and unknown apps use Other.'}
            </p>
          </div>
        </div>
      </div>

      <div className={`relative ${stylesDisabled ? 'group/disabled cursor-not-allowed' : ''}`}>
        <div
          inert={stylesDisabled ? true : undefined}
          className={`transition-opacity duration-300 ${
            stylesDisabled ? 'opacity-40 grayscale group-hover/disabled:opacity-55' : ''
          }`}
        >
          {/* Segmented Control */}
          <div className="inline-flex shrink-0 mb-4">
            <div
              role="tablist"
              aria-label="Writing destination categories"
              className={`inline-flex gap-0.5 rounded-full p-0.5 transition-opacity ${
                isDarkMode ? 'bg-[var(--dark-segment-track,#ffffff0e)]' : 'bg-black/[0.045]'
              }`}
            >
              {WRITING_CONTEXT_TABS.map((tab) => {
                const isSelected = tab.id === activeContext

                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isSelected}
                    onClick={() => onSelectContext(tab.id)}
                    className={`inline-flex h-7 min-w-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-medium leading-none transition-all duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-voiceos-blue,#126ff6)]/40 ${
                      isSelected
                        ? isDarkMode
                          ? 'bg-[var(--dark-segment-selected,#ffffff1f)] text-white shadow-sm'
                          : 'bg-white text-gray-900 shadow-sm'
                        : isDarkMode
                          ? 'text-gray-400 hover:text-gray-200'
                          : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span className="flex h-3.5 w-3.5 items-center justify-center">
                      {getContextIcon(tab.id)}
                    </span>
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Presets Grid */}
          <div
            className={`grid gap-3 items-stretch ${
              presets.length === 4 ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            {presets.map((preset) => {
              const isSelected = preset.id === selectedPreset
              const previewText = getPreviewText(activeContext, preset.id)

              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectPreset(preset.id)}
                  className="text-left flex flex-col border-0 bg-transparent glass-preset-card p-0 outline-none"
                >
                  <div
                    className={`text-xs pb-1.5 px-0.5 transition-all duration-200 flex items-center gap-1 ${
                      isSelected
                        ? 'font-semibold text-[var(--color-voiceos-blue,#126ff6)]'
                        : `font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`
                    }`}
                  >
                    <span>{preset.label}</span>
                    {isSelected && (
                      <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    )}
                  </div>

                  <div className="flex-1 flex flex-col">
                    {/* iMessage preview */}
                    {activeContext === 'personal_chat' && (
                      <div
                        className="rounded-xl text-[13px] leading-relaxed flex flex-col h-full"
                        style={{
                          ...getGlassCardStyle(isSelected, isDarkMode),
                          background: cardBg
                        }}
                      >
                        <div className="px-3 pt-2 pb-3 flex flex-col gap-1.5 flex-1">
                          <span
                            className={`text-[10px] font-medium text-right ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-400'
                            }`}
                          >
                            {userName}
                          </span>
                          <div className="flex justify-end pr-2.5">
                            <div className="relative max-w-[85%]">
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  right: -8,
                                  width: 20,
                                  height: 20,
                                  backgroundColor: bubbleColor,
                                  borderBottomLeftRadius: 15
                                }}
                              />
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: -1,
                                  right: -10,
                                  width: 10,
                                  height: 21,
                                  background: cardBg,
                                  borderBottomLeftRadius: 10,
                                  zIndex: 1
                                }}
                              />
                              <div
                                className="relative z-[2] px-3 py-[7px] whitespace-pre-line text-white text-[12px] leading-snug"
                                style={{
                                  backgroundColor: bubbleColor,
                                  borderRadius: '18px 18px 4px 18px'
                                }}
                              >
                                {previewText}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Slack preview */}
                    {activeContext === 'work_chat' && (
                      <div
                        className="rounded-xl overflow-hidden text-[13px] leading-relaxed flex flex-col h-full"
                        style={getGlassCardStyle(isSelected, isDarkMode)}
                      >
                        <div className="px-2.5 pt-2.5 pb-1">
                          <div
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                              isDarkMode
                                ? 'bg-white/[0.06] text-gray-400'
                                : 'bg-black/[0.04] text-gray-500'
                            }`}
                          >
                            <SlackLogo size={11} />
                            <span>Slack</span>
                          </div>
                        </div>
                        <div className="px-2.5 pb-2.5 pt-1 flex gap-2 flex-1">
                          <div
                            className={`w-[22px] h-[22px] rounded-[5px] flex-shrink-0 flex items-center justify-center text-[8px] font-bold mt-0.5 ${
                              isDarkMode
                                ? 'bg-white/[0.12] text-gray-400'
                                : 'bg-gray-200 text-gray-500'
                            }`}
                          >
                            {userInitials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span
                                className={`text-[11px] font-bold leading-tight ${
                                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                                }`}
                              >
                                {userName}
                              </span>
                            </div>
                            <div
                              className={`whitespace-pre-line mt-0.5 text-[12px] leading-relaxed ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              {previewText}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Email preview */}
                    {activeContext === 'email' && (
                      <div
                        className="rounded-xl overflow-hidden text-[13px] leading-relaxed flex flex-col h-full"
                        style={getGlassCardStyle(isSelected, isDarkMode)}
                      >
                        <div
                          className={`px-3 pt-2.5 pb-1.5 border-b ${
                            isDarkMode ? 'border-white/[0.06]' : 'border-black/[0.06]'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[10px] ${
                                isDarkMode ? 'text-gray-500' : 'text-gray-400'
                              }`}
                            >
                              From:
                            </span>
                            <span
                              className={`text-[10px] font-medium ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-600'
                              }`}
                            >
                              {userName}
                            </span>
                          </div>
                          {userEmail && (
                            <span
                              className={`text-[9px] ${
                                isDarkMode ? 'text-gray-600' : 'text-gray-400'
                              }`}
                            >
                              {userEmail}
                            </span>
                          )}
                        </div>
                        <div
                          className={`px-3 py-2.5 whitespace-pre-line flex-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          {previewText}
                        </div>
                      </div>
                    )}

                    {/* Other preview */}
                    {activeContext === 'other' && (
                      <div
                        className="rounded-xl overflow-hidden text-[13px] leading-relaxed flex flex-col h-full"
                        style={getGlassCardStyle(isSelected, isDarkMode)}
                      >
                        <div
                          className={`px-3 py-4 whitespace-pre-line flex-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          {previewText}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Bottom Bar: Pinned Apps (Only when not 'other') */}
          {activeContext !== 'other' && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  Pinned apps always dictate in this style
                </span>
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                    isDarkMode
                      ? 'text-gray-200 border border-white/[0.04] bg-clip-padding bg-gradient-to-b from-white/[0.08] to-white/[0.01] hover:text-white hover:border-white/[0.08]'
                      : 'text-gray-700 border border-black/[0.04] bg-clip-padding bg-gradient-to-b from-white to-black/[0.02] hover:text-gray-900 hover:border-black/[0.08]'
                  }`}
                  onClick={() => setIsPinModalOpen(true)}
                >
                  <PlusIcon className="w-3 h-3" />
                  <span>Pin app</span>
                </button>
              </div>

              {pinnedApps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pinnedApps.map((app) => (
                    <div
                      key={app}
                      className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-lg text-xs ${
                        isDarkMode
                          ? 'bg-white/6 border border-white/6'
                          : 'bg-black/3 border border-black/4'
                      }`}
                    >
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                        {app}
                      </span>
                      {onUnpinApp && (
                        <button
                          type="button"
                          className={`p-0.5 rounded border transition-colors ${
                            isDarkMode
                              ? 'text-gray-300 border-white/[0.03] bg-clip-padding bg-gradient-to-b from-white/[0.05] to-white/[0.01] hover:text-gray-200 hover:border-white/[0.06]'
                              : 'text-gray-600 border-black/[0.03] bg-clip-padding bg-gradient-to-b from-white to-black/[0.015] hover:text-gray-800 hover:border-black/[0.06]'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onUnpinApp(app)
                          }}
                          title={`Unpin ${app}`}
                          aria-label={`Unpin ${app}`}
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Informational overlay when polishing is set to None */}
        {stylesDisabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div
              className="flex items-center gap-2 rounded-full px-3.5 py-1.5 opacity-80 group-hover/disabled:opacity-100 group-hover/disabled:scale-[1.02]"
              style={{
                ...getGlassCardStyle(true, isDarkMode),
                boxShadow: isDarkMode
                  ? '0 4px 16px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                  : '0 4px 16px rgba(0, 0, 0, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                transition: 'scale 0.3s ease, opacity 0.3s ease, box-shadow 0.35s ease'
              }}
            >
              <PenOffIcon
                className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
              />
              <span
                className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
              >
                Polishing is turned off
              </span>
            </div>
          </div>
        )}
      </div>

      {isPinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-app-title"
          onClick={() => setIsPinModalOpen(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl ${
              isDarkMode
                ? 'bg-[var(--dark-modal-background,#1a1b1e)] border border-white/10 text-white'
                : 'bg-white border border-gray-200 text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="pin-app-title" className="text-sm font-semibold">
                Pin App to {activeContext.replace('_', ' ')}
              </h3>
              <button
                type="button"
                className={`p-1 rounded-lg ${
                  isDarkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
                onClick={() => setIsPinModalOpen(false)}
                aria-label="Close dialog"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="pin-app-input"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Application Name
                </label>
                <input
                  id="pin-app-input"
                  type="text"
                  placeholder="e.g. Discord, Telegram, Notion"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPin()
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 text-white placeholder-gray-500'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                    isDarkMode
                      ? 'text-gray-300 hover:bg-white/10'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onClick={() => setIsPinModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-voiceos-blue,#126ff6)] hover:opacity-90 rounded-lg transition-opacity"
                  onClick={handleAddPin}
                >
                  Pin App
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
