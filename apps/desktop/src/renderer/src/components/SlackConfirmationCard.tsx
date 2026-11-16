import { useState, type JSX, type ChangeEvent } from 'react'
import type { NotchSlackCard } from '../../../shared/types'
import slackIcon from '../features/apps/assets/slack-Bj1CmN7u.webp'

export interface SlackConfirmationCardProps {
  card: NotchSlackCard
  busy?: boolean
  onConfirm?: (data: { message: string }) => void
  onDiscard?: () => void
}

export const SLACK_DARK = {
  bg: '#191919',
  bgSecondary: '#202020',
  bgHover: '#2C2C2C',
  headerBg: '#202020',
  text: '#EBEBEB',
  textBright: '#FFFFFF',
  textMuted: '#9B9A97',
  textDim: '#5A5A5A',
  border: 'rgba(255,255,255,0.06)',
  blue: '#0075DE',
  blueHover: '#0068C6'
} as const

const slackFont =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif'

function SpinnerIcon({ size = 12 }: { size?: number }): JSX.Element {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        style={{ opacity: 0.25 }}
      />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        style={{ opacity: 0.75 }}
      />
    </svg>
  )
}

/**
 * A plain confirmation for a Slack message, scheduled message or reminder.
 * The wording stays editable, so approving sends what the user sees.
 */
export function SlackConfirmationCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: SlackConfirmationCardProps): JSX.Element {
  const [message, setMessage] = useState<string>(() => card.message || '')
  const [confirmHovered, setConfirmHovered] = useState(false)
  const [cancelHovered, setCancelHovered] = useState(false)

  const handleMessageChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setMessage(e.target.value)
  }

  const handleConfirm = (): void => {
    if (busy) return
    const trimmed = message.trim()
    if (trimmed === '') return
    onConfirm?.({ message: trimmed })
  }

  const handleDiscard = (): void => {
    if (busy) return
    onDiscard?.()
  }

  const actionLabel =
    card.mode === 'reminder'
      ? 'Set Reminder'
      : card.mode === 'schedule'
        ? 'Schedule Message'
        : 'Send Message'
  const when = card.mode === 'send' ? null : card.when
  const canConfirm = !busy && message.trim().length > 0

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 26,
        overflow: 'hidden',
        background: SLACK_DARK.bg,
        border: `1px solid ${SLACK_DARK.border}`,
        color: SLACK_DARK.text,
        fontFamily: slackFont,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div
        style={{
          background: SLACK_DARK.headerBg,
          borderBottom: `1px solid ${SLACK_DARK.border}`,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <img
          src={slackIcon}
          alt="Slack"
          width={18}
          height={18}
          style={{ borderRadius: 3, display: 'block' }}
        />
        <span
          style={{
            color: SLACK_DARK.textBright,
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.01em'
          }}
        >
          {actionLabel}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              color: SLACK_DARK.textDim,
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}
          >
            To
          </span>
          <span
            style={{
              color: SLACK_DARK.textBright,
              fontSize: '14px',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {card.target}
          </span>
        </div>

        {when !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                color: SLACK_DARK.textDim,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}
            >
              When
            </span>
            <span style={{ color: SLACK_DARK.text, fontSize: '13px' }}>
              {when}
            </span>
          </div>
        )}

        <textarea
          value={message}
          onChange={handleMessageChange}
          onMouseDown={(e) => e.stopPropagation()}
          spellCheck={false}
          rows={4}
          aria-label="Slack message"
          placeholder="Message"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: SLACK_DARK.bgSecondary,
            border: `1px solid ${SLACK_DARK.border}`,
            borderRadius: '4px',
            color: SLACK_DARK.text,
            fontSize: '14px',
            fontFamily: slackFont,
            padding: '10px 12px',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none'
          }}
        />
      </div>

      {/* Action footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px 14px'
        }}
      >
        <button
          type="button"
          onClick={handleDiscard}
          disabled={busy}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setCancelHovered(true)}
          onMouseLeave={() => setCancelHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30px',
            padding: '0 14px',
            borderRadius: '6px',
            background: cancelHovered && !busy ? SLACK_DARK.bgHover : SLACK_DARK.bgSecondary,
            color: SLACK_DARK.text,
            border: `1px solid ${SLACK_DARK.border}`,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            fontFamily: slackFont,
            letterSpacing: '0.01em',
            transition: 'background 0.15s ease',
            opacity: busy ? 0.6 : 1
          }}
        >
          <span>Cancel</span>
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setConfirmHovered(true)}
          onMouseLeave={() => setConfirmHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '30px',
            padding: '0 14px',
            borderRadius: '6px',
            background:
              confirmHovered && canConfirm
                ? SLACK_DARK.blueHover
                : SLACK_DARK.blue,
            color: '#FFFFFF',
            border: 'none',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: 500,
            fontFamily: slackFont,
            letterSpacing: '0.01em',
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow:
              confirmHovered && canConfirm
                ? '0 2px 8px rgba(0,117,222,0.25)'
                : 'none',
            opacity: canConfirm ? 1 : 0.6
          }}
        >
          {busy && <SpinnerIcon size={12} />}
          <span>Approve</span>
        </button>
      </div>
    </div>
  )
}
