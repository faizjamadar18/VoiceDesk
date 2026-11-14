import { useState, useRef, useEffect, useLayoutEffect, type JSX } from 'react'
import type { NotchDriveCard } from '../../../shared/types'
import { VoiceOsMarkdown } from '../voiceos-notch/markdown'

export interface GoogleDriveCardProps {
  card: NotchDriveCard
  busy?: boolean
  onConfirm?: (data: { name: string; content?: string }) => void
  onDiscard?: () => void
}

export const GDRIVE_DARK = {
  bg: '#1C1C1E',
  bgSecondary: '#2C2C2E',
  bgHover: '#3A3A3C',
  headerBg: '#232326',
  text: '#D1D1D6',
  textBright: '#F2F2F7',
  textMuted: '#98989D',
  textDim: '#636366',
  border: 'rgba(255,255,255,0.10)',
  borderLight: 'rgba(255,255,255,0.06)',
  borderFocus: '#4285F4',
  blue: '#4285F4',
  blueHover: '#5A9CF5',
  green: '#0F9D58',
  yellow: '#F4B400',
  red: '#DB4437',
  sheetsGreen: '#34A853',
  docsBlue: '#4285F4'
} as const

function DocsIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        fill="#4285F4"
        fillOpacity="0.9"
      />
      <path d="M14 2v6h6" fill="#A1C2FA" />
      <path
        d="M8 13h8M8 17h5"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
    </svg>
  )
}

function SheetsIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="#0F9D58"
        fillOpacity="0.9"
      />
      <path
        d="M3 9h18M3 15h18M9 3v18"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeOpacity="0.8"
      />
    </svg>
  )
}

function GoogleDriveIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M8.5 2.5h7l6.5 11.25h-7L8.5 2.5z" fill="#FFBA00" />
      <path d="M15 13.75L8.5 2.5 2 13.75h13z" fill="#0066DA" />
      <path d="M22 13.75H9l-3.25 5.75h13L22 13.75z" fill="#00AC47" />
    </svg>
  )
}

function FileIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        fill="#0F9D58"
        fillOpacity="0.9"
      />
      <path d="M14 2v6h6" fill="#81C995" />
      <path
        d="M8 13h8M8 17h5"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
    </svg>
  )
}

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

function SpinnerIcon({ size = 13 }: { size?: number }): JSX.Element {
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

function extractDocTitle(rawName: string, rawContent?: string): string {
  if (rawName && rawName.trim().length > 0) {
    return rawName.trim()
  }
  if (rawContent && rawContent.trim().length > 0) {
    const lines = rawContent.split('\n').map((line) => line.trim()).filter(Boolean)
    const firstLine = lines[0] || ''
    if (firstLine.length > 0) {
      const stripped = firstLine.replace(/^#{1,6}\s+/, '').trim()
      if (stripped.length > 0) {
        return stripped.slice(0, 120)
      }
    }
  }
  return 'Untitled document'
}

export function GoogleDriveCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: GoogleDriveCardProps): JSX.Element {
  const isDocument = card.format === 'document'
  const isSpreadsheet = card.format === 'spreadsheet'

  const [name, setName] = useState<string>(() => {
    if (isDocument) {
      return extractDocTitle(card.name, card.content)
    }
    return card.name || ''
  })

  const [content, setContent] = useState<string>(() => card.content || '')
  const [docsViewMode, setDocsViewMode] = useState<'preview' | 'markdown'>('preview')
  const [confirmHovered, setConfirmHovered] = useState(false)
  const docsTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isDocument) {
      setName(extractDocTitle(card.name, card.content))
    } else {
      setName(card.name || '')
    }
    setContent(card.content || '')
    setDocsViewMode('preview')
  }, [card.name, card.content, isDocument])

  useLayoutEffect(() => {
    if (isDocument && docsViewMode === 'markdown' && docsTextareaRef.current) {
      const textarea = docsTextareaRef.current
      textarea.style.height = '0px'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [content, docsViewMode, isDocument])

  const handleConfirm = (): void => {
    if (busy) return
    onConfirm?.({ name, content })
  }

  const actionLabel = (() => {
    const isEdit = card.mode === 'edit'
    if (isDocument) {
      return isEdit ? 'Edit Document' : 'Create Document'
    }
    if (isSpreadsheet) {
      return isEdit ? 'Edit Spreadsheet' : 'Create Spreadsheet'
    }
    return isEdit ? 'Edit File' : 'Create File'
  })()

  const headerTitle = (() => {
    const isEdit = card.mode === 'edit'
    if (isSpreadsheet) {
      return isEdit ? 'Edit Spreadsheet' : 'Create Spreadsheet'
    }
    return isEdit ? 'Edit File' : 'Create File'
  })()

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 20,
        background: GDRIVE_DARK.bg,
        border: `1px solid ${GDRIVE_DARK.border}`,
        color: GDRIVE_DARK.text,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <CardCloseButton onClick={onDiscard} />

      {/* Header Bar */}
      <div
        style={{
          background: GDRIVE_DARK.headerBg,
          borderBottom: `1px solid ${GDRIVE_DARK.border}`,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          boxSizing: 'border-box'
        }}
      >
        {isDocument && (
          <>
            <DocsIcon size={18} />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              spellCheck={false}
              aria-label="Document title"
              placeholder="Document title"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                color: GDRIVE_DARK.textBright,
                fontSize: 16,
                fontWeight: 600,
                outline: 'none',
                lineHeight: 1.4,
                padding: 0,
                paddingRight: 32,
                boxSizing: 'border-box'
              }}
            />
          </>
        )}

        {isSpreadsheet && (
          <>
            <SheetsIcon size={18} />
            <span
              style={{
                color: GDRIVE_DARK.textBright,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.01em'
              }}
            >
              {headerTitle}
            </span>
          </>
        )}

        {!isDocument && !isSpreadsheet && (
          <>
            <GoogleDriveIcon size={18} />
            <span
              style={{
                color: GDRIVE_DARK.textBright,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.01em'
              }}
            >
              {headerTitle}
            </span>
          </>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          padding: isDocument ? '12px 14px' : '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: isDocument ? 8 : 10,
          minHeight: 0
        }}
      >
        {isDocument && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docsViewMode === 'preview' ? (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#222326',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  color: GDRIVE_DARK.text,
                  minHeight: 180,
                  maxHeight: 280,
                  overflowY: 'auto',
                  padding: '14px 16px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.18)'
                }}
              >
                {content.trim().length > 0 ? (
                  <VoiceOsMarkdown text={content} />
                ) : (
                  <div style={{ color: GDRIVE_DARK.textDim, fontSize: 14 }}>Document preview</div>
                )}
              </div>
            ) : (
              <textarea
                ref={docsTextareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (docsTextareaRef.current) {
                    docsTextareaRef.current.style.height = '0px'
                    docsTextareaRef.current.style.height = `${docsTextareaRef.current.scrollHeight}px`
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                rows={8}
                aria-label="Document markdown"
                placeholder="Document content (Markdown)"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#1f2023',
                  border: `1px solid ${GDRIVE_DARK.border}`,
                  color: GDRIVE_DARK.text,
                  borderRadius: 8,
                  minHeight: 180,
                  maxHeight: 280,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 12,
                  padding: '12px 14px',
                  lineHeight: 1.5,
                  resize: 'none',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = GDRIVE_DARK.borderFocus
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = GDRIVE_DARK.border
                }}
              />
            )}
          </div>
        )}

        {isSpreadsheet && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: GDRIVE_DARK.bgSecondary,
              border: `1px solid ${GDRIVE_DARK.borderLight}`,
              borderRadius: 12,
              padding: '10px 12px',
              boxSizing: 'border-box'
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <SheetsIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                aria-label="File name"
                placeholder="File name"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid transparent',
                  color: GDRIVE_DARK.textBright,
                  fontSize: 14,
                  fontWeight: 500,
                  outline: 'none',
                  padding: '4px 0',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderBottomColor = GDRIVE_DARK.borderFocus
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderBottomColor = 'transparent'
                }}
              />
            </div>
          </div>
        )}

        {!isDocument && !isSpreadsheet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: GDRIVE_DARK.bgSecondary,
                border: `1px solid ${GDRIVE_DARK.borderLight}`,
                borderRadius: 12,
                padding: '10px 12px',
                boxSizing: 'border-box'
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <FileIcon size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  spellCheck={false}
                  aria-label="File name"
                  placeholder="File name"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid transparent',
                    color: GDRIVE_DARK.textBright,
                    fontSize: 14,
                    fontWeight: 500,
                    outline: 'none',
                    padding: '4px 0',
                    transition: 'border-color 0.15s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderBottomColor = GDRIVE_DARK.borderFocus
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderBottomColor = 'transparent'
                  }}
                />
              </div>
            </div>

            {content.trim().length > 0 && (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                rows={4}
                aria-label="File content"
                placeholder="File content"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  background: GDRIVE_DARK.bgSecondary,
                  border: `1px solid ${GDRIVE_DARK.border}`,
                  color: GDRIVE_DARK.text,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  padding: '10px 12px',
                  lineHeight: 1.5,
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = GDRIVE_DARK.borderFocus
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = GDRIVE_DARK.border
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div>
          {isDocument && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 2,
                borderRadius: 999,
                background: GDRIVE_DARK.bgSecondary,
                border: '1px solid rgba(255,255,255,0.08)',
                gap: 2,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
              }}
            >
              <button
                type="button"
                onClick={() => setDocsViewMode('preview')}
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: docsViewMode === 'preview' ? GDRIVE_DARK.bgHover : 'transparent',
                  color: docsViewMode === 'preview' ? GDRIVE_DARK.textBright : GDRIVE_DARK.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setDocsViewMode('markdown')}
                style={{
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: 'none',
                  background: docsViewMode === 'markdown' ? GDRIVE_DARK.bgHover : 'transparent',
                  color: docsViewMode === 'markdown' ? GDRIVE_DARK.textBright : GDRIVE_DARK.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setConfirmHovered(true)}
          onMouseLeave={() => setConfirmHovered(false)}
          style={{
            height: 30,
            padding: '0 18px',
            borderRadius: 15,
            border: 'none',
            background: confirmHovered && !busy ? GDRIVE_DARK.blueHover : GDRIVE_DARK.blue,
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
            boxShadow: confirmHovered && !busy ? '0 2px 8px rgba(66,133,244,0.3)' : 'none',
            marginLeft: !isDocument ? 'auto' : undefined
          }}
        >
          {busy && <SpinnerIcon size={12} />}
          <span>{actionLabel}</span>
        </button>
      </div>
    </div>
  )
}
