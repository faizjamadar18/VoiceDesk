import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import voiceosAppIcon from '../../assets/voiceos-app-icon.png'
import {
  AISparkleIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  FlagIcon,
  MicIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  XIcon
} from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'

/**
 * Matches the numeric mode values used by the voice-session backend so this
 * view can accept real sessions later without a mapping layer.
 */
export const VoiceOSMode = {
  DICTATE: 0,
  EDIT: 1,
  WRITE: 2,
  AGENT: 3
} as const

export type VoiceOSMode = (typeof VoiceOSMode)[keyof typeof VoiceOSMode]

export interface HistorySession {
  id: string
  app_name: string
  mode: VoiceOSMode
  created_at: string
  transcript: string
  generated_text?: string
  audio_file_path?: string
  chat_history?: string
}

export interface HistoryPageProps {
  /** Replace with fetched sessions when the backend is connected. */
  sessions?: HistorySession[]
  /** Optional app name -> icon URL map, matching the desktop app icon API. */
  appIcons?: Record<string, string>
  onDeleteSession?: (id: string) => void
  onRetranscribe?: (id: string) => void
  onReportIssue?: (session: HistorySession) => void
}

const DEFAULT_APP_ICONS: Record<string, string> = {
  VoiceOS: voiceosAppIcon
}

const RECOVERABLE_FAILURE_TRANSCRIPTS = new Set([
  'Transcription failed. Audio saved for retranscription.',
  'Audio saved for retranscription. No transcript yet.'
])

const now = Date.now()
const minutesAgo = (minutes: number): string =>
  new Date(now - minutes * 60_000).toISOString()

/**
 * UI-only sample data. It mirrors the shape returned by the voice-session
 * backend, so wiring real data later only means passing `sessions` in.
 */
export const DUMMY_HISTORY_SESSIONS: HistorySession[] = [
  {
    id: 'dummy-session-1',
    app_name: 'VoiceOS',
    mode: VoiceOSMode.DICTATE,
    created_at: minutesAgo(40),
    transcript: 'Transcription failed. Audio saved for retranscription.',
    audio_file_path: 'dummy-session-1.wav'
  },
  {
    id: 'dummy-session-2',
    app_name: 'VoiceOS',
    mode: VoiceOSMode.DICTATE,
    created_at: minutesAgo(70),
    transcript:
      'Hi Bob.\n\nIt was a great meeting with you today. Do you have time on Monday to follow up?\n\nBest,\nFaiz'
  },
  {
    id: 'dummy-session-3',
    app_name: 'VoiceOS',
    mode: VoiceOSMode.DICTATE,
    created_at: minutesAgo(95),
    transcript:
      "Nothing, just trying to build up the things which I'm planning for and ship it as soon as possible."
  },
  {
    id: 'dummy-session-4',
    app_name: 'VoiceOS',
    mode: VoiceOSMode.DICTATE,
    created_at: minutesAgo(26 * 60),
    transcript:
      'Hi Bob.\n\nHi Wazir,\n\nIt was great meeting with you today. Do you have time on Monday to follow up?\n\nBest,\nFaiz'
  },
  {
    id: 'dummy-session-5',
    app_name: 'VoiceOS',
    mode: VoiceOSMode.DICTATE,
    created_at: minutesAgo(31 * 60),
    transcript: 'Planning on going to the gym?'
  }
]

function getModeDisplayName(mode: VoiceOSMode): string {
  switch (mode) {
    case VoiceOSMode.DICTATE:
      return 'Dictate Mode'
    case VoiceOSMode.EDIT:
      return 'Edit Mode'
    case VoiceOSMode.WRITE:
      return 'Ask Mode'
    case VoiceOSMode.AGENT:
      return 'Agent Mode'
    default:
      return 'Unknown'
  }
}

function getModeLabel(mode: VoiceOSMode): string {
  switch (mode) {
    case VoiceOSMode.AGENT:
      return 'Agent Mode'
    case VoiceOSMode.WRITE:
    case VoiceOSMode.EDIT:
      return 'Ask Mode'
    default:
      return 'Dictation Mode'
  }
}

function getModeIcon(mode: VoiceOSMode): JSX.Element {
  if (mode === VoiceOSMode.AGENT) {
    return <AISparkleIcon />
  }
  return <MicIcon />
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function isRecoverableFailureSession(session: HistorySession): boolean {
  return (
    session.mode === VoiceOSMode.DICTATE &&
    !!session.audio_file_path &&
    !!session.transcript &&
    RECOVERABLE_FAILURE_TRANSCRIPTS.has(session.transcript.trim())
  )
}

export function HistoryPage({
  sessions = DUMMY_HISTORY_SESSIONS,
  appIcons = DEFAULT_APP_ICONS,
  onDeleteSession,
  onRetranscribe,
  onReportIssue
}: HistoryPageProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<VoiceOSMode | null>(
    VoiceOSMode.DICTATE
  )
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const copyTimers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const timers = copyTimers.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const appNames = useMemo(() => {
    const names = new Set<string>()
    sessions.forEach((session) => {
      if (session.app_name) names.add(session.app_name)
    })
    return Array.from(names).sort()
  }, [sessions])

  const filteredSessions = useMemo(() => {
    let filtered = sessions

    if (selectedApp) {
      filtered = filtered.filter(
        (session) => session.app_name === selectedApp
      )
    }
    if (selectedMode !== null) {
      filtered = filtered.filter((session) => session.mode === selectedMode)
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (session) =>
          session.transcript?.toLowerCase().includes(query) ||
          session.generated_text?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [searchQuery, selectedApp, selectedMode, sessions])

  const handleCopy = async (text: string, key: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedItems((previous) => new Set(previous).add(key))

      const existingTimer = copyTimers.current.get(key)
      if (existingTimer) window.clearTimeout(existingTimer)

      const timer = window.setTimeout(() => {
        setCopiedItems((previous) => {
          const next = new Set(previous)
          next.delete(key)
          return next
        })
        copyTimers.current.delete(key)
      }, 2000)

      copyTimers.current.set(key, timer)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleDelete = (id: string): void => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      window.setTimeout(() => {
        setConfirmDeleteId((current) => (current === id ? null : current))
      }, 3000)
      return
    }

    setConfirmDeleteId(null)
    onDeleteSession?.(id)
  }

  const hasActiveFilter =
    !!searchQuery || !!selectedApp || selectedMode !== null

  return (
    <div className="history-page">
      <h1
        className="history-title"
        style={{
          color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : '#000',
          letterSpacing: '-0.02em'
        }}
      >
        History
      </h1>

      <div className="history-toolbar">
        <div className="history-search">
          <SearchIcon
            className="history-search-icon"
            style={{
              color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#999'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search history"
            aria-label="Search history"
            className={`history-search-input ${
              isDarkMode
                ? 'bg-[var(--dark-card-background)] border border-[var(--dark-modal-control-border)] text-gray-100 placeholder-gray-500 focus:border-[var(--dark-modal-control-hover-border)] focus:ring-[var(--dark-modal-divider)]'
                : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:ring-gray-400/20'
            }`}
            style={{
              boxShadow: isDarkMode
                ? '0 1px 4px rgba(0, 0, 0, 0.18), inset 0 1px 0 var(--dark-surface-highlight)'
                : 'inset 0 1px 2px rgba(0, 0, 0, 0.05), 0 1px 0 rgba(255, 255, 255, 0.8)'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="history-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              style={{
                color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#999'
              }}
            >
              <XIcon />
            </button>
          )}
        </div>

        <div className="history-filter">
          <select
            value={selectedApp ?? 'all'}
            onChange={(event) =>
              setSelectedApp(
                event.target.value === 'all' ? null : event.target.value
              )
            }
            aria-label="Filter by app"
            className={`history-filter-select ${
              isDarkMode
                ? 'text-gray-200 border border-white/[0.04] bg-clip-padding bg-gradient-to-b from-white/[0.08] to-white/[0.01] hover:text-white hover:border-white/[0.08]'
                : 'text-gray-700 border border-black/[0.04] bg-clip-padding bg-gradient-to-b from-white to-black/[0.02] hover:text-gray-900 hover:border-black/[0.08]'
            }`}
          >
            <option value="all">All Apps</option>
            {appNames.map((appName) => (
              <option key={appName} value={appName}>
                {appName}
              </option>
            ))}
          </select>
          <ChevronsUpDownIcon
            className="history-filter-chevron"
            style={{ color: isDarkMode ? '#e5e7eb' : '#4b5563' }}
          />
        </div>

        <div className="history-filter">
          <select
            value={selectedMode === null ? 'all' : String(selectedMode)}
            onChange={(event) =>
              setSelectedMode(
                event.target.value === 'all'
                  ? null
                  : (Number(event.target.value) as VoiceOSMode)
              )
            }
            aria-label="Filter by mode"
            className={`history-filter-select ${
              isDarkMode
                ? 'text-gray-200 border border-white/[0.04] bg-clip-padding bg-gradient-to-b from-white/[0.08] to-white/[0.01] hover:text-white hover:border-white/[0.08]'
                : 'text-gray-700 border border-black/[0.04] bg-clip-padding bg-gradient-to-b from-white to-black/[0.02] hover:text-gray-900 hover:border-black/[0.08]'
            }`}
          >
            <option value="all">All Modes</option>
            <option value={String(VoiceOSMode.DICTATE)}>Dictate Mode</option>
            <option value={String(VoiceOSMode.AGENT)}>Agent Mode</option>
          </select>
          <ChevronsUpDownIcon
            className="history-filter-chevron"
            style={{ color: isDarkMode ? '#e5e7eb' : '#4b5563' }}
          />
        </div>
      </div>

      {hasActiveFilter && (
        <div
          className="history-status"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#666'
          }}
        >
          Showing {filteredSessions.length} of {sessions.length} sessions
          {selectedApp ? ` in ${selectedApp}` : ''}
          {selectedMode !== null
            ? ` in ${getModeDisplayName(selectedMode)}`
            : ''}
          {searchQuery ? ` matching "${searchQuery}"` : ''}
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <div
          className="history-empty"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
          }}
        >
          {sessions.length === 0
            ? 'No voice sessions yet. Start using VoiceOS to see your history here.'
            : 'No sessions found matching your filters.'}
        </div>
      ) : (
        <div className="history-list">
          {filteredSessions.map((session) => {
            const appIcon = appIcons[session.app_name]
            const isRecoverableFailure = isRecoverableFailureSession(session)
            const transcriptCopyKey = `${session.id}-transcript`
            const isCopied = copiedItems.has(transcriptCopyKey)

            return (
              <article
                className="history-card"
                key={session.id}
                style={{
                  background: isDarkMode
                    ? 'var(--dark-dashboard-card-background, #222327)'
                    : 'linear-gradient(165deg, rgb(252, 252, 252), rgb(248, 248, 248))',
                  border: isDarkMode
                    ? '1px solid var(--dark-border-subtle, rgba(223, 226, 232, 0.06))'
                    : '1px solid #ffffff',
                  boxShadow: isDarkMode
                    ? '0 1px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 var(--dark-surface-highlight, rgba(239, 241, 245, 0.02))'
                    : 'none'
                }}
              >
                <header className="history-card-header">
                  <div
                    className="history-app"
                    style={{
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : '#333'
                    }}
                  >
                    {appIcon && (
                      <img
                        src={appIcon}
                        alt=""
                        className="history-app-icon"
                      />
                    )}
                    <span>{session.app_name}</span>
                  </div>

                  <div className="history-actions">
                    <span
                      className="history-time"
                      style={{
                        backgroundColor: isDarkMode
                          ? 'rgba(255, 255, 255, 0.1)'
                          : 'rgba(0, 0, 0, 0.03)',
                        color: isDarkMode
                          ? 'rgba(255, 255, 255, 0.7)'
                          : '#666'
                      }}
                    >
                      {formatRelativeTime(session.created_at)}
                    </span>

                    {session.mode === VoiceOSMode.DICTATE &&
                      session.audio_file_path && (
                        <button
                          type="button"
                          className="history-action-button"
                          onClick={() => onRetranscribe?.(session.id)}
                          title="Re-transcribe"
                          aria-label="Re-transcribe"
                          style={{
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                          }}
                        >
                          <RefreshIcon />
                        </button>
                      )}

                    <button
                      type="button"
                      className="history-action-button"
                      onClick={() => onReportIssue?.(session)}
                      title="Report issue"
                      aria-label="Report issue"
                      style={{
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                      }}
                    >
                      <FlagIcon />
                    </button>

                    <button
                      type="button"
                      className={`history-action-button${
                        confirmDeleteId === session.id
                          ? ' history-action-button--danger'
                          : ''
                      }`}
                      onClick={() => handleDelete(session.id)}
                      title={
                        confirmDeleteId === session.id
                          ? 'Click again to confirm'
                          : 'Delete'
                      }
                      aria-label={
                        confirmDeleteId === session.id
                          ? 'Click again to confirm delete'
                          : 'Delete'
                      }
                      style={{
                        color:
                          confirmDeleteId === session.id
                            ? '#ef4444'
                            : isDarkMode
                              ? 'rgba(255, 255, 255, 0.5)'
                              : '#888'
                      }}
                    >
                      {confirmDeleteId === session.id ? (
                        <CheckIcon />
                      ) : (
                        <TrashIcon />
                      )}
                    </button>
                  </div>
                </header>

                <h3
                  className="history-mode"
                  style={{
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : '#000'
                  }}
                >
                  <span
                    style={{
                      color: isDarkMode ? '#D1D5DB' : '#9ca3af',
                      display: 'inline-flex'
                    }}
                  >
                    {getModeIcon(session.mode)}
                  </span>
                  {getModeLabel(session.mode)}
                </h3>

                {isRecoverableFailure ? (
                  <div
                    className="history-recoverable"
                    style={{
                      backgroundColor: isDarkMode
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.03)',
                      border: isDarkMode
                        ? '1px solid rgba(255, 255, 255, 0.1)'
                        : '1px solid rgba(0, 0, 0, 0.06)'
                    }}
                  >
                    <h4
                      style={{
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : '#222'
                      }}
                    >
                      Audio saved for retranscription
                    </h4>
                    <p
                      style={{
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.62)' : '#666'
                      }}
                    >
                      This is not a transcript yet. Use the retry button to
                      transcribe the saved audio.
                    </p>
                  </div>
                ) : (
                  <div className="history-transcript">
                    <p
                      style={{
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : '#666'
                      }}
                    >
                      {stripMarkdownLinks(session.transcript)}
                    </p>
                    <button
                      type="button"
                      className="history-copy-button"
                      onClick={() =>
                        handleCopy(session.transcript, transcriptCopyKey)
                      }
                      title={isCopied ? 'Copied!' : 'Copy'}
                      aria-label={isCopied ? 'Copied' : 'Copy transcript'}
                      style={{
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                      }}
                    >
                      {isCopied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
