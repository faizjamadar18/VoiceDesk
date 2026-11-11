import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { KeyboardKey } from './KeyboardKey'

export interface TroubleshootModalProps {
  isOpen: boolean
  onClose: () => void
  onSignOut?: () => Promise<void> | void
  keys?: string[]
}

export function TroubleshootModal({
  isOpen,
  onClose,
  onSignOut,
  keys = ['control (left)', 'alt (left)']
}: TroubleshootModalProps): JSX.Element | null {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [copiedContact, setCopiedContact] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true)
    try {
      await onSignOut?.()
      onClose()
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleTalkToUs = (): void => {
    setCopiedContact(true)
    setTimeout(() => setCopiedContact(false), 2000)
    try {
      window.open('mailto:support@voiceos.com')
    } catch {
      // fallback
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="troubleshoot-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-[20px] bg-[#f3f3f3] shadow-2xl border border-black/10 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 id="troubleshoot-modal-title" className="text-lg font-semibold tracking-tight text-gray-900">
            Troubleshoot
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content list */}
        <div className="px-6 pb-6 space-y-3 overflow-y-auto">
          {/* Card 1: Trigger Key */}
          <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-xs flex flex-col gap-3">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Trigger Key</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Do you see the trigger key light up when you press it?
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-50/80 border border-gray-200/60 p-3">
              <div className="flex items-center gap-2">
                {keys.map((k) => (
                  <KeyboardKey
                    key={k}
                    keyboardKey={k}
                    variant="inline"
                    isPressed={pressedKey === k}
                    onClick={() => setPressedKey(pressedKey === k ? null : k)}
                    className="cursor-pointer py-1 px-3"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPressedKey(keys[0] || null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                Change
              </button>
            </div>
          </div>

          {/* Card 2: Getting a service error? */}
          <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-xs">
            <h4 className="text-sm font-medium text-gray-900">Getting a service error?</h4>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              VPNs, corporate networks, or network filters can block VoiceOS. Please turn off your VPN and try again. If that does not fix it, sign out and log back in.
            </p>
          </div>

          {/* Card 3: Talk to us */}
          <button
            type="button"
            onClick={handleTalkToUs}
            className="w-full text-left p-4 rounded-xl bg-white hover:bg-gray-50/80 border border-gray-100 hover:border-gray-200 shadow-xs flex items-center justify-between transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-[#126ff6] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900">Talk to us</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  {copiedContact ? 'support@voiceos.com' : "Send us a message and we'll help you out"}
                </p>
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
              className="text-gray-300 group-hover:text-gray-500 transition-colors"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Card 4: Re-login */}
          <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-xs flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Re-login</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                If nothing else works, sign out and log back in.
              </p>
            </div>
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
              className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
