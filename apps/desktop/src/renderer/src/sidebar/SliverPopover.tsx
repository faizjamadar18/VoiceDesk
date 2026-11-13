import type { CSSProperties, JSX } from 'react'

export interface SliverPopoverProps {
  shortcutLabel?: string
  style?: CSSProperties
}

/**
 * Sliver hover popover displaying the keyboard shortcut to summon Kestrel
 * and drag-to-move reposition affordance.
 */
export function SliverPopover({
  shortcutLabel = 'Ctrl+Space',
  style
}: SliverPopoverProps): JSX.Element {
  return (
    <div
      className="side-notch-popover"
      style={style}
      role="tooltip"
      aria-label="Sidebar shortcut and move hint"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="side-notch-popover-controls">
        <div
          className="side-notch-popover-shortcut"
          title={`${shortcutLabel} to open`}
        >
          <kbd>{shortcutLabel}</kbd>
          <span>to open</span>
        </div>
        <div className="side-notch-popover-drag">
          <span aria-hidden="true">↕</span>
          <span>Drag to move</span>
        </div>
      </div>
    </div>
  )
}
