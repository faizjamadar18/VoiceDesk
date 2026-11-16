import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
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
import type { HistoryRecord } from '../../../../shared/types'
import voiceosAppIcon from '../../assets/voiceos-app-icon.png'
import cloudsBlue from '../../voiceos-notch/assets/cloudsBlue.png'

export interface HistoryPageProps {
  /** Saved turns, newest first. */
  records?: HistoryRecord[]
  onDeleteRecord?: (id: string) => void
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
}

export function formatRelativeTime(dateString: string): string {
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

/**
 * Filter records by search query, selected app, and selected mode.
 */
export function filterRecords(
  records: HistoryRecord[],
  query: string,
  selectedApp?: string | null,
  selectedMode?: 'dictate' | 'agent' | null
): HistoryRecord[] {
  let filtered = records

  if (selectedApp) {
    filtered = filtered.filter(
      (record) => (record.appName || 'VoiceOS') === selectedApp
    )
  }

  if (selectedMode) {
    filtered = filtered.filter(
      (record) => (record.mode || 'agent') === selectedMode
    )
  }

  const needle = query.trim().toLowerCase()
  if (!needle) return filtered

  return filtered.filter(
    (record) =>
      record.prompt.toLowerCase().includes(needle) ||
      record.reply.toLowerCase().includes(needle) ||
      (record.appName && record.appName.toLowerCase().includes(needle))
  )
}

export function HistoryPage({
  records = [],
  onDeleteRecord
}: HistoryPageProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<'dictate' | 'agent' | null>(null)
  const [isAppDropdownOpen, setIsAppDropdownOpen] = useState(false)
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false)
  const appDropdownRef = useRef<HTMLDivElement>(null)
  const modeDropdownRef = useRef<HTMLDivElement>(null)

  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set())
  const [retranscribingItems, setRetranscribingItems] = useState<Set<string>>(new Set())
  const copyTimers = useRef<Map<string, number>>(new Map())
  const deleteTimers = useRef<Map<string, number>>(new Map())
  const feedbackTimers = useRef<Map<string, number>>(new Map())
  const retranscribeTimers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        appDropdownRef.current &&
        !appDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAppDropdownOpen(false)
      }
      if (
        modeDropdownRef.current &&
        !modeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsModeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const activeCopyTimers = copyTimers.current
    const activeDeleteTimers = deleteTimers.current
    const activeFeedbackTimers = feedbackTimers.current
    const activeRetranscribeTimers = retranscribeTimers.current
    return () => {
      activeCopyTimers.forEach((timer) => window.clearTimeout(timer))
      activeDeleteTimers.forEach((timer) => window.clearTimeout(timer))
      activeFeedbackTimers.forEach((timer) => window.clearTimeout(timer))
      activeRetranscribeTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const { uniqueApps, appIcons } = useMemo(() => {
    const apps = new Set<string>()
    const icons = new Map<string, string>()
    for (const record of records) {
      const appName = record.appName?.trim() || 'VoiceOS'
      apps.add(appName)
      if (record.appIcon && !icons.has(appName)) {
        icons.set(appName, record.appIcon)
      }
    }
    return {
      uniqueApps: Array.from(apps).sort((a, b) => a.localeCompare(b)),
      appIcons: icons
    }
  }, [records])

  const filteredRecords = useMemo(
    () => filterRecords(records, searchQuery, selectedApp, selectedMode),
    [records, searchQuery, selectedApp, selectedMode]
  )

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
      const existingTimer = deleteTimers.current.get(id)
      if (existingTimer) window.clearTimeout(existingTimer)

      const timer = window.setTimeout(() => {
        setConfirmDeleteId((current) => (current === id ? null : current))
        deleteTimers.current.delete(id)
      }, 3000)

      deleteTimers.current.set(id, timer)
      return
    }

    const existingTimer = deleteTimers.current.get(id)
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      deleteTimers.current.delete(id)
    }
    setConfirmDeleteId(null)
    onDeleteRecord?.(id)
  }

  const handleFeedback = (id: string): void => {
    setFeedbackSubmitted((previous) => new Set(previous).add(id))
    const existingTimer = feedbackTimers.current.get(id)
    if (existingTimer) window.clearTimeout(existingTimer)
    const timer = window.setTimeout(() => {
      setFeedbackSubmitted((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
      feedbackTimers.current.delete(id)
    }, 2000)
    feedbackTimers.current.set(id, timer)
  }

  const handleRetranscribe = (id: string): void => {
    setRetranscribingItems((previous) => new Set(previous).add(id))
    const existingTimer = retranscribeTimers.current.get(id)
    if (existingTimer) window.clearTimeout(existingTimer)
    const timer = window.setTimeout(() => {
      setRetranscribingItems((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
      retranscribeTimers.current.delete(id)
    }, 1500)
    retranscribeTimers.current.set(id, timer)
  }

  const hasActiveFilter = Boolean(searchQuery.trim() || selectedApp !== null || selectedMode !== null)

  const getModeLabel = (mode: 'dictate' | 'agent' | null): string => {
    if (mode === 'dictate') return 'Dictate Mode'
    if (mode === 'agent') return 'Agent Mode'
    return 'All Modes'
  }

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
        {/* Search input */}
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

        {/* All Apps Dropdown */}
        <div className="relative shrink-0" ref={appDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setIsAppDropdownOpen((prev) => !prev)
              setIsModeDropdownOpen(false)
            }}
            aria-haspopup="listbox"
            aria-expanded={isAppDropdownOpen}
            className={`px-4 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none ${
              isDarkMode
                ? 'text-gray-200 border border-white/5 bg-clip-padding bg-gradient-to-b from-white/10 to-transparent hover:text-white hover:border-white/10'
                : 'text-gray-700 border border-black/5 bg-clip-padding bg-gradient-to-b from-white to-black/5 hover:text-gray-900 hover:border-black/10'
            }`}
            style={{
              boxShadow: isDarkMode
                ? '0 1px 4px rgba(0, 0, 0, 0.18), inset 0 1px 0 var(--dark-surface-highlight)'
                : '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <span className="truncate max-w-40">{selectedApp || 'All Apps'}</span>
            <ChevronsUpDownIcon
              className="h-4 w-4 shrink-0"
              style={{ color: isDarkMode ? '#e5e7eb' : '#374151' }}
            />
          </button>

          {isAppDropdownOpen && (
            <div
              role="listbox"
              className={`absolute right-0 top-full mt-2 z-50 min-w-56 max-h-96 overflow-y-auto rounded-2xl border backdrop-blur-xl p-2 shadow-2xl ${
                isDarkMode
                  ? 'border-white/10 bg-[#1e2024] text-gray-100'
                  : 'border-gray-200 bg-white/95 text-gray-900 shadow-xl'
              }`}
            >
              <div
                role="option"
                aria-selected={selectedApp === null}
                tabIndex={0}
                onClick={() => {
                  setSelectedApp(null)
                  setIsAppDropdownOpen(false)
                }}
                className={`relative flex cursor-pointer select-none items-center rounded-lg py-2.5 px-3 text-sm font-medium outline-none transition-all duration-150 ${
                  isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                } ${
                  selectedApp === null
                    ? isDarkMode
                      ? 'bg-gradient-to-r from-white/5 via-white/10 to-white/5 shadow-inner backdrop-blur-sm'
                      : 'bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 shadow-inner backdrop-blur-sm'
                    : ''
                }`}
              >
                All Apps
              </div>
              {uniqueApps.map((app) => {
                const isSelected = selectedApp === app
                const appIcon = appIcons.get(app) || voiceosAppIcon
                return (
                  <div
                    key={app}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => {
                      setSelectedApp(app)
                      setIsAppDropdownOpen(false)
                    }}
                    className={`relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2.5 px-3 text-sm font-medium outline-none transition-all duration-150 ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                    } ${
                      isSelected
                        ? isDarkMode
                          ? 'bg-gradient-to-r from-white/5 via-white/10 to-white/5 shadow-inner backdrop-blur-sm'
                          : 'bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 shadow-inner backdrop-blur-sm'
                        : ''
                    }`}
                  >
                    <img
                      src={appIcon}
                      alt={app}
                      className="w-5 h-5 rounded shrink-0 object-contain"
                    />
                    <span className="truncate">{app}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* All Modes Dropdown */}
        <div className="relative shrink-0" ref={modeDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setIsModeDropdownOpen((prev) => !prev)
              setIsAppDropdownOpen(false)
            }}
            aria-haspopup="listbox"
            aria-expanded={isModeDropdownOpen}
            className={`px-4 py-2 rounded-xl flex items-center gap-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none ${
              isDarkMode
                ? 'text-gray-200 border border-white/5 bg-clip-padding bg-gradient-to-b from-white/10 to-transparent hover:text-white hover:border-white/10'
                : 'text-gray-700 border border-black/5 bg-clip-padding bg-gradient-to-b from-white to-black/5 hover:text-gray-900 hover:border-black/10'
            }`}
            style={{
              boxShadow: isDarkMode
                ? '0 1px 4px rgba(0, 0, 0, 0.18), inset 0 1px 0 var(--dark-surface-highlight)'
                : '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <span className="truncate">{getModeLabel(selectedMode)}</span>
            <ChevronsUpDownIcon
              className="h-4 w-4 shrink-0"
              style={{ color: isDarkMode ? '#e5e7eb' : '#374151' }}
            />
          </button>

          {isModeDropdownOpen && (
            <div
              role="listbox"
              className={`absolute right-0 top-full mt-2 z-50 min-w-44 max-h-96 overflow-y-auto rounded-2xl border backdrop-blur-xl p-2 shadow-2xl ${
                isDarkMode
                  ? 'border-white/10 bg-[#1e2024] text-gray-100'
                  : 'border-gray-200 bg-white/95 text-gray-900 shadow-xl'
              }`}
            >
              <div
                role="option"
                aria-selected={selectedMode === null}
                tabIndex={0}
                onClick={() => {
                  setSelectedMode(null)
                  setIsModeDropdownOpen(false)
                }}
                className={`relative flex cursor-pointer select-none items-center rounded-lg py-2.5 px-3 text-sm font-medium outline-none transition-all duration-150 ${
                  isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                } ${
                  selectedMode === null
                    ? isDarkMode
                      ? 'bg-gradient-to-r from-white/5 via-white/10 to-white/5 shadow-inner backdrop-blur-sm'
                      : 'bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 shadow-inner backdrop-blur-sm'
                    : ''
                }`}
              >
                All Modes
              </div>
              <div
                role="option"
                aria-selected={selectedMode === 'dictate'}
                tabIndex={0}
                onClick={() => {
                  setSelectedMode('dictate')
                  setIsModeDropdownOpen(false)
                }}
                className={`relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2.5 px-3 text-sm font-medium outline-none transition-all duration-150 ${
                  isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                } ${
                  selectedMode === 'dictate'
                    ? isDarkMode
                      ? 'bg-gradient-to-r from-white/5 via-white/10 to-white/5 shadow-inner backdrop-blur-sm'
                      : 'bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 shadow-inner backdrop-blur-sm'
                    : ''
                }`}
              >
                <MicIcon className="w-4 h-4 shrink-0" />
                <span>Dictate Mode</span>
              </div>
              <div
                role="option"
                aria-selected={selectedMode === 'agent'}
                tabIndex={0}
                onClick={() => {
                  setSelectedMode('agent')
                  setIsModeDropdownOpen(false)
                }}
                className={`relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2.5 px-3 text-sm font-medium outline-none transition-all duration-150 ${
                  isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                } ${
                  selectedMode === 'agent'
                    ? isDarkMode
                      ? 'bg-gradient-to-r from-white/5 via-white/10 to-white/5 shadow-inner backdrop-blur-sm'
                      : 'bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 shadow-inner backdrop-blur-sm'
                    : ''
                }`}
              >
                <AISparkleIcon className="w-4 h-4 shrink-0" />
                <span>Agent Mode</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {hasActiveFilter && (
        <div
          className="history-status"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#666'
          }}
        >
          Showing {filteredRecords.length} of {records.length} sessions
          {selectedApp ? ` in ${selectedApp}` : ''}
          {selectedMode ? ` in ${getModeLabel(selectedMode)}` : ''}
          {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
        </div>
      )}

      {filteredRecords.length === 0 ? (
        <div
          className="history-empty"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
          }}
        >
          {records.length === 0
            ? 'No voice sessions yet. Start using VoiceOS to see your history here.'
            : 'No sessions found matching your filters.'}
        </div>
      ) : (
        <div className="history-list">
          {filteredRecords.map((record) => {
            const promptCopyKey = `${record.id}-prompt`
            const replyCopyKey = `${record.id}-reply`
            const isPromptCopied = copiedItems.has(promptCopyKey)
            const isReplyCopied = copiedItems.has(replyCopyKey)
            const mode = record.mode ?? 'agent'
            const appName = record.appName?.trim() || 'VoiceOS'
            const appIcon = record.appIcon || appIcons.get(appName) || voiceosAppIcon

            return (
              <article
                className="history-card"
                key={record.id}
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
                {mode === 'agent' ? (
                  <>
                    <header className="history-card-header">
                      {/* Left: Sparkles icon + Agent Mode */}
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : '#666',
                            display: 'inline-flex'
                          }}
                        >
                          <AISparkleIcon size={16} />
                        </span>
                        <span
                          className="text-[15px] font-semibold tracking-tight"
                          style={{
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : '#333',
                            letterSpacing: '-0.01em'
                          }}
                        >
                          Agent Mode
                        </span>
                      </div>

                      {/* Right: Relative time pill + Flag + Delete */}
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
                          {formatRelativeTime(record.createdAt)}
                        </span>

                        <button
                          type="button"
                          className="history-action-button"
                          onClick={() => handleFeedback(record.id)}
                          title={feedbackSubmitted.has(record.id) ? 'Reported' : 'Report issue'}
                          aria-label={feedbackSubmitted.has(record.id) ? 'Reported' : 'Report issue'}
                          style={{
                            color: feedbackSubmitted.has(record.id)
                              ? isDarkMode ? 'rgba(255, 255, 255, 0.95)' : '#111827'
                              : isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                          }}
                        >
                          {feedbackSubmitted.has(record.id) ? (
                            <CheckIcon size={14} />
                          ) : (
                            <FlagIcon size={14} />
                          )}
                        </button>

                        <button
                          type="button"
                          className={`history-action-button${
                            confirmDeleteId === record.id
                              ? ' history-action-button--danger'
                              : ''
                          }`}
                          onClick={() => handleDelete(record.id)}
                          title={
                            confirmDeleteId === record.id
                              ? 'Click again to confirm'
                              : 'Delete'
                          }
                          aria-label={
                            confirmDeleteId === record.id
                              ? 'Click again to confirm delete'
                              : 'Delete'
                          }
                          style={{
                            color:
                              confirmDeleteId === record.id
                                ? '#ef4444'
                                : isDarkMode
                                  ? 'rgba(255, 255, 255, 0.5)'
                                  : '#888'
                          }}
                        >
                          {confirmDeleteId === record.id ? (
                            <CheckIcon size={14} />
                          ) : (
                            <TrashIcon size={14} />
                          )}
                        </button>
                      </div>
                    </header>

                    {/* User prompt */}
                    {record.prompt && (
                      <div className="mb-3">
                        <p
                          className="text-sm leading-relaxed"
                          style={{
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : '#666'
                          }}
                        >
                          {stripMarkdownLinks(record.prompt)}
                        </p>
                      </div>
                    )}

                    {/* Assistant response box with blue globe icon */}
                    {record.reply.trim() && (
                      <div
                        className="squircle-card rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: isDarkMode
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'rgba(0, 0, 0, 0.02)'
                        }}
                      >
                        <div className="relative">
                          <div
                            className="history-markdown text-sm leading-relaxed pr-8"
                            style={{
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : '#666'
                            }}
                          >
                            <div
                              className="cloud-viewport"
                              style={{
                                width: '14px',
                                height: '14px',
                                float: 'left',
                                marginRight: '6px',
                                marginTop: '5px',
                                backgroundImage: `url(${cloudsBlue})`,
                                boxShadow:
                                  '0 1px 4px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.35), inset 0 -1px 2px rgba(0, 0, 0, 0.2)'
                              }}
                            />
                            {stripMarkdownLinks(record.reply)}
                          </div>
                          <button
                            type="button"
                            className="history-copy-button absolute top-0 right-0 p-1.5 !rounded-lg"
                            onClick={() => handleCopy(record.reply, replyCopyKey)}
                            title={isReplyCopied ? 'Copied!' : 'Copy'}
                            aria-label={isReplyCopied ? 'Copied' : 'Copy reply'}
                            style={{
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                            }}
                          >
                            {isReplyCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <header className="history-card-header">
                      {/* Left: App icon + App name */}
                      <div className="history-app">
                        <img
                          src={appIcon}
                          alt={appName}
                          className="history-app-icon"
                          style={{
                            padding: appName.includes('.') ? '2px' : '0px'
                          }}
                        />
                        <span>{appName}</span>
                      </div>

                      {/* Right: Relative time pill + Refresh + Flag + Delete */}
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
                          {formatRelativeTime(record.createdAt)}
                        </span>

                        <button
                          type="button"
                          className="history-action-button"
                          onClick={() => handleRetranscribe(record.id)}
                          title={retranscribingItems.has(record.id) ? 'Retranscribing...' : 'Retranscribe'}
                          aria-label={retranscribingItems.has(record.id) ? 'Retranscribing...' : 'Retranscribe'}
                          style={{
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              transform: retranscribingItems.has(record.id) ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.5s ease'
                            }}
                          >
                            <RefreshIcon size={14} />
                          </span>
                        </button>

                        <button
                          type="button"
                          className="history-action-button"
                          onClick={() => handleFeedback(record.id)}
                          title={feedbackSubmitted.has(record.id) ? 'Reported' : 'Report issue'}
                          aria-label={feedbackSubmitted.has(record.id) ? 'Reported' : 'Report issue'}
                          style={{
                            color: feedbackSubmitted.has(record.id)
                              ? isDarkMode ? 'rgba(255, 255, 255, 0.95)' : '#111827'
                              : isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                          }}
                        >
                          {feedbackSubmitted.has(record.id) ? (
                            <CheckIcon size={14} />
                          ) : (
                            <FlagIcon size={14} />
                          )}
                        </button>

                        <button
                          type="button"
                          className={`history-action-button${
                            confirmDeleteId === record.id
                              ? ' history-action-button--danger'
                              : ''
                          }`}
                          onClick={() => handleDelete(record.id)}
                          title={
                            confirmDeleteId === record.id
                              ? 'Click again to confirm'
                              : 'Delete'
                          }
                          aria-label={
                            confirmDeleteId === record.id
                              ? 'Click again to confirm delete'
                              : 'Delete'
                          }
                          style={{
                            color:
                              confirmDeleteId === record.id
                                ? '#ef4444'
                                : isDarkMode
                                  ? 'rgba(255, 255, 255, 0.5)'
                                  : '#888'
                          }}
                        >
                          {confirmDeleteId === record.id ? (
                            <CheckIcon size={14} />
                          ) : (
                            <TrashIcon size={14} />
                          )}
                        </button>
                      </div>
                    </header>

                    {/* Mode subheader */}
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
                        <MicIcon size={16} />
                      </span>
                      Dictation Mode
                    </h3>

                    {/* Transcript */}
                    <div className="history-transcript">
                      <p
                        style={{
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : '#666'
                        }}
                      >
                        {stripMarkdownLinks(record.prompt)}
                      </p>
                      <button
                        type="button"
                        className="history-copy-button"
                        onClick={() => handleCopy(record.prompt, promptCopyKey)}
                        title={isPromptCopied ? 'Copied!' : 'Copy'}
                        aria-label={isPromptCopied ? 'Copied' : 'Copy prompt'}
                        style={{
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                        }}
                      >
                        {isPromptCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
