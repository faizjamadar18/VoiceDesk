import { useState } from 'react'
import type { JSX } from 'react'
import { Card } from './Card'
import {
  ExternalLinkIcon,
  LogOutIcon,
  MailIcon,
  TrashIcon,
  UserRoundIcon,
  VoOutlineIcon
} from './icons'

export interface AccountSettingsTabProps {
  isDarkMode?: boolean
  onClose?: () => void
  userEmail?: string
}

export function AccountSettingsTab({
  isDarkMode = true,
  onClose,
  userEmail = 'faizj18.work@gmail.com'
}: AccountSettingsTabProps): JSX.Element {
  const [firstName, setFirstName] = useState('Faiz')
  const [lastName, setLastName] = useState('.')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editFirstName, setEditFirstName] = useState('Faiz')
  const [editLastName, setEditLastName] = useState('.')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleStartEdit = () => {
    setEditFirstName(firstName)
    setEditLastName(lastName)
    setIsEditingName(true)
  }

  const handleSaveName = () => {
    setFirstName(editFirstName)
    setLastName(editLastName)
    setIsEditingName(false)
  }

  const handleCancelEdit = () => {
    setEditFirstName(firstName)
    setEditLastName(lastName)
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

  const handleDeleteAccount = () => {
    if (deleteConfirmation.trim().toLowerCase() !== 'delete account') return
    setIsDeleting(true)
    setTimeout(() => {
      setIsDeleting(false)
      setShowDeleteModal(false)
      setDeleteConfirmation('')
      onClose?.()
    }, 800)
  }

  const displayName = `${firstName} ${lastName}`.trim() || 'Faiz .'
  const isDeleteConfirmed = deleteConfirmation.trim().toLowerCase() === 'delete account'

  return (
    <>
      <div className="voiceos-account-container">
        {/* 1. Name Card */}
        <Card isDarkMode={isDarkMode} className="voiceos-account-card">
          <div className="voiceos-account-row">
            <div className="voiceos-account-left">
              <span className="voiceos-account-icon" aria-hidden="true">
                <UserRoundIcon size={20} />
              </span>
              <div className="voiceos-account-labels">
                <h3 className="voiceos-account-title">Name</h3>
                <p className="voiceos-account-desc">Used to understand the content on the screen</p>
              </div>
            </div>

            {isEditingName ? (
              <div className="voiceos-account-right">
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="First"
                  className="voiceos-account-input"
                  autoFocus
                />
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Last"
                  className="voiceos-account-input"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="voiceos-account-btn voiceos-account-btn--primary"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="voiceos-account-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="voiceos-account-right">
                <div className="voiceos-account-val">{displayName}</div>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="voiceos-account-btn"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* 2. Email Card */}
        <Card isDarkMode={isDarkMode} className="voiceos-account-card">
          <div className="voiceos-account-row">
            <div className="voiceos-account-left">
              <span className="voiceos-account-icon" aria-hidden="true">
                <MailIcon size={20} />
              </span>
              <div className="voiceos-account-labels">
                <h3 className="voiceos-account-title">Email</h3>
                <p className="voiceos-account-desc">Your account email address</p>
              </div>
            </div>
            <div className="voiceos-account-right">
              <div className="voiceos-account-val">{userEmail}</div>
            </div>
          </div>
        </Card>

        {/* 3. Version Card */}
        <Card isDarkMode={isDarkMode} className="voiceos-account-card">
          {/* Row 1: Version Info */}
          <div className="voiceos-account-row">
            <div className="voiceos-account-left">
              <span className="voiceos-account-icon" aria-hidden="true">
                <VoOutlineIcon size={20} />
              </span>
              <div className="voiceos-account-labels">
                <h3 className="voiceos-account-title">Version</h3>
                <p className="voiceos-account-desc">Current app version</p>
              </div>
            </div>
            <div className="voiceos-account-right">
              <div className="voiceos-account-val">0.1.40</div>
              <button
                type="button"
                onClick={() => window.open('https://voiceos.com/changelog', '_blank')}
                className="voiceos-account-btn"
              >
                <span>What's New</span>
                <ExternalLinkIcon size={12} style={{ opacity: 0.7 }} />
              </button>
            </div>
          </div>

          {/* Row 2: Update Control */}
          <div className="voiceos-account-update-row">
            <div>
              <p className="voiceos-account-update-desc">
                Check for a new version. Downloads start only when you click Update.
              </p>
              {updateStatus && (
                <p className="voiceos-account-update-status">{updateStatus}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="voiceos-account-update-btn"
            >
              {isCheckingUpdate ? 'Checking…' : 'Check updates'}
            </button>
          </div>
        </Card>

        {/* 4. Bottom action buttons */}
        <div className="voiceos-account-footer">
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="voiceos-account-delete-btn"
          >
            <TrashIcon size={14} />
            <span>Delete account</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="voiceos-account-signout-btn"
          >
            <LogOutIcon size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="voiceos-delete-dialog-overlay"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div
            className="voiceos-delete-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" className="voiceos-delete-dialog-title">
              Delete Account
            </h3>
            <p className="voiceos-delete-dialog-warning">
              This action cannot be undone. All your data will be permanently deleted.
            </p>
            <p className="voiceos-delete-dialog-prompt">
              Type <strong>delete account</strong> to confirm
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="delete account"
              className="voiceos-delete-dialog-input"
              autoFocus
            />
            <div className="voiceos-delete-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmation('')
                }}
                disabled={isDeleting}
                className="voiceos-account-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!isDeleteConfirmed || isDeleting}
                className="voiceos-delete-confirm-btn"
              >
                {isDeleting ? 'Deleting…' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
