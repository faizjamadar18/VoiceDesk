import type { JSX } from 'react'
import { ZapIcon } from '../../components/dashboard-icons'
import { AppleSwitch } from './AppleSwitch'
import {
  AppLaunchIcon,
  ClockIcon,
  MusicIcon,
  PointerTrailIcon,
  PromptDocumentIcon,
  TextSelectionIcon
} from './icons'
import type { AgentActionGlyph, AgentActionId, AgentActionItem } from './types'

export interface ActionsSectionProps {
  actions: AgentActionItem[]
  onToggleAction: (actionId: AgentActionId, enabled: boolean) => void
  onSelectAction?: (actionId: AgentActionId) => void
}

function renderActionGlyph(glyph: AgentActionGlyph): JSX.Element {
  switch (glyph) {
    case 'pointerTrail':
      return <PointerTrailIcon width={18} height={18} className="agent-action-glyph" />
    case 'promptDocument':
      return <PromptDocumentIcon width={18} height={18} className="agent-action-glyph" />
    case 'textSelection':
      return <TextSelectionIcon width={18} height={18} className="agent-action-glyph" />
    case 'clock':
      return <ClockIcon width={18} height={18} className="agent-action-glyph" />
    case 'music':
      return <MusicIcon width={18} height={18} className="agent-action-glyph" />
    case 'appLaunch':
      return <AppLaunchIcon width={18} height={18} className="agent-action-glyph" />
  }
}

export function ActionsSection({
  actions,
  onToggleAction,
  onSelectAction
}: ActionsSectionProps): JSX.Element {
  return (
    <section className="agent-card agent-actions-card" aria-labelledby="actions-heading">
      <div className="agent-card-header">
        <div className="agent-section-info">
          <ZapIcon className="agent-section-icon" />
          <div>
            <h2 id="actions-heading" className="agent-section-title">
              Actions
            </h2>
            <p className="agent-section-desc">
              Common system actions Agent Mode can perform.
            </p>
          </div>
        </div>
      </div>

      <div className="agent-actions-grid">
        {actions.map((action) => (
          <div
            key={action.id}
            className="agent-action-item cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
            role="button"
            tabIndex={0}
            onClick={() => onSelectAction?.(action.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectAction?.(action.id)
              }
            }}
          >
            <div className="agent-action-left">
              <div className="agent-action-tile" aria-hidden="true">
                {renderActionGlyph(action.glyph)}
              </div>

              <div className="agent-action-text">
                <h3 className="agent-action-title">{action.title}</h3>
                <p className="agent-action-desc">{action.description}</p>
              </div>
            </div>

            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <AppleSwitch
                checked={action.enabled}
                disabled={!action.available}
                label={action.title}
                variant="green"
                onToggle={() => onToggleAction(action.id, !action.enabled)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
