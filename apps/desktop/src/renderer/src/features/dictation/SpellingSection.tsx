import { useState } from 'react'
import type { JSX } from 'react'
import {
  BookOpenIcon,
  PlusIcon,
  SparklesIcon,
  XIcon
} from '../../components/dashboard-icons'
import { DICTIONARY_EXAMPLES } from './dummy-data'
import type { SpellingEntry } from './types'

export interface SpellingSectionProps {
  entries: SpellingEntry[]
  showExamples: boolean
  onAddEntry: (entry: SpellingEntry) => void
  onDeleteEntry: (id: string) => void
  onDismissExamples: () => void
}

export function SpellingSection({
  entries,
  showExamples,
  onAddEntry,
  onDeleteEntry,
  onDismissExamples
}: SpellingSectionProps): JSX.Element {
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

  return (
    <section className="dictation-card" aria-labelledby="spelling-heading">
      <div className="dictation-card-header">
        <div className="dictation-section-info">
          <BookOpenIcon className="dictation-section-icon" />
          <div>
            <h2 id="spelling-heading" className="dictation-section-title">
              Spelling
            </h2>
            <p className="dictation-section-desc">
              Add correct spellings to help the AI write accurately
            </p>
          </div>
        </div>

        <div className="dictation-card-actions">
          <button
            type="button"
            className="dictation-action-pill"
            onClick={() => setIsImportModalOpen(true)}
          >
            <SparklesIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Import</span>
          </button>

          <button
            type="button"
            className="dictation-action-pill"
            onClick={() => setIsAddModalOpen(true)}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {showExamples && visibleExamples.length > 0 && (
        <div className="dictation-examples-box">
          <div className="dictation-examples-header">
            <span className="dictation-examples-label">Examples:</span>
            <button
              type="button"
              className="dictation-examples-dismiss"
              onClick={onDismissExamples}
              aria-label="Dismiss examples"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>

          <div className="dictation-pill-row">
            {visibleExamples.map((ex) => (
              <button
                key={ex.text}
                type="button"
                className="dictation-example-pill"
                onClick={() => handleExampleClick(ex)}
                title={ex.description ? `Add: ${ex.description}` : 'Click to add'}
              >
                <span>{ex.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="dictation-entries-row">
          {entries.map((entry) => (
            <div key={entry.id} className="dictation-entry-pill group">
              <span className="dictation-entry-text">{entry.text}</span>
              {entry.description && (
                <span className="dictation-entry-desc">({entry.description})</span>
              )}
              <button
                type="button"
                className="dictation-entry-remove"
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
          className="dictation-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-word-title"
        >
          <div className="dictation-modal-box">
            <div className="dictation-modal-header">
              <h3 id="add-word-title" className="dictation-modal-title">
                Add to Dictionary
              </h3>
              <button
                type="button"
                className="dictation-modal-close"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="dictation-modal-body">
              <label htmlFor="word-input" className="dictation-input-label">
                Word or Phrase
              </label>
              <input
                id="word-input"
                type="text"
                className="dictation-input"
                placeholder="e.g., VoiceOS, Claude, GTM"
                value={wordText}
                onChange={(e) => setWordText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubmit()
                }}
                autoFocus
              />

              <label
                htmlFor="word-hint"
                className="dictation-input-label dictation-input-label--spaced"
              >
                Often spoken as (Optional)
              </label>
              <input
                id="word-hint"
                type="text"
                className="dictation-input"
                placeholder="e.g., let me know, go to market"
                value={wordHint}
                onChange={(e) => setWordHint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubmit()
                }}
              />
            </div>

            <div className="dictation-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dictation-primary-button"
                onClick={handleAddSubmit}
                disabled={!wordText.trim()}
              >
                Add Word
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div
          className="dictation-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-keywords-title"
        >
          <div className="dictation-modal-box">
            <div className="dictation-modal-header">
              <h3 id="import-keywords-title" className="dictation-modal-title">
                Import Keywords
              </h3>
              <button
                type="button"
                className="dictation-modal-close"
                onClick={() => setIsImportModalOpen(false)}
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="dictation-modal-body">
              <label htmlFor="import-textarea" className="dictation-input-label">
                Paste keywords (one per line)
              </label>
              <textarea
                id="import-textarea"
                rows={5}
                className="dictation-textarea"
                placeholder={`VoiceOS\nClaude\nGTM\nlmk`}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                autoFocus
              />
            </div>

            <div className="dictation-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dictation-primary-button"
                onClick={handleImportSubmit}
                disabled={!importText.trim()}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
