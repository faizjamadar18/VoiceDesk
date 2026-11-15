import React, { useLayoutEffect, useEffect, useRef, useState } from 'react'

const EXIT_MS = 160
const ENTER_DELAY_MS = 40
const ENTER_MS = 260
const SWAP_DURATION_MS = ENTER_DELAY_MS + ENTER_MS

const layerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%'
}

const exitingLayerStyle: React.CSSProperties = {
  ...layerStyle,
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: `pillBlurSwapOut ${EXIT_MS}ms cubic-bezier(0.2, 0, 0.3, 1) forwards`
}

const enteringLayerStyle: React.CSSProperties = {
  ...layerStyle,
  animation: `pillBlurSwapIn ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${ENTER_DELAY_MS}ms both`
}

export interface PillContentBlurSwapProps {
  swapKey: string
  animate?: boolean
  children: React.ReactNode
}

export function PillContentBlurSwap({
  swapKey,
  animate = true,
  children
}: PillContentBlurSwapProps): React.JSX.Element {
  const [shownKey, setShownKey] = useState<string>(swapKey)
  const [exiting, setExiting] = useState<{ key: string; node: React.ReactNode } | null>(null)
  const lastNodeRef = useRef<React.ReactNode>(children)

  if (shownKey !== swapKey) {
    setShownKey(swapKey)
    setExiting(animate ? { key: shownKey, node: lastNodeRef.current } : null)
  }

  useLayoutEffect(() => {
    lastNodeRef.current = children
  })

  useEffect(() => {
    if (!exiting) return
    const timeout = setTimeout(() => setExiting(null), SWAP_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [exiting])

  return (
    <div style={{ ...layerStyle, position: 'relative' }}>
      <div key={swapKey} style={exiting ? enteringLayerStyle : layerStyle}>
        {children}
      </div>
      {exiting && (
        <div key={exiting.key} style={exitingLayerStyle}>
          {exiting.node}
        </div>
      )}
    </div>
  )
}

export default PillContentBlurSwap
