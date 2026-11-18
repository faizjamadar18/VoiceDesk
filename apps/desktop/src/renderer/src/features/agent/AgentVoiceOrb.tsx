import type { JSX } from 'react'
import jarvisReactor from '../../voiceos-notch/assets/jarvisReactor.png'
import { AgentThinkingOrb } from '../../voiceos-notch/orb'
import type { AgentVoiceOption } from './types'

export interface AgentVoiceOrbProps {
  voice: AgentVoiceOption
  size?: number
}

export function AgentVoiceOrb({ voice, size = 26 }: AgentVoiceOrbProps): JSX.Element {
  if (voice.isCustomIcon) {
    return (
      <div
        className="agent-voice-orb"
        style={{
          position: 'relative',
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          maxWidth: size,
          maxHeight: size,
          overflow: 'hidden',
          borderRadius: '50%',
          flexShrink: 0
        }}
        aria-hidden="true"
      >
        <img
          src={jarvisReactor}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            objectFit: 'cover',
            pointerEvents: 'none'
          }}
        />
      </div>
    )
  }

  return (
    <div
      className="agent-voice-orb"
      style={{
        position: 'relative',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        overflow: 'hidden',
        borderRadius: '50%',
        flexShrink: 0
      }}
      aria-hidden="true"
    >
      <AgentThinkingOrb size={size} />
    </div>
  )
}
