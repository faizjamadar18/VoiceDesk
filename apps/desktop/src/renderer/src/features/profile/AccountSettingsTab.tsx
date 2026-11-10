import { useState } from 'react'
import type { JSX } from 'react'
import { Card } from './Card'
import { ExternalLinkIcon, LogOutIcon, MailIcon, TrashIcon, UserRoundIcon } from './icons'

export interface AccountSettingsTabProps {
  isDarkMode?: boolean
  onClose?: () => void
}

export function AccountSettingsTab({
  isDarkMode = true
}: AccountSettingsTabProps): JSX.Element {
  const [firstName, setFirstName] = useState('Faiz')
  const [lastName, setLastName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  const handleSaveName = () => {
    setIsEditingName(false)
  }

  const handleCheckUpdate = () => {
    setIsCheckingUpdate(true)
    setUpdateStatus(null)
    setTimeout(() => {
      setIsCheckingUpdate(false)
      setUpdateStatus("You're up to date.")
    }, 1200)
  }

  const displayName = `${firstName} ${lastName}`.trim() || 'Faiz'

  return (
    <div className="voiceos-tab-content space-y-4">
      {/* 1. Name Card */}
      <Card isDarkMode={isDarkMode} className="p-5">
        <div className="voiceos-setting-row">
          <div className="voiceos-setting-copy flex items-center gap-2">
            <UserRoundIcon size={20} className="text-gray-300" />
            <div>
              <h3 className="voiceos-row-title">Name</h3>
              <p className="voiceos-row-desc">Used to understand the content on the screen</p>
            </div>
          </div>

          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First"
                className="voiceos-input-sm"
                autoFocus
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last"
                className="voiceos-input-sm"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="voiceos-change-btn voiceos-change-btn--primary"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="voiceos-change-btn"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300 px-3 py-1.5">{displayName}</span>
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="voiceos-change-btn"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Email Card */}
      <Card isDarkMode={isDarkMode} className="p-5">
        <div className="voiceos-setting-row">
          <div className="voiceos-setting-copy flex items-center gap-2">
            <MailIcon size={20} className="text-gray-300" />
            <div>
              <h3 className="voiceos-row-title">Email</h3>
              <p className="voiceos-row-desc">Your account email address</p>
            </div>
          </div>
          <span className="text-sm text-gray-300 px-3 py-1.5">faiz@voiceos.com</span>
        </div>
      </Card>

      {/* 3. Version Card */}
      <Card isDarkMode={isDarkMode} className="p-5">
        <div>
          <div className="voiceos-setting-row">
            <div className="voiceos-setting-copy flex items-center gap-2">
              <div className="voiceos-vo-badge">VO</div>
              <div>
                <h3 className="voiceos-row-title">Version</h3>
                <p className="voiceos-row-desc">Current app version</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300 px-3 py-1.5">0.1.40</span>
              <button
                type="button"
                onClick={() => window.open('https://voiceos.com/changelog', '_blank')}
                className="voiceos-change-btn flex items-center gap-1.5"
              >
                <span>Changelog</span>
                <ExternalLinkIcon size={12} className="opacity-60" />
              </button>
            </div>
          </div>

          {/* Update control row */}
          <div className="voiceos-update-control-row">
            <div className="voiceos-setting-copy">
              <p className="voiceos-row-desc">
                Check for a new version. Downloads start only when you click Update.
              </p>
              {updateStatus && (
                <p className="text-xs text-emerald-400 mt-1 font-medium">{updateStatus}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="voiceos-change-btn"
            >
              {isCheckingUpdate ? 'Checking…' : 'Check updates'}
            </button>
          </div>
        </div>
      </Card>

      {/* 4. Bottom action buttons */}
      <div className="flex gap-2 pt-2 justify-end">
        <button type="button" className="voiceos-btn-destructive flex items-center gap-1.5">
          <TrashIcon size={14} />
          <span>Delete account</span>
        </button>
        <button type="button" className="voiceos-change-btn flex items-center gap-1.5">
          <LogOutIcon size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

