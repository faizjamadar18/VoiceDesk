import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { BlocksIcon } from '../../components/dashboard-icons'
import type { IntegrationId, IntegrationsStatus, KestrelApi } from '../../../../shared/types'
import { AppDetailModal } from './AppDetailModal'
import { AppRow } from './AppRow'
import { ComposioKeyCard } from './ComposioKeyCard'
import { INITIAL_APPS } from './dummy-data'
import type { AppItem, AppsPageProps, AppsTabMode } from './types'

/** The catalog ids Kestrel can actually drive through Composio. */
const INTEGRATION_IDS: readonly IntegrationId[] = [
  'googlecalendar',
  'gmail',
  'googlesuper',
  'notion'
]

const NO_KEY_MESSAGE = 'Paste your Composio key above first, then connect an app.'
const CONNECT_FAILED_MESSAGE = 'Could not start the connection. Please try again.'
const DISCONNECT_FAILED_MESSAGE = 'Could not disconnect the app. Please try again.'

function isIntegrationId(id: string): id is IntegrationId {
  return (INTEGRATION_IDS as readonly string[]).includes(id)
}

/**
 * Overlays live Composio status onto the catalog. Integration rows take their
 * connected value from the main process; every other app keeps the value it
 * was given, so the list reflects reality on every status change.
 */
export function resolveApps(apps: AppItem[], status: IntegrationsStatus | null): AppItem[] {
  return apps.map((app) => {
    if (!isIntegrationId(app.id)) {
      return app
    }
    const provider = status?.providers.find((entry) => entry.id === app.id)
    return { ...app, connected: provider?.connected ?? false }
  })
}

export interface IntegrationToggleOutcome {
  /** The line to show under the app store header. */
  message: string
  /** True when the caller should ask the main process to refresh the status. */
  refresh: boolean
}

/**
 * Decides what a toggle on an integration row should do. Kept pure and
 * injectable so the no-key guard and the main-process calls can be tested
 * without a running main process.
 */
export async function runIntegrationToggle(
  id: IntegrationId,
  connected: boolean,
  status: IntegrationsStatus | null,
  kestrel:
    | Pick<
        KestrelApi,
        'connectIntegration' | 'disconnectIntegration' | 'refreshIntegrations'
      >
    | undefined
): Promise<IntegrationToggleOutcome> {
  if (!connected) {
    if (!kestrel?.disconnectIntegration) {
      return { message: DISCONNECT_FAILED_MESSAGE, refresh: false }
    }
    try {
      const result = await kestrel.disconnectIntegration(id)
      return { message: result.message, refresh: result.ok }
    } catch (err) {
      return {
        message: err instanceof Error ? err.message : String(err),
        refresh: false
      }
    }
  }
  if (status?.hasKey !== true) {
    return { message: NO_KEY_MESSAGE, refresh: false }
  }
  try {
    const result = await kestrel?.connectIntegration(id)
    if (!result || !result.ok) {
      return { message: result?.message ?? CONNECT_FAILED_MESSAGE, refresh: false }
    }
    return { message: result.message, refresh: true }
  } catch (err) {
    return { message: err instanceof Error ? err.message : String(err), refresh: false }
  }
}

export function AppsPage({
  initialApps,
  onToggleApp,
  onOpenDocs,
  onOpenFeedback
}: AppsPageProps): JSX.Element {
  const [tab, setTab] = useState<AppsTabMode>('official')
  const [status, setStatus] = useState<IntegrationsStatus | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [appOverrides, setAppOverrides] = useState<Record<string, boolean>>({})
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const initial = await window.kestrel?.getIntegrationsStatus?.()
        if (!cancelled && initial) {
          setStatus(initial)
        }
      } catch {
        // No key configured, or the main process is still being wired. The key
        // card covers the "no key" case; the list stays available either way.
      }
    }
    void load()

    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = window.kestrel?.onIntegrationsChanged?.(setStatus)
    } catch {
      // A missing listener is fine while the main process is incomplete.
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const apps = resolveApps(initialApps ?? INITIAL_APPS, status).map((app) =>
    app.id in appOverrides ? { ...app, connected: appOverrides[app.id] } : app
  )

  const handleToggle = (id: string, connected: boolean): void => {
    if (!isIntegrationId(id)) {
      // Non-integration apps keep their existing local behaviour.
      setAppOverrides((prev) => ({ ...prev, [id]: connected }))
      setSelectedApp((prev) => (prev && prev.id === id ? { ...prev, connected } : prev))
      onToggleApp?.(id, connected)
      return
    }

    setConnectError(null)
    void (async () => {
      const outcome = await runIntegrationToggle(id, connected, status, window.kestrel)
      setConnectError(outcome.message)
      if (outcome.refresh) {
        try {
          await window.kestrel?.refreshIntegrations?.()
        } catch {
          // Best-effort: the push channel delivers the real status anyway.
        }
      }
    })()
  }

  const connectedApps = apps.filter((app) => app.connected)
  const availableApps = apps.filter((app) => !app.connected)

  return (
    <div className="apps-page">
      <h1 className="apps-title">Apps</h1>

      <div className="apps-card">
        <div className="apps-card-header">
          <div className="apps-header-left">
            <BlocksIcon className="apps-section-icon" />
            <div className="apps-header-text">
              <h2 className="apps-header-title">App Store</h2>
              <p className="apps-header-desc">
                Connect apps to use with Agent Mode
              </p>
            </div>
          </div>

          <div className="apps-header-right">
            <button
              type="button"
              className="apps-header-btn"
              onClick={onOpenDocs}
            >
              Documentation
            </button>
            <button
              type="button"
              className="apps-header-btn"
              onClick={onOpenFeedback}
            >
              Feedback
            </button>
          </div>
        </div>

        <ComposioKeyCard status={status} onSaved={setStatus} />

        {connectError && (
          <p className="composio-key-card-error" role="status">
            {connectError}
          </p>
        )}

        <div className="apps-tabs-wrapper">
          <div
            role="tablist"
            aria-label="App store categories"
            className="apps-segmented-group"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'official'}
              onClick={() => setTab('official')}
              className={`apps-segmented-btn ${
                tab === 'official' ? 'apps-segmented-btn--selected' : ''
              }`}
            >
              Official
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'custom'}
              onClick={() => setTab('custom')}
              className={`apps-segmented-btn ${
                tab === 'custom' ? 'apps-segmented-btn--selected' : ''
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {tab === 'official' ? (
          <div className="apps-sections-container">
            {connectedApps.length > 0 && (
              <section className="apps-section" aria-labelledby="connected-heading">
                <h3 id="connected-heading" className="apps-section-title">
                  Connected
                </h3>
                <div className="apps-grid">
                  {connectedApps.map((app) => (
                    <AppRow
                      key={app.id}
                      app={app}
                      onToggle={handleToggle}
                      onSelect={(selected) => setSelectedApp(selected)}
                    />
                  ))}
                </div>
              </section>
            )}

            {availableApps.length > 0 && (
              <section className="apps-section" aria-labelledby="available-heading">
                <h3 id="available-heading" className="apps-section-title">
                  Available
                </h3>
                <div className="apps-grid">
                  {availableApps.map((app, index) => (
                    <AppRow
                      key={app.id}
                      app={app}
                      onToggle={handleToggle}
                      onSelect={(selected) => setSelectedApp(selected)}
                      showSeparator={index < availableApps.length - 2}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="apps-custom-container">
            <div className="apps-custom-empty">
              <BlocksIcon className="apps-custom-empty-icon" />
              <h3 className="apps-custom-empty-title">Custom MCP</h3>
              <p className="apps-custom-empty-desc">
                Add your own local or remote Model Context Protocol servers to use custom tools with Agent Mode.
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onToggleConnect={(id, connected) => handleToggle(id, connected)}
        />
      )}
    </div>
  )
}

export default AppsPage
