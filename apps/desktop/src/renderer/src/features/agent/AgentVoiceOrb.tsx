import type { JSX } from 'react'
import cloudsBlue from '../../voiceos-notch/assets/cloudsBlue.png'
import orangeClouds from '../../voiceos-notch/assets/orangeClouds.png'
import pinkClouds from '../../voiceos-notch/assets/pinkClouds.png'
import darkBlueClouds from '../../voiceos-notch/assets/darkBlueClouds.png'
import jarvisReactor from '../../voiceos-notch/assets/jarvisReactor.png'
import lensOverlay from '../../voiceos-notch/assets/lens.png'
import type { AgentCloudTone, AgentVoiceOption } from './types'

export interface AgentVoiceOrbProps {
  voice: AgentVoiceOption
  size?: number
}

function getCloudImage(tone: AgentCloudTone): string {
  switch (tone) {
    case 'blue':
      return cloudsBlue
    case 'orange':
      return orangeClouds
    case 'pink':
      return pinkClouds
    case 'darkBlue':
      return darkBlueClouds
  }
}

export function AgentVoiceOrb({ voice, size = 26 }: AgentVoiceOrbProps): JSX.Element {
  const k = size / 28
  const insetShadow = `inset ${(-5 * k).toFixed(1)}px ${(-6 * k).toFixed(1)}px ${(11 * k).toFixed(1)}px rgba(0, 0, 0, 0.28), inset ${(4 * k).toFixed(1)}px ${(4 * k).toFixed(1)}px ${(8 * k).toFixed(1)}px rgba(255, 255, 255, 0.42)`

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
        boxShadow: insetShadow,
        flexShrink: 0
      }}
      aria-hidden="true"
    >
      <div
        className="agent-voice-orb-cloud"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          backgroundImage: `url(${getCloudImage(voice.cloudTone)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      <img
        src={lensOverlay}
        alt=""
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          pointerEvents: 'none',
          objectFit: 'cover'
        }}
      />
      <div
        className="agent-voice-orb-highlight"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: '50%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          background:
            'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.34), transparent 28%), radial-gradient(circle at 74% 78%, rgba(255,255,255,0.12), transparent 40%)'
        }}
      />
    </div>
  )
}
