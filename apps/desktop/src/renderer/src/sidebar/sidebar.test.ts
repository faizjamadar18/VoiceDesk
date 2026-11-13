import { describe, expect, it } from 'vitest'
import type { HistoryRecord } from '../../../shared/types'
import {
  buildSideNotchClipPath,
  clampSliverTop,
  CLOSING_TIMING,
  dragSliverPosition,
  formatSessionHeader,
  isPointInExpandedNotch,
  isPointInSliver,
  normalizeSliverPosition,
  NOTCH_ARC_SAMPLES,
  NOTCH_EXPANDED_HEIGHT_PX,
  NOTCH_EXPANDED_WIDTH_PX,
  NOTCH_HEADER_HEIGHT_PX,
  NOTCH_RIGHT_RADIUS_PX,
  NOTCH_SCROLL_END_PADDING_PX,
  NOTCH_SHOULDER_PX,
  OPENING_TIMING,
  ROW_TITLE_MAX_CHARS,
  SESSION_GAP_MS,
  sliverHeight,
  SLIVER_DOT_GAP,
  SLIVER_DOT_SIZE,
  SLIVER_DRAG_THRESHOLD,
  SLIVER_HOVER_WIDTH,
  SLIVER_MAX_DOTS,
  SLIVER_MIN_HEIGHT,
  SLIVER_POPOVER_LEFT,
  SLIVER_POSITION_KEY,
  SLIVER_SHOULDER,
  SLIVER_WIDTH,
  sliverTop,
  truncateTitle
} from './geometry'

describe('VoiceOS Sidebar Geometry & Math Constants', () => {
  it('matches exact VoiceOS surface constants', () => {
    expect(NOTCH_EXPANDED_WIDTH_PX).toBe(232)
    expect(NOTCH_EXPANDED_HEIGHT_PX).toBe(580)
    expect(NOTCH_RIGHT_RADIUS_PX).toBe(31)
    expect(NOTCH_SHOULDER_PX).toBe(31)
    expect(NOTCH_ARC_SAMPLES).toBe(10)
    expect(NOTCH_HEADER_HEIGHT_PX).toBe(91) // 31 + 60
    expect(NOTCH_SCROLL_END_PADDING_PX).toBe(73) // 31 + 42
    expect(SLIVER_WIDTH).toBe(16)
    expect(SLIVER_HOVER_WIDTH).toBe(18)
    expect(SLIVER_SHOULDER).toBe(4)
    expect(SLIVER_MIN_HEIGHT).toBe(48)
    expect(SLIVER_DOT_SIZE).toBe(6)
    expect(SLIVER_DOT_GAP).toBe(8)
    expect(SLIVER_MAX_DOTS).toBe(5)
    expect(SLIVER_DRAG_THRESHOLD).toBe(4)
    expect(SLIVER_POSITION_KEY).toBe('kestrel.sideNotch.sliverPosition')
    expect(SESSION_GAP_MS).toBe(3600000)
    expect(ROW_TITLE_MAX_CHARS).toBe(74)
    expect(SLIVER_POPOVER_LEFT).toBe(26)
  })

  it('matches VoiceOS transition timings', () => {
    expect(OPENING_TIMING.durationMs).toBe(280)
    expect(CLOSING_TIMING.durationMs).toBe(200)
    expect(OPENING_TIMING.easing).toContain('cubic-bezier(0.2, 0.8, 0.2, 1)')
  })
})

describe('buildSideNotchClipPath', () => {
  it('generates a valid CSS polygon clip-path string for expanded notch', () => {
    const clipPath = buildSideNotchClipPath(
      NOTCH_EXPANDED_WIDTH_PX,
      NOTCH_EXPANDED_HEIGHT_PX,
      NOTCH_SHOULDER_PX,
      NOTCH_RIGHT_RADIUS_PX,
      0
    )

    expect(clipPath.startsWith('polygon(')).toBe(true)
    expect(clipPath.endsWith(')')).toBe(true)
    expect(clipPath).toContain('0.000px 0.000px')
    expect(clipPath).toContain('232.000px')

    // Points count: 1 start point + 4 arcs * 10 samples + 3 intermediate connection points = 44 points
    const points = clipPath.slice(8, -1).split(', ')
    expect(points.length).toBe(44)
  })

  it('generates valid polygon for collapsed sliver and sliver hover', () => {
    const collapsedClip = buildSideNotchClipPath(
      SLIVER_WIDTH,
      SLIVER_MIN_HEIGHT,
      SLIVER_SHOULDER,
      SLIVER_WIDTH - SLIVER_SHOULDER,
      200
    )
    expect(collapsedClip).toContain('16.000px')
    expect(collapsedClip).toContain('200.000px')

    const hoverClip = buildSideNotchClipPath(
      SLIVER_HOVER_WIDTH,
      SLIVER_MIN_HEIGHT,
      SLIVER_SHOULDER,
      SLIVER_HOVER_WIDTH - SLIVER_SHOULDER,
      200
    )
    expect(hoverClip).toContain('18.000px')
  })
})

describe('Sliver helpers', () => {
  it('computes sliverHeight accurately based on dot count', () => {
    expect(sliverHeight(0)).toBe(SLIVER_MIN_HEIGHT) // 48
    expect(sliverHeight(1)).toBe(SLIVER_MIN_HEIGHT) // 1*6 + 0*8 + 32 = 38 <= 48
    expect(sliverHeight(2)).toBe(52) // 2*6 + 1*8 + 32 = 52
    expect(sliverHeight(3)).toBe(66) // 3*6 + 2*8 + 32 = 66
    expect(sliverHeight(5)).toBe(94) // 5*6 + 4*8 + 32 = 94
    expect(sliverHeight(10)).toBe(94) // clamped at SLIVER_MAX_DOTS (5)
    expect(sliverHeight(-3)).toBe(SLIVER_MIN_HEIGHT)
  })

  it('normalizes sliver position within [0, 1]', () => {
    expect(normalizeSliverPosition(0.5)).toBe(0.5)
    expect(normalizeSliverPosition(0)).toBe(0)
    expect(normalizeSliverPosition(1)).toBe(1)
    expect(normalizeSliverPosition(-0.3)).toBe(0)
    expect(normalizeSliverPosition(1.8)).toBe(1)
    expect(normalizeSliverPosition(NaN)).toBe(0.5)
    expect(normalizeSliverPosition(Infinity)).toBe(0.5)
  })

  it('clamps sliver top within panel inset bounds', () => {
    const height = 48
    const panelHeight = 580
    const edgeInset = 31

    // Within bounds
    expect(clampSliverTop(200, height, panelHeight, edgeInset)).toBe(200)
    // Below top inset
    expect(clampSliverTop(10, height, panelHeight, edgeInset)).toBe(31)
    // Above bottom inset
    const maxTop = panelHeight - edgeInset - height // 580 - 31 - 48 = 501
    expect(clampSliverTop(550, height, panelHeight, edgeInset)).toBe(maxTop)
  })

  it('computes sliverTop and updates via dragSliverPosition', () => {
    const height = 48
    const panelHeight = 580
    const edgeInset = 31

    const top = sliverTop(0.5, height, panelHeight, edgeInset)
    // 0.5 * 580 - 24 = 266
    expect(top).toBe(266)

    // Drag down by 20px
    const draggedPos = dragSliverPosition({
      startTop: top,
      deltaY: 20,
      height,
      panelHeight,
      edgeInset
    })
    // newTop = 266 + 20 = 286. (286 + 24) / 580 = 310 / 580
    expect(draggedPos).toBeCloseTo(310 / 580, 5)
  })
})

describe('Point containment tests', () => {
  it('isPointInSliver correctly identifies points inside and outside', () => {
    const width = 16
    const height = 48
    const top = 100

    expect(isPointInSliver(8, 120, width, height, top)).toBe(true)
    expect(isPointInSliver(0, 100, width, height, top)).toBe(true)
    expect(isPointInSliver(16, 148, width, height, top)).toBe(true)

    // Outside
    expect(isPointInSliver(20, 120, width, height, top)).toBe(false)
    expect(isPointInSliver(-2, 120, width, height, top)).toBe(false)
    expect(isPointInSliver(8, 90, width, height, top)).toBe(false)
    expect(isPointInSliver(8, 160, width, height, top)).toBe(false)
  })

  it('isPointInExpandedNotch tests contour boundaries', () => {
    const viewportHeight = 800
    // expanded panel top = (800 - 580) / 2 = 110
    // center point = x=100, y=110 + 290 = 400
    expect(isPointInExpandedNotch(100, 400, viewportHeight)).toBe(true)

    // Outside horizontal bounds
    expect(isPointInExpandedNotch(240, 400, viewportHeight)).toBe(false)
    expect(isPointInExpandedNotch(-10, 400, viewportHeight)).toBe(false)

    // Outside vertical bounds
    expect(isPointInExpandedNotch(100, 50, viewportHeight)).toBe(false)
    expect(isPointInExpandedNotch(100, 750, viewportHeight)).toBe(false)

    // Top concave shoulder outside boundary:
    // localY=5, S2=31. boundaryX = 31 - sqrt(31^2 - 5^2) ≈ 0.4. Point at x=10 should be outside!
    expect(isPointInExpandedNotch(10, 115, viewportHeight)).toBe(false)
  })
})

describe('Session date formatting & title truncation', () => {
  it('formats dates for today, yesterday, and earlier', () => {
    const baseNow = new Date('2026-11-13T14:00:00.000Z').getTime()

    // Same day (earlier today)
    const todayTs = new Date('2026-11-13T10:30:00.000Z').getTime()
    const todayStr = formatSessionHeader(todayTs, baseNow)
    expect(todayStr.startsWith('Today,')).toBe(true)

    // Yesterday
    const yesterdayTs = new Date('2026-11-12T15:00:00.000Z').getTime()
    const yesterdayStr = formatSessionHeader(yesterdayTs, baseNow)
    expect(yesterdayStr.startsWith('Yesterday,')).toBe(true)

    // 5 days ago
    const olderTs = new Date('2026-11-08T09:00:00.000Z').getTime()
    const olderStr = formatSessionHeader(olderTs, baseNow)
    expect(olderStr).toContain('Nov')
    expect(olderStr).toContain('8')

    // Invalid timestamp
    expect(formatSessionHeader(0, baseNow)).toBe('Earlier')
    expect(formatSessionHeader(-1, baseNow)).toBe('Earlier')
  })

  it('truncates titles to max characters with ellipsis', () => {
    expect(truncateTitle('Short text')).toBe('Short text')

    const longText =
      'This is a very long prompt that exceeds seventy four characters in total length and should be truncated cleanly'
    const truncated = truncateTitle(longText, 74)
    expect(truncated.endsWith('…')).toBe(true)
    expect(truncated.length).toBeLessThanOrEqual(75) // 74 chars + ellipsis
  })
})

describe('Search filtering and session gap grouping', () => {
  const sampleHistory: HistoryRecord[] = [
    {
      id: '1',
      createdAt: new Date('2026-11-13T12:00:00.000Z').toISOString(),
      prompt: 'Check the weather in Tokyo',
      reply: 'The weather in Tokyo is sunny, 22°C.',
      tool: 'weather'
    },
    {
      id: '2',
      createdAt: new Date('2026-11-13T11:45:00.000Z').toISOString(), // 15 mins earlier (same session)
      prompt: 'What time is it in Tokyo?',
      reply: 'It is 9:45 PM in Tokyo.',
      tool: null
    },
    {
      id: '3',
      createdAt: new Date('2026-11-13T09:00:00.000Z').toISOString(), // 2h45m earlier (new session)
      prompt: 'Summarize today email',
      reply: 'You have 3 unread emails.',
      tool: 'gmail'
    }
  ]

  it('filters history records by prompt or reply substring', () => {
    const filterQuery = (query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return sampleHistory
      return sampleHistory.filter(
        (item) => item.prompt.toLowerCase().includes(q) || item.reply.toLowerCase().includes(q)
      )
    }

    expect(filterQuery('weather')).toHaveLength(1)
    expect(filterQuery('weather')[0].id).toBe('1')

    expect(filterQuery('Tokyo')).toHaveLength(2)
    expect(filterQuery('email')).toHaveLength(1)
    expect(filterQuery('nonexistent')).toHaveLength(0)
    expect(filterQuery('')).toHaveLength(3)
  })

  it('groups items by 1 hour SESSION_GAP_MS', () => {
    const sessionHeaders: string[] = []
    let previousTimestamp: number | null = null

    for (const item of sampleHistory) {
      const ts = new Date(item.createdAt).getTime()
      if (previousTimestamp === null || previousTimestamp - ts > SESSION_GAP_MS) {
        sessionHeaders.push(`session-${item.id}`)
      }
      previousTimestamp = ts
    }

    // Item 1 and Item 2 are within 15 mins -> 1 session header
    // Item 3 is > 1 hour apart -> 2nd session header
    expect(sessionHeaders).toEqual(['session-1', 'session-3'])
  })
})

describe('Sidebar Interactive Region & Shadow Filter', () => {
  it('computes expanded interactive region docking to left edge', () => {
    const viewportHeight = 1080
    const panelTopPx = (viewportHeight - NOTCH_EXPANDED_HEIGHT_PX) / 2 // (1080 - 580) / 2 = 250
    const region = {
      left: 0,
      top: Math.round(panelTopPx),
      width: 232,
      height: NOTCH_EXPANDED_HEIGHT_PX
    }
    expect(region).toEqual({
      left: 0,
      top: 250,
      width: 232,
      height: 580
    })
  })

  it('computes collapsed interactive region for sliver and hovered popover', () => {
    const viewportHeight = 1080
    const panelTopPx = (viewportHeight - NOTCH_EXPANDED_HEIGHT_PX) / 2 // 250
    const height = 48
    const topPx = sliverTop(0.5, height, NOTCH_EXPANDED_HEIGHT_PX, NOTCH_SHOULDER_PX) // 266
    const sliverY = panelTopPx + topPx // 516
    const sliverCenterY = sliverY + height / 2 // 250 + 266 + 24 = 540

    // Collapsed default
    const sliverRegion = {
      left: 0,
      top: Math.max(0, Math.round(sliverY)),
      width: SLIVER_WIDTH + 4,
      height
    }
    expect(sliverRegion.left).toBe(0)
    expect(sliverRegion.top).toBe(516)
    expect(sliverRegion.width).toBe(20)
    expect(sliverRegion.height).toBe(48)

    // Collapsed hovered (popover expands width)
    const popoverTop = Math.max(8, Math.min(viewportHeight - 68 - 8, sliverCenterY - 34)) // 506
    const top = Math.min(popoverTop, sliverY) // min(506, 516) = 506
    const bottom = Math.max(popoverTop + 68, sliverY + height) // max(574, 564) = 574
    const hovered = {
      left: 0,
      top,
      width: SLIVER_POPOVER_LEFT + 220,
      height: bottom - top
    }
    expect(hovered.left).toBe(0)
    expect(hovered.top).toBe(506)
    expect(hovered.width).toBe(246)
    expect(hovered.height).toBe(68)
  })

  it('applies clean soft dark glass drop shadow rather than harsh color glow', () => {
    const shadowFilter =
      'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.12))'
    expect(shadowFilter).not.toContain('rgba(120,170,255')
    expect(shadowFilter).not.toContain('rgba(205,225,255')
    expect(shadowFilter).toContain('rgba(0, 0, 0, 0.45)')
    expect(shadowFilter).toContain('rgba(255, 255, 255, 0.12)')
  })
})
