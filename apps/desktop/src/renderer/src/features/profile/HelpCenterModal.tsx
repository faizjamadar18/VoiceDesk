import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  ChevronRightIcon,
  CloseIcon,
  DiscordBrandIcon,
  HelpCircleIcon,
  XTwitterIcon
} from './icons'

export interface HelpCenterModalProps {
  isOpen: boolean
  onClose: () => void
}

const SUPPORT_EMAIL = 'support@voiceos.com'
const DISCORD_URL = 'https://discord.gg/voiceos'
const TWITTER_URL = 'https://x.com/kai_brokering'

export function HelpCenterModal({ isOpen, onClose }: HelpCenterModalProps): JSX.Element | null {
  const [emailCopied, setEmailCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleCopyEmail = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SUPPORT_EMAIL)
      }
      setEmailCopied(true)
      setTimeout(() => {
        setEmailCopied(false)
      }, 2500)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  const handleOpenExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="modal-backdrop help-center-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Help Center"
    >
      <div
        className="help-center-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient top light */}
        <div className="help-center-top-glow" />

        {/* Close button */}
        <button
          type="button"
          className="modal-close-btn help-center-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>

        {/* Header */}
        <div className="help-center-header">
          <div className="help-center-badge">
            <HelpCircleIcon size={20} className="help-center-badge-icon" />
          </div>
          <div className="help-center-title-group">
            <h2 className="help-center-title">Help Center</h2>
            <p className="help-center-subtitle">Get support and stay connected</p>
          </div>
        </div>

        {/* Action List */}
        <div className="help-center-list">
          {/* 1. Live Chat */}
          <button
            type="button"
            className="help-center-row"
            onClick={() => {
              // Stub for live chat
            }}
          >
            <div className="help-center-row-left">
              <div className="help-center-icon-tile">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="help-center-icon"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="help-center-row-copy">
                <h3 className="help-center-row-title">Live Chat</h3>
                <p className="help-center-row-desc">Chat with our support team</p>
              </div>
            </div>
            <ChevronRightIcon size={16} className="help-center-row-arrow" />
          </button>

          {/* 2. Discord Community */}
          <button
            type="button"
            className="help-center-row"
            onClick={() => handleOpenExternal(DISCORD_URL)}
          >
            <div className="help-center-row-left">
              <div className="help-center-icon-tile help-center-icon-tile--discord">
                <DiscordBrandIcon size={18} />
              </div>
              <div className="help-center-row-copy">
                <h3 className="help-center-row-title">Discord Community</h3>
                <p className="help-center-row-desc">Join our community for help and updates</p>
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="help-center-row-external"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>

          {/* 3. Follow on X */}
          <button
            type="button"
            className="help-center-row"
            onClick={() => handleOpenExternal(TWITTER_URL)}
          >
            <div className="help-center-row-left">
              <div className="help-center-icon-tile help-center-icon-tile--twitter">
                <XTwitterIcon size={15} />
              </div>
              <div className="help-center-row-copy">
                <h3 className="help-center-row-title">Follow on X</h3>
                <p className="help-center-row-desc">Get the latest news from the founder</p>
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="help-center-row-external"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>

          {/* 4. Email Support */}
          <button
            type="button"
            className={`help-center-row ${emailCopied ? 'help-center-row--copied' : ''}`}
            onClick={handleCopyEmail}
          >
            <div className="help-center-row-left">
              <div
                className={`help-center-icon-tile ${
                  emailCopied ? 'help-center-icon-tile--copied' : 'help-center-icon-tile--email'
                }`}
              >
                {emailCopied ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                )}
              </div>
              <div className="help-center-row-copy">
                <h3
                  className={`help-center-row-title ${
                    emailCopied ? 'help-center-row-title--copied' : ''
                  }`}
                >
                  {emailCopied ? 'Copied!' : 'Email Support'}
                </h3>
                <p
                  className={`help-center-row-desc ${
                    emailCopied ? 'help-center-row-desc--copied' : ''
                  }`}
                >
                  {emailCopied ? 'Email copied to clipboard' : SUPPORT_EMAIL}
                </p>
              </div>
            </div>
            {emailCopied ? (
              <div className="help-center-check-badge">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="help-center-row-copy-icon"
                aria-hidden="true"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer response time */}
        <div className="help-center-footer">
          <p className="help-center-footer-text">Response time is typically within 24 hours</p>
        </div>
      </div>
    </div>
  )
}

