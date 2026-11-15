import React, { useEffect, useRef, useState } from 'react'

export interface AppIconProps {
  appIcon?: string | null
  appName?: string | null
  size?: number
  recordingStartTime?: number
  isFavicon?: boolean
}

export function AppIcon({
  appIcon,
  appName,
  size = 20,
  recordingStartTime,
  isFavicon = false
}: AppIconProps): React.JSX.Element | null {
  const [showIcon, setShowIcon] = useState<boolean>(false)
  const [animate, setAnimate] = useState<boolean>(false)
  const prevIconRef = useRef<string | null>(null)

  useEffect(() => {
    if (appIcon) {
      const iconChanging = prevIconRef.current === null
      if (iconChanging) {
        const timeSinceRecordingStart = recordingStartTime ? Date.now() - recordingStartTime : 0
        const isCached = timeSinceRecordingStart < 100
        setAnimate(!isCached)
        if (isCached) {
          setShowIcon(true)
          prevIconRef.current = appIcon
          return undefined
        } else {
          const timer = setTimeout(() => setShowIcon(true), 10)
          prevIconRef.current = appIcon
          return () => clearTimeout(timer)
        }
      } else {
        setShowIcon(true)
        prevIconRef.current = appIcon
      }
    } else {
      setShowIcon(false)
      prevIconRef.current = null
      setAnimate(false)
    }
    return undefined
  }, [appIcon, recordingStartTime])

  if (!appIcon) {
    return null
  }

  const needsWhiteBackground = isFavicon && appName?.toLowerCase().includes('chatgpt')
  if (needsWhiteBackground) {
    return (
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '4px',
          backgroundColor: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showIcon ? 1 : 0,
          transform: animate && !showIcon ? 'scale(0.8)' : 'scale(1)',
          transition: animate ? 'opacity 0.2s ease, transform 0.2s ease' : 'none'
        }}
      >
        <img
          src={appIcon}
          alt={appName || 'App'}
          style={{
            width: size * 0.75,
            height: size * 0.75,
            flexShrink: 0
          }}
        />
      </div>
    )
  }

  return (
    <img
      src={appIcon}
      alt={appName || 'App'}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '4px',
        objectFit: 'contain',
        opacity: showIcon ? 1 : 0,
        transform: animate && !showIcon ? 'scale(0.8)' : 'scale(1)',
        transition: animate ? 'opacity 0.2s ease, transform 0.2s ease' : 'none'
      }}
    />
  )
}

export default AppIcon
