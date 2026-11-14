import { useState, useRef, useEffect, useLayoutEffect, type JSX } from 'react'
import type { NotchDriveCard } from '../../../shared/types'
import { VoiceOsMarkdown } from '../voiceos-notch/markdown'

export interface GoogleDriveCardProps {
  card: NotchDriveCard
  busy?: boolean
  onConfirm?: (data: { name: string; content?: string }) => void
  onDiscard?: () => void
}

function DocsIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
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
      className="shrink-0"
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
      className="shrink-0"
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
      className="shrink-0"
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
      className="animate-spin shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

function CardCloseButton({ onClick }: { onClick?: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Cancel"
      className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 text-white/90 backdrop-blur-md transition-colors"
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
    <div className="relative w-full overflow-hidden rounded-2xl bg-[#1C1C1E] border border-white/10 text-[#D1D1D6] shadow-2xl flex flex-col font-sans">
      <CardCloseButton onClick={onDiscard} />

      {/* Header */}
      <div className="bg-[#232326] border-b border-white/10 px-3.5 py-2.5 flex items-center gap-2.5 shrink-0 pr-10">
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
              className="w-full bg-transparent border-none text-[#F2F2F7] text-base font-semibold outline-none leading-snug placeholder:text-neutral-500"
            />
          </>
        )}

        {isSpreadsheet && (
          <>
            <SheetsIcon size={18} />
            <span className="text-[#F2F2F7] text-sm font-semibold tracking-wide">
              {headerTitle}
            </span>
          </>
        )}

        {!isDocument && !isSpreadsheet && (
          <>
            <GoogleDriveIcon size={18} />
            <span className="text-[#F2F2F7] text-sm font-semibold tracking-wide">
              {headerTitle}
            </span>
          </>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-3 min-h-0">
        {isDocument && (
          <div className="flex flex-col gap-2">
            {docsViewMode === 'preview' ? (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full rounded bg-[#222326] border border-white/10 text-[#D1D1D6] text-sm p-4 min-h-56 max-h-80 overflow-y-auto leading-relaxed shadow-inner"
              >
                {content.trim().length > 0 ? (
                  <VoiceOsMarkdown text={content} />
                ) : (
                  <div className="text-neutral-500 text-sm">Document preview</div>
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
                className="w-full rounded bg-[#1f2023] border border-white/10 focus:border-[#4285F4] text-[#D1D1D6] text-xs font-mono p-3 leading-normal resize-none outline-none min-h-56 transition-colors"
              />
            )}
          </div>
        )}

        {isSpreadsheet && (
          <div className="rounded-lg bg-[#2C2C2E] border border-white/5 p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#202124] flex items-center justify-center shrink-0">
              <SheetsIcon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                aria-label="File name"
                placeholder="File name"
                className="w-full bg-transparent border-none border-b border-white/10 focus:border-[#4285F4] text-[#F2F2F7] text-sm font-medium py-1 outline-none transition-colors placeholder:text-neutral-500"
              />
            </div>
          </div>
        )}

        {!isDocument && !isSpreadsheet && (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-lg bg-[#2C2C2E] border border-white/5 p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#202124] flex items-center justify-center shrink-0">
                <FileIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  spellCheck={false}
                  aria-label="File name"
                  placeholder="File name"
                  className="w-full bg-transparent border-none border-b border-white/10 focus:border-[#4285F4] text-[#F2F2F7] text-sm font-medium py-1 outline-none transition-colors placeholder:text-neutral-500"
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
                className="w-full rounded-lg bg-[#2C2C2E] border border-white/10 focus:border-[#4285F4] text-[#D1D1D6] text-xs font-mono p-2.5 leading-normal outline-none transition-colors resize-vertical"
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3.5 pb-3 flex items-center justify-between gap-2 shrink-0">
        <div>
          {isDocument && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-flex items-center p-0.5 rounded-full bg-[#2C2C2E] border border-white/10 gap-0.5 shadow-inner"
            >
              <button
                type="button"
                onClick={() => setDocsViewMode('preview')}
                className={`h-7 px-3 rounded-full text-xs transition-colors cursor-pointer ${
                  docsViewMode === 'preview'
                    ? 'bg-[#3A3A3C] text-[#F2F2F7] font-semibold shadow-sm'
                    : 'text-[#98989D] hover:text-[#F2F2F7]'
                }`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setDocsViewMode('markdown')}
                className={`h-7 px-3 rounded-full text-xs transition-colors cursor-pointer ${
                  docsViewMode === 'markdown'
                    ? 'bg-[#3A3A3C] text-[#F2F2F7] font-semibold shadow-sm'
                    : 'text-[#98989D] hover:text-[#F2F2F7]'
                }`}
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
          className="inline-flex items-center justify-center gap-1.5 h-7.5 px-4 rounded-full bg-[#4285F4] hover:bg-[#5A9CF5] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer transition-colors shadow-md ml-auto"
        >
          {busy && <SpinnerIcon size={12} />}
          <span>{actionLabel}</span>
        </button>
      </div>
    </div>
  )
}
