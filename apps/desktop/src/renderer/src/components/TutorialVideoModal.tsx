import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './dashboard-icons'

export interface TutorialVideoModalProps {
  isOpen: boolean
  onClose: () => void
  videoUrl: string
  fallbackVideoUrl?: string
  title: string
}

export function TutorialVideoModal({
  isOpen,
  onClose,
  videoUrl,
  fallbackVideoUrl,
  title
}: TutorialVideoModalProps): JSX.Element | null {
  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const [activeVideoUrl, setActiveVideoUrl] = useState(videoUrl)

  useEffect(() => {
    if (isOpen) {
      setIsVideoLoading(true)
      setActiveVideoUrl(videoUrl)
    }
  }, [isOpen, videoUrl])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      className="tutorial-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="tutorial-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="tutorial-modal-close"
          onClick={onClose}
          aria-label="Close tutorial video"
        >
          <XIcon width={16} height={16} />
        </button>

        <div className="tutorial-modal-video-wrapper">
          {isVideoLoading && (
            <div className="tutorial-modal-loading">
              <span>Loading video...</span>
            </div>
          )}
          <video
            className="tutorial-modal-video"
            controls
            autoPlay
            src={activeVideoUrl}
            onLoadedData={() => setIsVideoLoading(false)}
            onError={() => {
              if (fallbackVideoUrl && activeVideoUrl !== fallbackVideoUrl) {
                setActiveVideoUrl(fallbackVideoUrl)
              } else {
                setIsVideoLoading(false)
              }
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

