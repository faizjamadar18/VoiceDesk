import { useState } from 'react'
import type { JSX } from 'react'
import {
  BookOpenIcon,
  PlusIcon,
  SparklesIcon,
  XIcon
} from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import { Card } from '../profile/Card'
import { DICTIONARY_EXAMPLES } from './dummy-data'
import type { SpellingEntry } from './types'

export interface SpellingSectionProps {
  entries: SpellingEntry[]
  showExamples: boolean
  onAddEntry: (entry: SpellingEntry) => void
  onDeleteEntry: (id: string) => void
  onDismissExamples: () => void
  isDarkMode?: boolean
}

export function SpellingSection({
  entries,
  showExamples,
  onAddEntry,
  onDeleteEntry,
  onDismissExamples,
  isDarkMode: propIsDarkMode
}: SpellingSectionProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [wordText, setWordText] = useState('')
  const [wordHint, setWordHint] = useState('')
  const [importText, setImportText] = useState('')

  const handleAddSubmit = (): void => {
    const trimmed = wordText.trim()
    if (!trimmed) return

    onAddEntry({
      id: `spelling-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      description: wordHint.trim() || undefined
    })

    setWordText('')
    setWordHint('')
    setIsAddModalOpen(false)
  }

  const handleImportSubmit = (): void => {
    const lines = importText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    lines.forEach((line) => {
      onAddEntry({
        id: `spelling-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: line
      })
    })

    setImportText('')
    setIsImportModalOpen(false)
  }

  const handleExampleClick = (example: { text: string; description?: string }): void => {
    if (entries.some((e) => e.text.toLowerCase() === example.text.toLowerCase())) return

    onAddEntry({
      id: `spelling-ex-${Date.now()}-${example.text.toLowerCase()}`,
      text: example.text,
      description: example.description
    })
  }

  const visibleExamples = DICTIONARY_EXAMPLES.filter(
    (ex) => !entries.some((e) => e.text.toLowerCase() === ex.text.toLowerCase())
  )

  const actionButtonClass = `flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
    isDarkMode
      ? 'text-gray-200 border border-white/[0.04] bg-clip-padding bg-gradient-to-b from-white/[0.08] to-white/[0.01] hover:text-white hover:border-white/[0.08]'
      : 'text-gray-700 border border-black/[0.04] bg-clip-padding bg-gradient-to-b from-white to-black/[0.02] hover:text-gray-900 hover:border-black/[0.08]'
  }`

  return (
    <Card isDarkMode={isDarkMode} className="p-5 mb-5">
      <div
        className={`flex items-start justify-between ${
          entries.length > 0 || (showExamples && visibleExamples.length > 0) ? 'mb-4' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <BookOpenIcon
            className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          />
          <div>
            <h3
              id="spelling-heading"
              className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
            >
              Spelling
            </h3>
            <p
              className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
            >
              Teach VoiceOS how to spell names, jargon, or acronyms.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={actionButtonClass}
            onClick={() => setIsImportModalOpen(true)}
            title="Bulk import keywords"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            <span>Bulk Import</span>
          </button>

          <button
            type="button"
            className={actionButtonClass}
            onClick={() => setIsAddModalOpen(true)}
            title="Add a new word"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {showExamples && visibleExamples.length > 0 && (
        <div
          className={`rounded-xl p-3.5 ${entries.length > 0 ? 'mb-4' : ''}`}
          style={{
            backgroundColor: isDarkMode
              ? 'rgba(255, 255, 255, 0.03)'
              : 'rgba(0, 0, 0, 0.025)'
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-medium ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Examples
            </span>
            <button
              type="button"
              className={`p-1 rounded-lg transition-all duration-150 ${
                isDarkMode
                  ? 'text-gray-600 hover:text-gray-400 hover:bg-white/5'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
              }`}
              onClick={onDismissExamples}
              title="Dismiss examples"
              aria-label="Dismiss examples"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {visibleExamples.map((ex) => (
              <button
                key={ex.text}
                type="button"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-150 ${
                  isDarkMode
                    ? 'bg-white/[0.05] hover:bg-white/[0.09]'
                    : 'bg-white hover:bg-gray-50'
                }`}
                style={{
                  boxShadow: isDarkMode ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onClick={() => handleExampleClick(ex)}
                title={ex.description ? `Add: ${ex.description}` : 'Click to add'}
              >
                <span
                  className={`text-[12px] font-medium ${
                    isDarkMode ? 'text-white/80' : 'text-gray-700'
                  }`}
                >
                  {ex.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full group transition-all duration-150 ${
                isDarkMode
                  ? 'bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08]'
                  : 'bg-gray-50 hover:bg-gray-100/80 border border-gray-100'
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  isDarkMode ? 'text-white/90' : 'text-gray-800'
                }`}
              >
                {entry.text}
              </span>
              {entry.description && (
                <span
                  className={`text-[10px] ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  ({entry.description})
                </span>
              )}
              <button
                type="button"
                className={`rounded-full p-1 transition-all duration-150 ${
                  isDarkMode
                    ? 'text-gray-500 hover:text-white hover:bg-white/10'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'
                }`}
                onClick={() => onDeleteEntry(entry.id)}
                aria-label={`Remove ${entry.text}`}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-word-title"
          onClick={() => setIsAddModalOpen(false)}
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
              <h3 id="add-word-title" className="text-sm font-semibold">
                Add to Dictionary
              </h3>
              <button
                type="button"
                className={`p-1 rounded-lg ${
                  isDarkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="word-input"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Word or Phrase
                </label>
                <input
                  id="word-input"
                  type="text"
                  placeholder="e.g., VoiceOS, Claude, GTM"
                  value={wordText}
                  onChange={(e) => setWordText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubmit()
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 text-white placeholder-gray-500'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="word-hint"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Often spoken as (Optional)
                </label>
                <input
                  id="word-hint"
                  type="text"
                  placeholder="e.g., let me know, go to market"
                  value={wordHint}
                  onChange={(e) => setWordHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubmit()
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 text-white placeholder-gray-500'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
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
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-voiceos-blue,#126ff6)] hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                  onClick={handleAddSubmit}
                  disabled={!wordText.trim()}
                >
                  Add Word
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-keywords-title"
          onClick={() => setIsImportModalOpen(false)}
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
              <h3 id="import-keywords-title" className="text-sm font-semibold">
                Import Keywords
              </h3>
              <button
                type="button"
                className={`p-1 rounded-lg ${
                  isDarkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
                onClick={() => setIsImportModalOpen(false)}
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="import-textarea"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Paste keywords (one per line)
                </label>
                <textarea
                  id="import-textarea"
                  rows={5}
                  placeholder={'VoiceOS\nClaude\nGTM\nlmk'}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
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
                  onClick={() => setIsImportModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-voiceos-blue,#126ff6)] hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                  onClick={handleImportSubmit}
                  disabled={!importText.trim()}
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
