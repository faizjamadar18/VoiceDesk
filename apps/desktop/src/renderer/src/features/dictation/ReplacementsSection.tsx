import { useState } from 'react'
import type { JSX } from 'react'
import { PlusIcon, ReplaceIcon, XIcon } from '../../components/dashboard-icons'
import { REPLACEMENT_EXAMPLES } from './dummy-data'
import type { ReplacementEntry } from './types'

export interface ReplacementsSectionProps {
  entries: ReplacementEntry[]
  showExamples: boolean
  onAddEntry: (entry: ReplacementEntry) => void
  onDeleteEntry: (id: string) => void
  onDismissExamples: () => void
}

export function ReplacementsSection({
  entries,
  showExamples,
  onAddEntry,
  onDeleteEntry,
  onDismissExamples
}: ReplacementsSectionProps): JSX.Element {
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

  return (
    <section className="dictation-card" aria-labelledby="replacements-heading">
      <div className="dictation-card-header">
        <div className="dictation-section-info">
          <ReplaceIcon className="dictation-section-icon" />
          <div>
            <h2 id="replacements-heading" className="dictation-section-title">
              Replacements
            </h2>
            <p className="dictation-section-desc">
              Say a phrase and VoiceOS replaces it with the text you want
            </p>
          </div>
        </div>

        <div className="dictation-card-actions">
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

          <div className="dictation-replacement-pills-row">
            {visibleExamples.map((ex) => (
              <button
                key={ex.title}
                type="button"
                className="dictation-replacement-example-pill"
                onClick={() => handleExampleClick(ex)}
                title={`Click to add replacement: "${ex.title}" → "${ex.content}"`}
              >
                <span className="dictation-replacement-key">{ex.title}</span>
                <span className="dictation-replacement-arrow">→</span>
                <span className="dictation-replacement-val">{ex.content}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="dictation-replacement-pills-row">
          {entries.map((item) => (
            <div key={item.id} className="dictation-replacement-pill group">
              <span className="dictation-replacement-key">{item.title}</span>
              <span className="dictation-replacement-arrow">→</span>
              <span className="dictation-replacement-val">{item.content}</span>
              <button
                type="button"
                className="dictation-entry-remove"
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
          className="dictation-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-replacement-title"
        >
          <div className="dictation-modal-box">
            <div className="dictation-modal-header">
              <h3 id="add-replacement-title" className="dictation-modal-title">
                Add Replacement
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
              <label htmlFor="rep-phrase-input" className="dictation-input-label">
                When you say
              </label>
              <input
                id="rep-phrase-input"
                type="text"
                className="dictation-input"
                placeholder="e.g., my calendar link, zoom link"
                value={phraseTitle}
                onChange={(e) => setPhraseTitle(e.target.value)}
                autoFocus
              />

              <label
                htmlFor="rep-content-input"
                className="dictation-input-label dictation-input-label--spaced"
              >
                VoiceOS replaces with
              </label>
              <textarea
                id="rep-content-input"
                rows={3}
                className="dictation-textarea"
                placeholder="e.g., https://cal.com/your-name/15min"
                value={phraseContent}
                onChange={(e) => setPhraseContent(e.target.value)}
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
                disabled={!phraseTitle.trim() || !phraseContent.trim()}
              >
                Add Replacement
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
