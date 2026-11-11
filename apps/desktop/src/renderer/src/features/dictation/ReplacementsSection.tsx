import { useState } from 'react'
import type { JSX } from 'react'
import { PlusIcon, ReplaceIcon, XIcon } from '../../components/dashboard-icons'
import { useSystemTheme } from '../../context/ThemeContext'
import { Card } from '../profile/Card'
import { REPLACEMENT_EXAMPLES } from './dummy-data'
import type { ReplacementEntry } from './types'

export interface ReplacementsSectionProps {
  entries: ReplacementEntry[]
  showExamples: boolean
  onAddEntry: (entry: ReplacementEntry) => void
  onDeleteEntry: (id: string) => void
  onDismissExamples: () => void
  isDarkMode?: boolean
}

export function ReplacementsSection({
  entries,
  showExamples,
  onAddEntry,
  onDeleteEntry,
  onDismissExamples,
  isDarkMode: propIsDarkMode
}: ReplacementsSectionProps): JSX.Element {
  const { isDarkMode: contextIsDarkMode } = useSystemTheme()
  const isDarkMode = propIsDarkMode ?? contextIsDarkMode

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [phraseTitle, setPhraseTitle] = useState('')
  const [phraseContent, setPhraseContent] = useState('')

  const handleAddSubmit = (): void => {
    const title = phraseTitle.trim()
    const content = phraseContent.trim()
    if (!title || !content) return

    onAddEntry({
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      content
    })

    setPhraseTitle('')
    setPhraseContent('')
    setIsAddModalOpen(false)
  }

  const handleExampleClick = (example: { title: string; content: string }): void => {
    if (entries.some((e) => e.title.toLowerCase() === example.title.toLowerCase())) return

    onAddEntry({
      id: `rep-ex-${Date.now()}-${example.title.replace(/\s+/g, '-').toLowerCase()}`,
      title: example.title,
      content: example.content
    })
  }

  const visibleExamples = REPLACEMENT_EXAMPLES.filter(
    (ex) => !entries.some((e) => e.title.toLowerCase() === ex.title.toLowerCase())
  )

  const actionButtonClass = `flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
    isDarkMode
      ? 'text-gray-200 border border-white/[0.04] bg-clip-padding bg-gradient-to-b from-white/[0.08] to-white/[0.01] hover:text-white hover:border-white/[0.08]'
      : 'text-gray-700 border border-black/[0.04] bg-clip-padding bg-gradient-to-b from-white to-black/[0.02] hover:text-gray-900 hover:border-black/[0.08]'
  }`

  return (
    <Card isDarkMode={isDarkMode} className="p-5 mt-5">
      <div
        className={`flex items-start justify-between ${
          entries.length > 0 || (showExamples && visibleExamples.length > 0) ? 'mb-4' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <ReplaceIcon
            className={`w-5 h-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          />
          <div>
            <h3
              id="replacements-heading"
              className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
            >
              Personal Autofill
            </h3>
            <p
              className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
            >
              Replace shorthand with full text, e.g. emails, links, or templates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={actionButtonClass}
            onClick={() => setIsAddModalOpen(true)}
            title="Add replacement"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {showExamples && visibleExamples.length > 0 && (
        <div
          className={`rounded-xl p-3.5 ${entries.length > 0 ? 'mb-4' : ''} ${
            isDarkMode ? 'bg-white/[0.03]' : 'bg-black/[0.025]'
          }`}
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
                key={ex.title}
                type="button"
                className={`inline-flex max-w-full items-center gap-1.5 pl-3 pr-3 py-1.5 rounded-full transition-all duration-150 ${
                  isDarkMode
                    ? 'bg-white/[0.05] hover:bg-white/[0.09]'
                    : 'bg-white hover:bg-gray-50'
                }`}
                onClick={() => handleExampleClick(ex)}
                title={`Click to add replacement: "${ex.title}" → "${ex.content}"`}
              >
                <span
                  className={`max-w-[120px] truncate text-[10px] line-through ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}
                  title={ex.title}
                >
                  {ex.title}
                </span>
                <span
                  className={`text-[10px] ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}
                >
                  →
                </span>
                <span
                  className={`max-w-[180px] truncate text-[12px] font-medium ${
                    isDarkMode ? 'text-white/80' : 'text-gray-700'
                  }`}
                  title={ex.content}
                >
                  {ex.content}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((item) => (
            <div
              key={item.id}
              className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full group transition-all duration-150 ${
                isDarkMode
                  ? 'bg-white/[0.06] border border-white/[0.08]'
                  : 'bg-gray-50 border border-gray-100'
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  isDarkMode ? 'text-white/80' : 'text-gray-700'
                }`}
              >
                {item.title}
              </span>
              <span
                className={`text-[10px] ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                →
              </span>
              <span
                className={`text-[12px] font-medium ${
                  isDarkMode ? 'text-white/90' : 'text-gray-900'
                }`}
              >
                {item.content}
              </span>
              <button
                type="button"
                className={`rounded-full p-1 transition-all duration-150 ${
                  isDarkMode
                    ? 'text-gray-500 hover:text-white hover:bg-white/10'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'
                }`}
                onClick={() => onDeleteEntry(item.id)}
                aria-label={`Remove replacement for ${item.title}`}
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
          aria-labelledby="add-replacement-title"
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
              <h3 id="add-replacement-title" className="text-sm font-semibold">
                Add Replacement
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
                  htmlFor="phrase-title"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  When I say (shorthand)
                </label>
                <input
                  id="phrase-title"
                  type="text"
                  placeholder="e.g. my link, patent rewrite"
                  value={phraseTitle}
                  onChange={(e) => setPhraseTitle(e.target.value)}
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
                  htmlFor="phrase-content"
                  className={`block text-xs font-medium mb-1 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  Replace with
                </label>
                <textarea
                  id="phrase-content"
                  rows={3}
                  placeholder="e.g. https://cal.com/... or full paragraph"
                  value={phraseContent}
                  onChange={(e) => setPhraseContent(e.target.value)}
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
                  disabled={!phraseTitle.trim() || !phraseContent.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
