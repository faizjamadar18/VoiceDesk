import { useState } from 'react'
import type { JSX } from 'react'
import type { IntegrationsStatus } from '../../../../shared/types'

/** Where a user without a key can create one for free. */
const COMPOSIO_DASHBOARD_URL = 'https://dashboard.composio.dev'

export interface ComposioKeyCardProps {
  status: IntegrationsStatus | null
  isDarkMode?: boolean
  onSaved: (status: IntegrationsStatus) => void
}

/**
 * Explains that integrations run on the user's own free Composio key, and
 * collects that key. Hidden once a key is available, so it disappears after a
 * successful save or when the environment already supplies one. Stays visible
 * when the saved key was rejected, so the user can replace it.
 */
export function ComposioKeyCard({ status, onSaved }: ComposioKeyCardProps): JSX.Element | null {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status?.hasKey && !status?.error) {
    return null
  }

  const hasBrokenKey = Boolean(status?.hasKey && status?.error)
  const shownError = error ?? status?.error ?? null

  const handleSave = async (): Promise<void> => {
    const trimmed = key.trim()
    if (trimmed === '' || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await window.kestrel.setIntegrationsKey(trimmed)
      setKey('')
      onSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleGetKey = (): void => {
    try {
      void window.kestrel?.openOAuthUrl?.(COMPOSIO_DASHBOARD_URL)
    } catch {
      // Opening the browser is best-effort; the link is shown so a user can copy it.
    }
  }

  return (
    <div className="apps-card composio-key-card">
      <h2 className="apps-section-title">
        {hasBrokenKey ? 'Fix your Composio key' : 'Connect your apps'}
      </h2>
      <p className="composio-key-card-body">
        {hasBrokenKey
          ? 'Your saved key was rejected. Paste a working key below to replace it.'
          : 'Kestrel uses your own Composio key, so the calls run on your free Composio account and cost nothing to run. Paste it below, then connect an app.'}
      </p>
      <p className="composio-key-card-body">
        Use your Platform project key from Settings → Project Settings → API Keys. It starts with
        ak_, not ck_.
      </p>

      <div className="composio-key-card-row">
        <label className="composio-key-card-label" htmlFor="composio-key-input">
          Composio API key
        </label>
        <input
          id="composio-key-input"
          className="voiceos-account-input composio-key-card-input"
          type="password"
          placeholder="ak_..."
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          type="button"
          className="voiceos-account-btn voiceos-account-btn--primary"
          onClick={handleSave}
          disabled={key.trim() === '' || saving}
        >
          Save key
        </button>
        <button
          type="button"
          className="voiceos-account-btn composio-key-card-link"
          onClick={handleGetKey}
        >
          Get a free key
        </button>
      </div>

      {shownError && (
        <p className="composio-key-card-error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  )
}

export default ComposioKeyCard
