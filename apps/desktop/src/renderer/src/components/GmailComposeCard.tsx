import { useState, useRef, useEffect, type JSX } from 'react'
import type { NotchEmailComposeCard } from '../../../shared/types'
import gmailIcon from '../assets/gmail.webp'

export interface GmailComposeCardProps {
  card: NotchEmailComposeCard
  busy?: boolean
  onSend: (updated: NotchEmailComposeCard) => void
  onDiscard: () => void
  onCopy?: (text: string) => void
}

function CloseCrossIcon({ size = 11 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 3L3 9M3 3l6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ChipRemoveIcon({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

function CopyIcon({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ReplyArrowIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 4l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 10h12a5 5 0 015 5v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GmailComposeCard({
  card,
  busy = false,
  onSend,
  onDiscard,
  onCopy
}: GmailComposeCardProps): JSX.Element {
  const [showCc, setShowCc] = useState(card.cc.length > 0)
  const [showBcc, setShowBcc] = useState(card.bcc.length > 0)
  const [toRecipients, setToRecipients] = useState<string[]>(card.to)
  const [ccRecipients, setCcRecipients] = useState<string[]>(card.cc)
  const [bccRecipients, setBccRecipients] = useState<string[]>(card.bcc)
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleCopy = (field: 'subject' | 'body', text: string): void => {
    onCopy?.(text)
    setCopiedField(field)
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedField(null)
    }, 1500)
  }

  const removeToRecipient = (indexToRemove: number): void => {
    setToRecipients((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const removeCcRecipient = (indexToRemove: number): void => {
    setCcRecipients((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const removeBccRecipient = (indexToRemove: number): void => {
    setBccRecipients((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const isReply = card.mode === 'reply'
  const title = card.title || (isReply ? 'Reply' : 'New Message')
  const sendLabel = card.mode === 'draft' ? 'Save draft' : 'Send'

  return (
    <div className="kestrel-email-compose">
      {/* Header bar */}
      <div className="kestrel-email-compose-head">
        <div className="kestrel-email-head-left">
          <img
            src={gmailIcon}
            alt="Gmail"
            width={16}
            height={16}
            className="kestrel-email-icon"
          />
          {isReply && (
            <span className="kestrel-email-reply-icon">
              <ReplyArrowIcon size={14} />
            </span>
          )}
          <span className="kestrel-email-compose-title">{title}</span>
        </div>
        <button
          type="button"
          className="kestrel-email-compose-close"
          aria-label="Cancel"
          disabled={busy}
          onClick={onDiscard}
        >
          <CloseCrossIcon size={11} />
        </button>
      </div>

      {/* Reply thread count if applicable */}
      {isReply && card.threadCount !== null && (
        <div className="kestrel-email-thread">
          View thread ({card.threadCount})
        </div>
      )}

      {/* "To" recipient row */}
      <div className="kestrel-email-field">
        <span className="kestrel-email-field-label">To</span>
        <div className="kestrel-email-chips">
          {toRecipients.map((address, index) => (
            <span key={index} className="kestrel-email-chip">
              <span className="kestrel-email-chip-text">{address}</span>
              <button
                type="button"
                className="kestrel-email-chip-remove"
                aria-label={`Remove ${address}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeToRecipient(index)
                }}
              >
                <ChipRemoveIcon size={12} />
              </button>
            </span>
          ))}
        </div>

        {/* Right-aligned Cc / Bcc toggle buttons */}
        <div className="kestrel-email-toggles">
          {!showCc && (
            <button
              type="button"
              className="kestrel-email-toggle-btn"
              onClick={() => setShowCc(true)}
            >
              Cc
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              className="kestrel-email-toggle-btn"
              onClick={() => setShowBcc(true)}
            >
              Bcc
            </button>
          )}
        </div>
      </div>

      {/* "Cc" row (collapsible or shown if recipients present) */}
      {showCc && (
        <div className="kestrel-email-field">
          <span className="kestrel-email-field-label">Cc</span>
          <div className="kestrel-email-chips">
            {ccRecipients.map((address, index) => (
              <span key={index} className="kestrel-email-chip">
                <span className="kestrel-email-chip-text">{address}</span>
                <button
                  type="button"
                  className="kestrel-email-chip-remove"
                  aria-label={`Remove ${address}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeCcRecipient(index)
                  }}
                >
                  <ChipRemoveIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* "Bcc" row (collapsible or shown if recipients present) */}
      {showBcc && (
        <div className="kestrel-email-field">
          <span className="kestrel-email-field-label">Bcc</span>
          <div className="kestrel-email-chips">
            {bccRecipients.map((address, index) => (
              <span key={index} className="kestrel-email-chip">
                <span className="kestrel-email-chip-text">{address}</span>
                <button
                  type="button"
                  className="kestrel-email-chip-remove"
                  aria-label={`Remove ${address}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeBccRecipient(index)
                  }}
                >
                  <ChipRemoveIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Subject row (divider above subject is built into border-bottom of recipient field) */}
      {!isReply && (
        <div className="kestrel-email-subject-row">
          <span className="kestrel-email-subject-text">{card.subject}</span>
          {card.subject.trim().length > 0 && (
            <button
              type="button"
              className={`kestrel-email-copy-btn ${copiedField === 'subject' ? 'is-copied' : ''}`}
              aria-label="Copy subject"
              title={copiedField === 'subject' ? 'Copied' : 'Copy subject'}
              onClick={() => handleCopy('subject', card.subject)}
            >
              {copiedField === 'subject' ? (
                <CheckIcon size={13} />
              ) : (
                <CopyIcon size={13} />
              )}
            </button>
          )}
        </div>
      )}

      {/* Body row */}
      <div className="kestrel-email-body-row">
        <div className="kestrel-email-body-text">{card.body}</div>
        {card.body.trim().length > 0 && (
          <div className="kestrel-email-body-copy">
            <button
              type="button"
              className={`kestrel-email-copy-btn ${copiedField === 'body' ? 'is-copied' : ''}`}
              aria-label="Copy body"
              title={copiedField === 'body' ? 'Copied' : 'Copy body'}
              onClick={() => handleCopy('body', card.body)}
            >
              {copiedField === 'body' ? (
                <CheckIcon size={13} />
              ) : (
                <CopyIcon size={13} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="kestrel-email-compose-foot">
        <button
          type="button"
          className="kestrel-email-discard"
          disabled={busy}
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          type="button"
          className="kestrel-email-send"
          disabled={busy || card.body.trim().length === 0}
          onClick={() =>
            onSend({
              ...card,
              to: toRecipients,
              cc: ccRecipients,
              bcc: bccRecipients
            })
          }
        >
          {sendLabel}
        </button>
      </div>
    </div>
  )
}
