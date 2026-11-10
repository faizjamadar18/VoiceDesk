import type { JSX } from 'react'
import { AppleSwitch } from '../agent/AppleSwitch'
import type { AppItem } from './types'

export interface AppRowProps {
  app: AppItem
  onToggle: (id: string, connected: boolean) => void
  disabled?: boolean
}

export function AppRow({
  app,
  onToggle,
  disabled = false
}: AppRowProps): JSX.Element {
  return (
    <div className="app-row-item">
      <div className="app-row-left">
        <div className="app-icon-squircle" aria-hidden="true">
          <img src={app.iconUrl} alt="" className="app-icon-img" />
        </div>

        <div className="app-row-text">
          <div className="app-title-group">
            <h4 className="app-title">{app.name}</h4>
            {app.beta && <span className="app-beta-chip">BETA</span>}
          </div>
          <p className="app-description" title={app.description}>
            {app.description}
          </p>
        </div>
      </div>

      <AppleSwitch
        checked={app.connected}
        disabled={disabled}
        label={app.name}
        variant="green"
        onToggle={() => onToggle(app.id, !app.connected)}
      />
    </div>
  )
}

