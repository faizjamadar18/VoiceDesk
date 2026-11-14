import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  paintShareCard,
  renderMarkTexture,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH
} from './canvasUtils'
import { MOCK_VOICE_TYPE_MODEL } from './mockData'

export interface VoiceTypeModalProps {
  isOpen: boolean
  onClose: () => void
  isDarkMode?: boolean
}

function CopyIcon({ size = 17, className }: { size?: number; className?: string }): JSX.Element {
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
      className={className}
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function DownloadIcon({ size = 17, className }: { size?: number; className?: string }): JSX.Element {
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
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function CheckIcon({ size = 17, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon({ size = 14, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TwitterIcon({ width = 14, height = 14, className }: { width?: number; height?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z" />
    </svg>
  )
}

function LinkedInIcon({ width = 15, height = 15, className }: { width?: number; height?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

export function VoiceTypeModal({ isOpen, onClose, isDarkMode = true }: VoiceTypeModalProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
  const [texture, setTexture] = useState<string | null>(null)
  const [confirmedAction, setConfirmedAction] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    paintShareCard(canvas, MOCK_VOICE_TYPE_MODEL, { pixelRatio: 2 })
    const frame = requestAnimationFrame(() => setTexture(renderMarkTexture(1)))
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    const node = revealRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const scale = node.offsetWidth ? rect.width / node.offsetWidth : 1
    node.style.setProperty('--reveal-x', `${(event.clientX - rect.left) / scale}px`)
    node.style.setProperty('--reveal-y', `${(event.clientY - rect.top) / scale}px`)
    node.style.opacity = '1'
  }, [])

  const handleMouseLeave = useCallback((): void => {
    const node = revealRef.current
    if (node) node.style.opacity = '0'
  }, [])

  const triggerConfirmation = (action: string): void => {
    setConfirmedAction(action)
    setTimeout(() => {
      setConfirmedAction(null)
    }, 2500)
  }

  const handleCopyImage = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob(async (blob) => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          triggerConfirmation('copy')
        }
      })
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err)
    }
  }

  const handleDownloadImage = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'voiceos-voice-type.png'
      link.href = dataUrl
      link.click()
      triggerConfirmation('download')
    } catch (err) {
      console.error('Failed to download image:', err)
    }
  }

  const handlePostToTwitter = (): void => {
    const text = `I'm ${MOCK_VOICE_TYPE_MODEL.typeName}, says @VoiceOSApp. What's your Voice Type?\n\n(Paste image below ⬇️)`
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    triggerConfirmation('twitter')
  }

  const handlePostToLinkedIn = (): void => {
    const url = 'https://www.linkedin.com/feed/?shareActive=true'
    window.open(url, '_blank', 'noopener,noreferrer')
    triggerConfirmation('linkedin')
  }

  if (!isOpen) return null

  const mask =
    'radial-gradient(circle 132px at var(--reveal-x, -999px) var(--reveal-y, -999px), rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.5) 40%, transparent 72%)'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <div
        className="relative z-[200] flex flex-col items-center overflow-hidden rounded-[30px] border border-white/10 p-6 sm:max-w-[488px] w-full"
        onClick={(e) => e.stopPropagation()}
        style={{
          WebkitAppRegion: 'no-drag',
          backgroundColor: isDarkMode ? '#17181C' : '#FFFFFF',
          boxShadow: isDarkMode
            ? '0 30px 60px -24px rgba(0, 0, 0, 0.85), 0 8px 24px -12px rgba(0, 0, 0, 0.5)'
            : '0 30px 60px -24px rgba(15, 23, 42, 0.35), 0 8px 24px -12px rgba(15, 23, 42, 0.14)'
        } as CSSProperties}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.12] text-white transition-colors hover:bg-white/[0.22] focus:outline-none"
          aria-label="Close"
        >
          <XIcon size={12} />
        </button>

        {/* Share Card Canvas Container */}
        <div
          className="relative flex-shrink-0 cursor-default"
          style={{
            width: SHARE_CARD_WIDTH,
            height: SHARE_CARD_HEIGHT
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              filter:
                'drop-shadow(0 14px 22px rgba(20, 58, 100, 0.32)) drop-shadow(0 2px 4px rgba(20, 58, 100, 0.24))'
            }}
          >
            <div className="sr-only">
              <p>{MOCK_VOICE_TYPE_MODEL.typeName}</p>
              {MOCK_VOICE_TYPE_MODEL.stats.map((stat) => (
                <p key={stat.label}>
                  {stat.value} {stat.label}
                </p>
              ))}
            </div>
          </canvas>
          <div
            ref={revealRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              transition: 'opacity 260ms ease',
              backgroundImage: texture ? `url(${texture})` : undefined,
              backgroundSize: '100% 100%',
              maskImage: mask,
              WebkitMaskImage: mask
            }}
          />
        </div>

        {/* Action Buttons Row */}
        <div className="mt-6 flex w-full items-center gap-2">
          {/* Copy Image Button */}
          <button
            type="button"
            onClick={handleCopyImage}
            title="Copy image"
            aria-label="Copy image"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none ${
              isDarkMode
                ? 'bg-white/[0.07] text-gray-200 hover:bg-white/[0.12]'
                : 'bg-black/[0.05] text-gray-700 hover:bg-black/[0.09]'
            }`}
          >
            {confirmedAction === 'copy' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          </button>

          {/* Download Image Button */}
          <button
            type="button"
            onClick={handleDownloadImage}
            title="Save image"
            aria-label="Save image"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors focus:outline-none ${
              isDarkMode
                ? 'bg-white/[0.07] text-gray-200 hover:bg-white/[0.12]'
                : 'bg-black/[0.05] text-gray-700 hover:bg-black/[0.09]'
            }`}
          >
            {confirmedAction === 'download' ? <CheckIcon size={16} /> : <DownloadIcon size={16} />}
          </button>

          <div className="flex-1" />

          {/* Post to LinkedIn */}
          <button
            type="button"
            onClick={handlePostToLinkedIn}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none ${
              isDarkMode
                ? 'bg-white/[0.07] text-gray-200 hover:bg-white/[0.12]'
                : 'bg-black/[0.05] text-gray-700 hover:bg-black/[0.09]'
            }`}
          >
            <LinkedInIcon width={15} height={15} />
            <span>{confirmedAction === 'linkedin' ? 'Copied' : 'Post to LinkedIn'}</span>
          </button>

          {/* Post to Twitter */}
          <button
            type="button"
            onClick={handlePostToTwitter}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none ${
              isDarkMode
                ? 'bg-white text-gray-900 hover:bg-gray-200'
                : 'bg-gray-900 text-white hover:bg-gray-700'
            }`}
          >
            <TwitterIcon width={14} height={14} />
            <span>{confirmedAction === 'twitter' ? 'Copied' : 'Post to Twitter'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
