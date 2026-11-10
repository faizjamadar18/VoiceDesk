import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, FocusEvent } from 'react'
import { Loader2Icon, PencilIcon, UndoIcon } from './icons'

export const PREFERENCES_FILE_MAX_CHARS = 4000

export const PREFERENCES_STRINGS = {
  agentPreferencesTitle: 'Memory',
  agentPreferencesDesc:
    'What VoiceOS remembers about you. The agent reads this on every turn and updates it as you talk — click to edit it yourself.',
  agentPreferencesEmpty:
    'Nothing yet. VoiceOS fills this in as you use Agent Mode — or click to write it yourself.',
  agentPreferencesPlaceholder:
    '# About me\n\n- Prefers short emails\n- Uses Todoist for reminders',
  agentPreferencesGoalLabel: 'Goal',
  agentPreferencesGoalPending:
    "Nothing yet — VoiceOS fills this in once it can tell what you're working toward.",
  agentPreferencesPreferencesLabel: 'Preferences',
  agentPreferencesPreferencesPending:
    'Nothing yet — say things like “always use Todoist” and they\'ll be saved here.',
  agentPreferencesEdit: 'Edit',
  agentPreferencesCancel: 'Cancel',
  agentPreferencesSave: 'Save',
  agentPreferencesUndo: 'Undo last change',
  agentPreferencesSaveError: "Couldn't save. Try again."
}

export interface PreferencesFileEditorProps {
  preferencesMd?: string | null
  hasPrevious?: boolean
  isSaving?: boolean
  onSave?: (text: string) => Promise<void> | void
  onUndo?: () => Promise<void> | void
}

function formatInlineText(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={`code-${match.index}`} className="agent-md-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`bold-${match.index}`} className="agent-md-strong">
          {token.slice(2, -2)}
        </strong>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function renderMarkdownContent(text: string): JSX.Element[] {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let listItems: string[] = []

  const flushList = (keyPrefix: number): void => {
    if (listItems.length === 0) return
    elements.push(
      <ul key={`ul-${keyPrefix}`} className="agent-md-ul">
        {listItems.map((item, idx) => (
          <li key={`li-${idx}`} className="agent-md-li">
            {formatInlineText(item)}
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList(index)
      return
    }

    if (trimmed.startsWith('# ')) {
      flushList(index)
      elements.push(
        <h1 key={`h1-${index}`} className="agent-md-h1">
          {formatInlineText(trimmed.slice(2))}
        </h1>
      )
      return
    }

    if (trimmed.startsWith('## ')) {
      flushList(index)
      elements.push(
        <h2 key={`h2-${index}`} className="agent-md-h2">
          {formatInlineText(trimmed.slice(3))}
        </h2>
      )
      return
    }

    if (trimmed.startsWith('### ')) {
      flushList(index)
      elements.push(
        <h3 key={`h3-${index}`} className="agent-md-h3">
          {formatInlineText(trimmed.slice(4))}
        </h3>
      )
      return
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2))
      return
    }

    flushList(index)
    elements.push(
      <p key={`p-${index}`} className="agent-md-p">
        {formatInlineText(trimmed)}
      </p>
    )
  })

  flushList(lines.length)
  return elements
}

export function PreferencesFileEditor({
  preferencesMd = '',
  hasPrevious = false,
  isSaving = false,
  onSave,
  onUndo
}: PreferencesFileEditorProps): JSX.Element {
  const currentText = preferencesMd ?? ''
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(currentText)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isEditing) {
      setDraft(currentText)
    }
  }, [currentText, isEditing])

  const startEditing = useCallback((): void => {
    setDraft(currentText)
    setError(null)
    setIsEditing(true)
  }, [currentText])

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus()
    }
  }, [isEditing])

  const handleSave = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      await onSave?.(draft)
      setIsEditing(false)
    } catch {
      setError(PREFERENCES_STRINGS.agentPreferencesSaveError)
    }
  }, [draft, onSave])

  const handleCancel = useCallback((): void => {
    setDraft(currentText)
    setError(null)
    setIsEditing(false)
  }, [currentText])

  const handleUndo = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      await onUndo?.()
      setIsEditing(false)
    } catch {
      setError(PREFERENCES_STRINGS.agentPreferencesSaveError)
    }
  }, [onUndo])

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>): void => {
      if (isSaving) return
      const next = event.relatedTarget as HTMLElement | null
      if (next?.closest?.('[data-preferences-action]')) return
      if (draft === currentText) {
        setIsEditing(false)
        return
      }
      void handleSave()
    },
    [isSaving, draft, currentText, handleSave]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCancel()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void handleSave()
      }
    },
    [handleCancel, handleSave]
  )

  const overBudget = draft.length > PREFERENCES_FILE_MAX_CHARS
  const isEmpty = !currentText.trim()

  const headings = currentText
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.*)$/)?.[1]?.trim().toLowerCase())
    .filter((heading): heading is string => Boolean(heading))

  const hasGoal = headings.some((h) => /goal|working toward|objective/.test(h))
  const hasPreferences = headings.some((h) => /prefer/.test(h))

  const pending: { label: string; hint: string }[] = []
  if (!hasGoal) {
    pending.push({
      label: PREFERENCES_STRINGS.agentPreferencesGoalLabel,
      hint: PREFERENCES_STRINGS.agentPreferencesGoalPending
    })
  }
  if (!hasPreferences) {
    pending.push({
      label: PREFERENCES_STRINGS.agentPreferencesPreferencesLabel,
      hint: PREFERENCES_STRINGS.agentPreferencesPreferencesPending
    })
  }

  return (
    <div className="agent-preferences-container">
      {isEditing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            spellCheck={false}
            rows={16}
            placeholder={PREFERENCES_STRINGS.agentPreferencesPlaceholder}
            className="agent-preferences-textarea"
          />

          <div className="agent-preferences-footer">
            <span
              className={`agent-preferences-counter ${
                overBudget ? 'agent-preferences-counter--over' : ''
              }`}
            >
              {draft.length} / {PREFERENCES_FILE_MAX_CHARS}
            </span>

            <div className="agent-preferences-edit-actions">
              <button
                type="button"
                data-preferences-action="cancel"
                onClick={handleCancel}
                disabled={isSaving}
                className="agent-preferences-cancel-btn"
              >
                {PREFERENCES_STRINGS.agentPreferencesCancel}
              </button>

              <button
                type="button"
                data-preferences-action="save"
                onClick={handleSave}
                disabled={isSaving}
                className="agent-preferences-save-btn"
              >
                {isSaving && (
                  <Loader2Icon
                    width={12}
                    height={12}
                    className="agent-preferences-spinner"
                  />
                )}
                {PREFERENCES_STRINGS.agentPreferencesSave}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={startEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                startEditing()
              }
            }}
            title={PREFERENCES_STRINGS.agentPreferencesEdit}
            className="agent-preferences-preview"
          >
            {isEmpty ? (
              <p className="agent-preferences-empty">
                {PREFERENCES_STRINGS.agentPreferencesEmpty}
              </p>
            ) : (
              <div className="agent-preferences-markdown">
                {renderMarkdownContent(currentText)}
              </div>
            )}

            {pending.map(({ label, hint }) => (
              <div key={label} className="agent-preferences-section">
                <div className="agent-preferences-section-label">
                  {label}
                </div>
                <p className="agent-preferences-section-hint">
                  {hint}
                </p>
              </div>
            ))}
          </div>

          <div className="agent-preferences-footer">
            <button
              type="button"
              onClick={handleUndo}
              disabled={isSaving || !hasPrevious}
              title={PREFERENCES_STRINGS.agentPreferencesUndo}
              className="agent-preferences-undo-btn"
            >
              <UndoIcon width={12} height={12} />
              {PREFERENCES_STRINGS.agentPreferencesUndo}
            </button>

            <button
              type="button"
              onClick={startEditing}
              className="agent-preferences-edit-btn"
            >
              <PencilIcon width={12} height={12} />
              {PREFERENCES_STRINGS.agentPreferencesEdit}
            </button>
          </div>
        </>
      )}

      {error && <p className="agent-preferences-error">{error}</p>}
    </div>
  )
}

