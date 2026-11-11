import { useEffect, useState } from 'react'
import type { JSX } from 'react'

export interface AnimatedCheckProps {
  trigger?: boolean
  color?: string
}

export function AnimatedCheck({
  trigger = true,
  color = '#126ff6'
}: AnimatedCheckProps): JSX.Element {
  const [showWidth, setShowWidth] = useState(false)
  const [showOpacity, setShowOpacity] = useState(false)

  useEffect(() => {
    if (trigger) {
      setShowWidth(false)
      setShowOpacity(false)
      const t1 = setTimeout(() => {
        setShowWidth(true)
        const t2 = setTimeout(() => {
          setShowOpacity(true)
        }, 350)
        return () => clearTimeout(t2)
      }, 50)
      return () => clearTimeout(t1)
    } else {
      setShowWidth(false)
      setShowOpacity(false)
      return undefined
    }
  }, [trigger])

  return (
    <div
      style={{
        overflow: 'hidden',
        display: 'inline-block',
        width: showWidth ? 24 : 0,
        transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)',
        verticalAlign: 'middle'
      }}
    >
      <div
        className="mr-1"
        style={{
          backgroundColor: color,
          borderRadius: '50%',
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showOpacity ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1)'
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </div>
  )
}

