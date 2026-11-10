import { useState } from 'react'
import type { JSX } from 'react'
import { BlocksIcon } from '../../components/dashboard-icons'
import { AppDetailModal } from './AppDetailModal'
import { AppRow } from './AppRow'
import { INITIAL_APPS } from './dummy-data'
import type { AppItem, AppsPageProps, AppsTabMode } from './types'

export function AppsPage({
  initialApps,
  onToggleApp,
  onOpenDocs,
  onOpenFeedback
}: AppsPageProps): JSX.Element {
  const [tab, setTab] = useState<AppsTabMode>('official')
  const [apps, setApps] = useState<AppItem[]>(initialApps ?? INITIAL_APPS)
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null)

  const handleToggle = (id: string, connected: boolean): void => {
    setApps((prev) =>
      prev.map((app) => (app.id === id ? { ...app, connected } : app))
    )
    setSelectedApp((prev) => (prev && prev.id === id ? { ...prev, connected } : prev))
    onToggleApp?.(id, connected)
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
