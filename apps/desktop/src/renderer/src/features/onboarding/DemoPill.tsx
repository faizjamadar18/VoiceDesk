import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import notionIcon from '../../assets/notion.webp'
import { AudioBars } from './AudioBars'

export interface DemoPillProps {
  isRecording: boolean
}

export function DemoPill({ isRecording }: DemoPillProps): JSX.Element {
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    if (isRecording) {
      const timer = setTimeout(() => setShowContent(true), 100)
      return () => clearTimeout(timer)
    }
    setShowContent(false)
    return undefined
  }, [isRecording])

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: '#000000',
        width: isRecording ? 104 : 37,
        height: isRecording ? 32 : 9,
        padding: isRecording ? '0 8px' : '0',
        gap: 5,
        transform: isRecording ? 'scale(1)' : 'scale(0.95)',
        opacity: 1,
        transition:
          'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), height 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          padding: 1,
          background:
            'radial-gradient(ellipse at 0% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 30%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 30%, transparent 60%), rgba(255,255,255,0.07)',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: showContent ? 1 : 0,
          transform: showContent ? 'scale(1)' : 'scale(0.8)',
          transition: 'opacity 0.2s ease-out, transform 0.2s ease-out'
        }}
      >
        <img
          src={notionIcon}
          alt="Notion"
          style={{
            width: 17,
            height: 17,
            flexShrink: 0,
            borderRadius: 4
          }}
        />
        <AudioBars isRecording={isRecording} barCount={6} maxBarHeight={16} />
      </div>
    </div>
  )
}

