import { useState, type JSX, type ChangeEvent } from 'react'
import type { NotchNotionCard } from '../../../shared/types'
import notionIcon from '../assets/notion.webp'

export interface NotionConfirmationCardProps {
  card: NotchNotionCard
  busy?: boolean
  onConfirm?: (data: { title: string; content?: string }) => void
  onDiscard?: () => void
}

export const NOTION_DARK = {
  bg: '#191919',
  bgSecondary: '#202020',
  bgHover: '#2C2C2C',
  headerBg: '#202020',
  text: '#EBEBEB',
  textBright: '#FFFFFF',
  textMuted: '#9B9A97',
  textDim: '#5A5A5A',
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.04)',
  blue: '#0075DE',
  blueHover: '#0068C6'
} as const

const notionFont =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif'

function CloseCrossIcon({ size = 10 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1l8 8M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CardCloseButton({ onClick }: { onClick?: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Cancel"
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        width: 24,
        height: 24,
        padding: 0,
        borderRadius: '50%',
        border: 'none',
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'rgba(120, 120, 128, 0.5)' : 'rgba(120, 120, 128, 0.32)',
        color: 'rgba(255,255,255,0.9)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'background 0.15s ease'
      }}
    >
      <CloseCrossIcon size={10} />
    </button>
  )
}

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

function ChevronRightIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M6 3l5 5-5 5"
        stroke={NOTION_DARK.textDim}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function NotionConfirmationCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: NotionConfirmationCardProps): JSX.Element {
  const [title, setTitle] = useState<string>(() => card.title || '')
  const [content, setContent] = useState<string>(() => card.content || '')
  const [confirmHovered, setConfirmHovered] = useState(false)

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setTitle(e.target.value)
  }

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setContent(e.target.value)
  }

  const handleConfirm = (): void => {
    if (busy) return
    onConfirm?.({
      title: title.trim(),
      ...(content.trim() ? { content: content.trim() } : {})
    })
  }

  const actionLabel = card.isDatabase ? 'New Database Entry' : 'New Page'
  const hasContent = content.trim().length > 0

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 26,
        overflow: 'hidden',
        background: NOTION_DARK.bg,
        border: `1px solid ${NOTION_DARK.border}`,
        color: NOTION_DARK.text,
        fontFamily: notionFont,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <CardCloseButton onClick={onDiscard} />

      {/* Header */}
      <div
        style={{
          background: NOTION_DARK.headerBg,
          borderBottom: `1px solid ${NOTION_DARK.border}`,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <img
          src={notionIcon}
          alt="Notion"
          width={18}
          height={18}
          style={{ borderRadius: 3, display: 'block' }}
        />
        <span
          style={{
            color: NOTION_DARK.textBright,
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.01em'
          }}
        >
          {actionLabel}
        </span>
        {card.parentName && (
          <>
            <ChevronRightIcon />
            <span
              style={{
                color: NOTION_DARK.textDim,
                fontSize: '12px',
                fontWeight: 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}
            >
              {card.parentName}
            </span>
          </>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Notion title"
          placeholder="Untitled"
          spellCheck={false}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'transparent',
            border: 'none',
            color: NOTION_DARK.textBright,
            fontSize: '26px',
            fontWeight: 700,
            fontFamily: notionFont,
            padding: '0',
            marginBottom: '4px',
            outline: 'none',
            lineHeight: 1.2,
            letterSpacing: '-0.02em'
          }}
        />

        {!hasContent ? (
          <div
            style={{
              color: NOTION_DARK.textDim,
              fontSize: '13px',
              fontFamily: notionFont,
              padding: '8px 0',
              fontStyle: 'italic',
              opacity: 0.7
            }}
          >
            Content will be added in the next step.
          </div>
        ) : (
          <textarea
            value={content}
            onChange={handleContentChange}
            onMouseDown={(e) => e.stopPropagation()}
            spellCheck={false}
            rows={4}
            aria-label="Notion content"
            placeholder="Write content..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: NOTION_DARK.bgSecondary,
              border: `1px solid ${NOTION_DARK.border}`,
              borderRadius: '4px',
              color: NOTION_DARK.text,
              fontSize: '14px',
              fontFamily: notionFont,
              padding: '10px 12px',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
              marginTop: '6px'
            }}
          />
        )}
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
          onClick={handleConfirm}
          disabled={busy}
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
              confirmHovered && !busy
                ? NOTION_DARK.blueHover
                : NOTION_DARK.blue,
            color: '#FFFFFF',
            border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            fontFamily: notionFont,
            letterSpacing: '0.01em',
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow:
              confirmHovered && !busy
                ? '0 2px 8px rgba(0,117,222,0.25)'
                : 'none',
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy && <SpinnerIcon size={12} />}
          <span>Create</span>
        </button>
      </div>
    </div>
  )
}
