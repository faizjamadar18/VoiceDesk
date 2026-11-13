import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { HistoryRecord } from '../../../shared/types'
import {
  buildSideNotchClipPath,
  CLOSING_TIMING,
  dragSliverPosition,
  formatSessionHeader,
  isPointInSliver,
  normalizeSliverPosition,
  NOTCH_BOTTOM_SAFE_AREA_PX,
  NOTCH_EXPANDED_HEIGHT_PX,
  NOTCH_EXPANDED_WIDTH_PX,
  NOTCH_RIGHT_RADIUS_PX,
  NOTCH_SHOULDER_PX,
  OPENING_TIMING,
  ROW_TITLE_MAX_CHARS,
  SESSION_GAP_MS,
  sliverHeight,
  SLIVER_DOT_REVEAL_DELAY_MS,
  SLIVER_DRAG_THRESHOLD,
  SLIVER_HOVER_WIDTH,
  SLIVER_MAX_DOTS,
  SLIVER_POPOVER_LEFT,
  SLIVER_POSITION_KEY,
  SLIVER_SHOULDER,
  SLIVER_VISIBILITY_EASING,
  SLIVER_VISIBILITY_TRANSITION_MS,
  SLIVER_WIDTH,
  sliverTop,
  truncateTitle
} from './geometry'
import { SliverPopover } from './SliverPopover'
import './sidebar.css'

function SearchIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function LockIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function LockOpenIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

function readStoredPosition(): number {
  try {
    const saved = localStorage.getItem(SLIVER_POSITION_KEY)
    return saved === null ? 0.5 : normalizeSliverPosition(Number(saved))
  } catch {
    return 0.5
  }
}

export function VoiceOsSidebar(): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isCollapsedHovered, setIsCollapsedHovered] = useState(false)
  const [isLeftEdgeHovered, setIsLeftEdgeHovered] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [position, setPosition] = useState<number>(readStoredPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [collapseSettled, setCollapseSettled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl+Space')

  const popoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800
  )

  const panelRef = useRef<HTMLElement | null>(null)
  const dragPointerRef = useRef<{
    id: number
    x: number
    y: number
    top: number
    moved: boolean
    position: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // 1. Fetch history on mount and subscribe to history changes
  const fetchHistory = useCallback(async () => {
    try {
      if (window.kestrel?.listHistory) {
        const records = await window.kestrel.listHistory()
        setHistory(records)
      }
    } catch (err) {
      console.error('[VoiceOsSidebar] Failed to load history:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchHistory()
    if (window.kestrel?.onHistoryChanged) {
      const unsubscribe = window.kestrel.onHistoryChanged(() => {
        void fetchHistory()
      })
      return unsubscribe
    }
    return undefined
  }, [fetchHistory])

  // 2. Fetch shortcut hotkey
  useEffect(() => {
    window.kestrel
      ?.getSettings?.()
      .then((settings) => {
        if (settings?.hotkey) {
          const formatted = settings.hotkey
            .split('+')
            .map((k) => (k === 'Control' ? 'Ctrl' : k))
            .join('+')
          setShortcutLabel(formatted)
        }
      })
      .catch(() => {
        // ignore
      })
  }, [])

  // 3. Track viewport resizing
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 4. Track collapse settling
  useEffect(() => {
    if (isExpanded) {
      setCollapseSettled(false)
      return undefined
    }
    const timer = setTimeout(() => {
      setCollapseSettled(true)
    }, CLOSING_TIMING.durationMs + 24)
    return () => clearTimeout(timer)
  }, [isExpanded])

  // Geometry computations
  const panelTopPx = (viewportHeight - NOTCH_EXPANDED_HEIGHT_PX) / 2
  const collapsedHeightPx = sliverHeight(history.length)
  const collapsedTopPx = sliverTop(
    position,
    collapsedHeightPx,
    NOTCH_EXPANDED_HEIGHT_PX,
    NOTCH_SHOULDER_PX
  )
  const isSliverVisible = isExpanded || isCollapsedHovered || isLeftEdgeHovered || isDragging
  const collapsedWidthPx = isCollapsedHovered ? SLIVER_HOVER_WIDTH : SLIVER_WIDTH
  const collapsedRightRadiusPx = collapsedWidthPx - SLIVER_SHOULDER

  const surfaceWidth = isExpanded
    ? NOTCH_EXPANDED_WIDTH_PX
    : isSliverVisible
      ? collapsedWidthPx
      : 0
  const surfaceHeight = isExpanded ? NOTCH_EXPANDED_HEIGHT_PX : collapsedHeightPx
  const shoulder = isExpanded ? NOTCH_SHOULDER_PX : isSliverVisible ? SLIVER_SHOULDER : 0
  const cornerRadius = isExpanded ? NOTCH_RIGHT_RADIUS_PX : isSliverVisible ? collapsedRightRadiusPx : 0

  const sideNotchClipPath = useMemo(
    () =>
      buildSideNotchClipPath(
        surfaceWidth,
        surfaceHeight,
        shoulder,
        cornerRadius,
        isExpanded ? 0 : collapsedTopPx
      ),
    [surfaceWidth, surfaceHeight, shoulder, cornerRadius, isExpanded, collapsedTopPx]
  )

  const isNotchSurfaceTargetVisible = isExpanded || isSliverVisible
  const isNotchSurfaceVisible = isNotchSurfaceTargetVisible || !collapseSettled

  const isSliverTransition = !isExpanded && collapseSettled
  const notchSurfaceTransitionMs = isDragging
    ? 0
    : isSliverTransition
      ? SLIVER_VISIBILITY_TRANSITION_MS // 180ms
      : isExpanded
        ? OPENING_TIMING.durationMs     // 280ms
        : CLOSING_TIMING.durationMs     // 200ms
  const notchSurfaceTransitionEasing = isSliverTransition
    ? SLIVER_VISIBILITY_EASING          // cubic-bezier(0.4, 0, 0.2, 1)
    : isExpanded
      ? OPENING_TIMING.easing           // cubic-bezier(0.2, 0.8, 0.2, 1)
      : CLOSING_TIMING.easing           // cubic-bezier(0.45, 0, 0.55, 1)

  const silhouetteTransition = `clip-path ${notchSurfaceTransitionMs}ms ${notchSurfaceTransitionEasing}, -webkit-clip-path ${notchSurfaceTransitionMs}ms ${notchSurfaceTransitionEasing}, filter 220ms ease, background-color 260ms ease, visibility 0s linear ${isNotchSurfaceVisible ? 0 : notchSurfaceTransitionMs}ms`

  const dotRevealDelayMs = isSliverVisible ? Math.min(SLIVER_DOT_REVEAL_DELAY_MS, notchSurfaceTransitionMs) : 0
  const dotAppearanceDurationMs = notchSurfaceTransitionMs - dotRevealDelayMs
  const dotAppearanceTransition = isExpanded
    ? 'none'
    : `filter ${dotAppearanceDurationMs}ms ${notchSurfaceTransitionEasing} ${dotRevealDelayMs}ms, visibility 0s linear ${isSliverVisible ? dotRevealDelayMs : notchSurfaceTransitionMs}ms`

  // Popover placement
  const sliverCenterY = panelTopPx + collapsedTopPx + collapsedHeightPx / 2
  const popoverTop = Math.max(8, Math.min(viewportHeight - 68 - 8, sliverCenterY - 34))

  // Mouse interactivity reconciliation
  const reconcilePointer = useCallback(
    (x: number, y: number) => {
      if (dragPointerRef.current) return
      if (isExpanded) {
        return
      }

      const sliverY = panelTopPx + collapsedTopPx
      const overSliver = isPointInSliver(x, y, collapsedWidthPx, collapsedHeightPx, sliverY)
      const overPopover =
        showPopover &&
        x >= SLIVER_POPOVER_LEFT &&
        x <= SLIVER_POPOVER_LEFT + 220 &&
        y >= popoverTop &&
        y <= popoverTop + 68

      setIsCollapsedHovered(overSliver || overPopover)
    },
    [
      isExpanded,
      panelTopPx,
      collapsedTopPx,
      collapsedWidthPx,
      collapsedHeightPx,
      showPopover,
      popoverTop
    ]
  )

  // Listen for pointer updates from main process (e.g. left screen edge hover)
  useEffect(() => {
    if (!window.kestrel?.onSidebarPointer) return undefined
    const unsubscribe = window.kestrel.onSidebarPointer((payload) => {
      setIsLeftEdgeHovered(Boolean(payload.atLeftEdge || payload.x <= 1))

      if (!isExpanded) {
        reconcilePointer(payload.x, payload.y)
      }
    })
    return () => {
      unsubscribe()
    }
  }, [isExpanded, reconcilePointer])

  // Show popover after 800ms of hovering the sliver
  useEffect(() => {
    if (isCollapsedHovered && isSliverVisible && !isExpanded && !isDragging) {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current)
      }
      popoverTimerRef.current = setTimeout(() => {
        setShowPopover(true)
        popoverTimerRef.current = null
      }, 800)
    } else {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current)
        popoverTimerRef.current = null
      }
      setShowPopover(false)
    }

    return () => {
      if (popoverTimerRef.current) {
        clearTimeout(popoverTimerRef.current)
        popoverTimerRef.current = null
      }
    }
  }, [isCollapsedHovered, isSliverVisible, isExpanded, isDragging])

  // Report interactive region to main process for pointer synchronization & passthrough
  useEffect(() => {
    if (!window.kestrel?.setSidebarRegion) return

    const sliverY = panelTopPx + collapsedTopPx

    if (isExpanded) {
      window.kestrel.setSidebarRegion({
        left: 0,
        top: Math.round(panelTopPx),
        width: 232,
        height: NOTCH_EXPANDED_HEIGHT_PX
      })
    } else if (isSliverVisible) {
      window.kestrel.setSidebarRegion({
        left: 0,
        top: Math.max(0, Math.round(showPopover ? Math.min(popoverTop, sliverY) : sliverY)),
        width: showPopover ? SLIVER_POPOVER_LEFT + 220 : collapsedWidthPx + 4,
        height: Math.round(
          showPopover
            ? Math.max(popoverTop + 68, sliverY + collapsedHeightPx) - Math.min(popoverTop, sliverY)
            : collapsedHeightPx
        )
      })
    } else {
      window.kestrel.setSidebarRegion(null)
    }

    return () => {
      window.kestrel?.setSidebarRegion(null)
    }
  }, [
    isExpanded,
    isSliverVisible,
    showPopover,
    panelTopPx,
    collapsedTopPx,
    collapsedWidthPx,
    collapsedHeightPx,
    popoverTop
  ])

  // Listen for collapse broadcast (e.g. window blur from outside clicks)
  useEffect(() => {
    if (!window.kestrel?.onSidebarCollapse) return undefined
    const unsubscribe = window.kestrel.onSidebarCollapse(() => {
      if (!isPinned) {
        setIsExpanded(false)
        setIsCollapsedHovered(false)
        setIsLeftEdgeHovered(false)
        setShowPopover(false)
        if (popoverTimerRef.current) {
          clearTimeout(popoverTimerRef.current)
          popoverTimerRef.current = null
        }
      }
    })
    return unsubscribe
  }, [isPinned])

  // Outside click & blur handling
  useEffect(() => {
    if (!isExpanded || isPinned) return

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current
      if (panel && !panel.contains(event.target as Node)) {
        setIsExpanded(false)
        setIsCollapsedHovered(false)
        setIsLeftEdgeHovered(false)
        setShowPopover(false)
      }
    }

    const handleBlur = () => {
      setIsExpanded(false)
      setIsCollapsedHovered(false)
      setIsLeftEdgeHovered(false)
      setShowPopover(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isExpanded, isPinned])

  // Drag handling
  const handleSliverPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return
    suppressClickRef.current = false
    dragPointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      top: collapsedTopPx,
      moved: false,
      position
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    window.kestrel?.setSidebarInteractive(true)
  }

  const handleSliverPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragPointerRef.current
    if (!drag || drag.id !== event.pointerId) return
    const deltaY = event.clientY - drag.y
    if (!drag.moved && Math.hypot(event.clientX - drag.x, deltaY) < SLIVER_DRAG_THRESHOLD) {
      return
    }
    drag.moved = true
    const newPos = dragSliverPosition({
      startTop: drag.top,
      deltaY,
      height: collapsedHeightPx,
      panelHeight: NOTCH_EXPANDED_HEIGHT_PX,
      edgeInset: NOTCH_SHOULDER_PX
    })
    drag.position = newPos
    setIsDragging(true)
    setPosition(newPos)
  }

  const handleSliverPointerFinish = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false
  ) => {
    const drag = dragPointerRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragPointerRef.current = null
    suppressClickRef.current = true
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) {
      try {
        localStorage.setItem(SLIVER_POSITION_KEY, String(drag.position))
      } catch {
        // ignore storage errors
      }
    }
    if (cancelled) {
      setIsCollapsedHovered(false)
      setIsLeftEdgeHovered(false)
      setShowPopover(false)
      window.kestrel?.setSidebarInteractive(false)
    } else if (!drag.moved) {
      setIsExpanded(true)
    }
  }

  const handleSliverClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 && suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setIsExpanded(true)
  }

  const togglePin = () => {
    setIsPinned((prev) => !prev)
  }

  // Filter history
  const filteredHistory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return history
    return history.filter(
      (item) =>
        item.prompt.toLowerCase().includes(query) ||
        item.reply.toLowerCase().includes(query)
    )
  }, [history, searchQuery])

  // Sliver dots
  const sliverDots = useMemo(() => {
    const dotsToShow = history.slice(0, SLIVER_MAX_DOTS)
    return dotsToShow.map((item, idx) => ({
      id: item.id || `dot-${idx}`,
      title: truncateTitle(item.prompt, 30),
      state: 'idle' as const
    }))
  }, [history])

  // Grouped history list
  const historyContent = useMemo(() => {
    if (isLoading && history.length === 0) {
      return <div className="agent-history-notch-empty">Loading conversations...</div>
    }
    if (history.length === 0) {
      return <div className="agent-history-notch-empty">No agent conversations yet.</div>
    }
    if (filteredHistory.length === 0) {
      return <div className="agent-history-notch-empty">No matching replies.</div>
    }

    const nodes: JSX.Element[] = []
    let previousTimestamp: number | null = null

    for (const entry of filteredHistory) {
      const ts = new Date(entry.createdAt).getTime()
      if (previousTimestamp === null || previousTimestamp - ts > SESSION_GAP_MS) {
        nodes.push(
          <div key={`session-${entry.id}`} className="agent-history-notch-day-separator">
            {formatSessionHeader(ts)}
          </div>
        )
      }
      previousTimestamp = ts

      const isSelected = selectedId === entry.id
      const title = truncateTitle(entry.prompt, ROW_TITLE_MAX_CHARS)

      nodes.push(
        <button
          key={entry.id}
          type="button"
          className={`agent-history-notch-row ${isSelected ? 'agent-history-notch-row--selected' : ''}`}
          data-side-notch-id={entry.id}
          onClick={() => {
            setSelectedId(entry.id)
            if (window.kestrel?.sidebarRestoreHistory) {
              window.kestrel.sidebarRestoreHistory(entry.prompt, entry.reply)
            } else {
              window.kestrel?.restoreHistoryInNotch({
                prompt: entry.prompt,
                reply: entry.reply
              })
            }
          }}
          title="Open in top notch"
        >
          <span className="agent-history-notch-row-body">
            <span className="agent-history-notch-row-topline">
              <span className="agent-history-notch-row-title">{title}</span>
            </span>
          </span>
        </button>
      )
    }

    return nodes
  }, [isLoading, history.length, filteredHistory, selectedId])

  const sideNotchSilhouetteFilter = isExpanded
    ? 'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.12))'
    : 'none'

  const rootStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    background: 'transparent',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    WebkitFontSmoothing: 'antialiased',
    ['--side-notch-panel-pointer-events' as string]: isExpanded ? 'auto' : 'none',
    ['--side-notch-sliver-pointer-events' as string]: isExpanded || !isSliverVisible ? 'none' : 'auto',
    ['--side-notch-silhouette-filter' as string]: sideNotchSilhouetteFilter,
    ['--side-notch-transition-duration' as string]: `${notchSurfaceTransitionMs}ms`,
    ['--side-notch-transition-easing' as string]: notchSurfaceTransitionEasing,
    ['--side-notch-content-background' as string]: 'rgba(0, 0, 6, 0.95)',
    ['--side-notch-list-bottom' as string]: `${NOTCH_BOTTOM_SAFE_AREA_PX}px`
  }

  return (
    <div
      style={rootStyle}
      onMouseMove={(e) => {
        if (!isExpanded) {
          reconcilePointer(e.clientX, e.clientY)
        }
      }}
      onMouseLeave={() => {
        if (dragPointerRef.current) return
        setIsCollapsedHovered(false)
        setIsLeftEdgeHovered(false)
        setShowPopover(false)
        if (popoverTimerRef.current) {
          clearTimeout(popoverTimerRef.current)
          popoverTimerRef.current = null
        }
      }}
    >
      {/* Sliver Popover */}
      {showPopover && isCollapsedHovered && isSliverVisible && !isExpanded && !isDragging && (
        <SliverPopover
          shortcutLabel={shortcutLabel}
          style={{
            left: SLIVER_POPOVER_LEFT,
            top: popoverTop
          }}
        />
      )}

      {/* Main Notch Panel */}
      <aside
        ref={panelRef}
        className="agent-history-side-notch"
        aria-label="Recent agent conversations"
      >
        <div className="agent-history-notch-surface">
          {/* Silhouette & Morphing Clip Path */}
          <div className="agent-history-notch-silhouette-shadow" aria-hidden="true">
            <div
              className="agent-history-notch-silhouette"
              style={{
                background: '#000',
                transition: silhouetteTransition,
                clipPath: sideNotchClipPath,
                WebkitClipPath: sideNotchClipPath,
                visibility: isNotchSurfaceVisible ? 'visible' : 'hidden'
              }}
            />
          </div>

          {/* Collapsed Sliver Handle */}
          <div
            className="agent-history-notch-sliver-mask"
            style={{
              clipPath: sideNotchClipPath,
              WebkitClipPath: sideNotchClipPath,
              transition: silhouetteTransition,
              visibility: isNotchSurfaceVisible ? 'visible' : 'hidden'
            }}
          >
            <button
              type="button"
              className="agent-history-notch-sliver"
              aria-label="Open recent conversations"
              aria-expanded={isExpanded}
              tabIndex={isExpanded || !isSliverVisible ? -1 : 0}
              onPointerDown={handleSliverPointerDown}
              onPointerMove={handleSliverPointerMove}
              onPointerUp={(e) => handleSliverPointerFinish(e)}
              onPointerCancel={(e) => handleSliverPointerFinish(e, true)}
              onLostPointerCapture={(e) => handleSliverPointerFinish(e, true)}
              onClick={handleSliverClick}
              style={{
                top: collapsedTopPx,
                width: collapsedWidthPx,
                height: collapsedHeightPx,
                transform: isSliverVisible ? 'translateX(0)' : `translateX(-${collapsedWidthPx / 2}px)`,
                transition: `width ${notchSurfaceTransitionMs}ms ${notchSurfaceTransitionEasing}, transform ${notchSurfaceTransitionMs}ms ${notchSurfaceTransitionEasing}, visibility 0s linear ${isSliverVisible || isExpanded ? 0 : notchSurfaceTransitionMs}ms`,
                visibility: isSliverVisible ? 'visible' : 'hidden',
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
            >
              <span
                className={`agent-history-notch-sliver-dots${history.length > SLIVER_MAX_DOTS ? ' agent-history-notch-sliver-dots--overflow' : ''}`}
                style={{
                  filter: isSliverVisible ? 'blur(0px)' : 'blur(4px)',
                  visibility: isSliverVisible ? 'visible' : 'hidden',
                  transition: dotAppearanceTransition
                }}
              >
                {sliverDots.map((dot) => (
                  <span
                    key={dot.id}
                    className={`agent-history-notch-sliver-dot agent-history-notch-sliver-dot--${dot.state}`}
                    aria-label={dot.title}
                    title={dot.title}
                  />
                ))}
              </span>
            </button>
          </div>

          {/* Expanded Content Mask */}
          <div
            className="agent-history-notch-content-mask"
            style={{
              clipPath: sideNotchClipPath,
              WebkitClipPath: sideNotchClipPath,
              transition: silhouetteTransition,
              visibility: isExpanded || !collapseSettled ? 'visible' : 'hidden'
            }}
          >
            <div className="agent-history-notch-content">
              {/* Header */}
              <div className="agent-history-notch-header">
                <div className="agent-history-notch-header-card">
                  <label className="agent-history-notch-search">
                    <SearchIcon className="w-3.5 h-3.5" />
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search"
                      aria-label="Search conversations"
                    />
                  </label>
                  <button
                    type="button"
                    className={`agent-history-notch-lock ${isPinned ? 'agent-history-notch-lock--on' : ''}`}
                    onClick={togglePin}
                    aria-pressed={isPinned}
                    aria-label={isPinned ? 'Unlock the panel' : 'Keep the panel open'}
                    title={
                      isPinned
                        ? 'Locked open — click to unlock'
                        : "Keep open — clicking outside won't close it"
                    }
                  >
                    {isPinned ? <LockIcon size={14} /> : <LockOpenIcon size={14} />}
                  </button>
                </div>
              </div>

              {/* History list */}
              <div className="agent-history-notch-list-shell">
                <div className="agent-history-notch-list">
                  {historyContent}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
export default VoiceOsSidebar
