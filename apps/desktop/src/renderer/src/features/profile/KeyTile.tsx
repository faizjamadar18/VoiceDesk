import type { JSX } from 'react'

export interface KeyTileProps {
  label: string
  sublabel?: string
  className?: string
}

export function KeyTile({ label, sublabel, className = '' }: KeyTileProps): JSX.Element {
  return (
    <div className={`settings-key-tile ${className}`} data-key={label.toLowerCase()}>
      <span className="settings-key-label">{label}</span>
      {sublabel && <span className="settings-key-sublabel">{sublabel}</span>}
    </div>
  )
}

