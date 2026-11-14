import { useEffect, useRef, useState, type JSX } from 'react'
import type { NotchEmailReplyCard } from '../../../shared/types'

export interface EmailReplyCardProps {
  card: NotchEmailReplyCard
  onCopy?: (text: string) => void
}

/** The card was already copied when it appeared; editing clears that state. */
const MIN_HEIGHT = 120
const MAX_HEIGHT = 260

function CopyIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5.3"
        y="5.3"
        width="9.2"
        height="9.2"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M2.7 10.7C1.9 10.7 1.3 10.1 1.3 9.3V2.7C1.3 1.9 1.9 1.3 2.7 1.3H9.3C10.1 1.3 10.7 1.9 10.7 2.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 8.5l3.5 3.5 7-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Editable reply draft, matching VoiceOS: the text is copied the moment the
 * card appears, and the button copies again after edits. Nothing is sent.
 */
export function EmailReplyCard({
  card,
  onCopy
}: EmailReplyCardProps): JSX.Element {
  const [text, setText] = useState(card.body)
  const [copied, setCopied] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const autoCopiedRef = useRef<string | null>(null)

  useEffect(() => {
    const area = areaRef.current
    if (area === null) return
    const content = Number.isFinite(area.scrollHeight) ? area.scrollHeight : 0
    area.style.height = 'auto'
    area.style.height = `${Math.min(Math.max(content, MIN_HEIGHT), MAX_HEIGHT)}px`
  }, [text])

  useEffect(() => {
    if (autoCopiedRef.current === card.body) return
    autoCopiedRef.current = card.body
    if (card.body.trim() === '') return
    onCopy?.(card.body)
    setCopied(true)
  }, [card.body, onCopy])

  const copy = (): void => {
    if (text.trim() === '') return
    onCopy?.(text)
    setCopied(true)
  }

  return (
    <div className="kestrel-reply-draft">
      <div className="kestrel-reply-draft-title">
        {card.title || 'Reply drafted'}
      </div>
      <div className="kestrel-reply-draft-rule" aria-hidden="true" />
      <textarea
        ref={areaRef}
        className="kestrel-reply-draft-input"
        aria-label="Edit the drafted reply"
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value)
          setCopied(false)
        }}
      />
      <div className="kestrel-reply-draft-foot">
        <button
          type="button"
          className={`kestrel-reply-draft-copy ${copied ? 'is-copied' : ''}`}
          aria-label={copied ? 'Reply copied' : 'Copy the reply'}
          disabled={text.trim() === ''}
          onClick={copy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy to Clipboard'}</span>
        </button>
      </div>
    </div>
  )
}
