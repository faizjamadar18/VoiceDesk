import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  AISparkleIcon,
  CheckIcon,
  CopyIcon,
  SearchIcon,
  TrashIcon,
  XIcon
} from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import type { HistoryRecord } from '../../../../shared/types'

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
 * Case-insensitive match over the prompt and the reply. An empty or
 * whitespace-only query returns the records untouched.
 */
export function filterRecords(
  records: HistoryRecord[],
  query: string
): HistoryRecord[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return records

  return records.filter(
    (record) =>
      record.prompt.toLowerCase().includes(needle) ||
      record.reply.toLowerCase().includes(needle)
  )
}

export function HistoryPage({
  records = [],
  onDeleteRecord
}: HistoryPageProps): JSX.Element {
  const { isDarkMode } = useSystemTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const copyTimers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const timers = copyTimers.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const filteredRecords = useMemo(
    () => filterRecords(records, searchQuery),
    [searchQuery, records]
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
      window.setTimeout(() => {
        setConfirmDeleteId((current) => (current === id ? null : current))
      }, 3000)
      return
    }

    setConfirmDeleteId(null)
    onDeleteRecord?.(id)
  }

  const hasActiveFilter = !!searchQuery.trim()

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
      </div>

      {hasActiveFilter && (
        <div
          className="history-status"
          style={{
            color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#666'
          }}
        >
          Showing {filteredRecords.length} of {records.length} sessions
          {searchQuery ? ` matching "${searchQuery}"` : ''}
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
                <header className="history-card-header">
                  <div className="history-actions" style={{ marginLeft: 'auto' }}>
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
                    <AISparkleIcon />
                  </span>
                  Agent
                </h3>

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
                    {isPromptCopied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                <div className="history-reply">
                  <p
                    style={{
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#555'
                    }}
                  >
                    {stripMarkdownLinks(record.reply)}
                  </p>
                  <button
                    type="button"
                    className="history-copy-button"
                    onClick={() => handleCopy(record.reply, replyCopyKey)}
                    title={isReplyCopied ? 'Copied!' : 'Copy'}
                    aria-label={isReplyCopied ? 'Copied' : 'Copy reply'}
                    style={{
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#888'
                    }}
                  >
                    {isReplyCopied ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
