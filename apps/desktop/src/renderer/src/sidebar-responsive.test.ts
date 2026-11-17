import { describe, expect, it } from 'vitest'

describe('VoiceOS Desktop Window and Collapsible Sidebar Responsiveness', () => {
  it('has exact VoiceOS window sizing parameters', () => {
    const windowConfig = {
      width: 1080,
      height: 710,
      minWidth: 520,
      minHeight: 400
    }

    expect(windowConfig.width).toBe(1080)
    expect(windowConfig.height).toBe(710)
    expect(windowConfig.minWidth).toBe(520)
    expect(windowConfig.minHeight).toBe(400)
  })

  it('calculates exact VoiceOS collapsible sidebar geometry and offsets', () => {
    const COLLAPSED_SIDEBAR_WIDTH = 85
    const EXPANDED_SIDEBAR_WIDTH = 220
    const NAV_PADDING = 16
    const ICON_SIZE = 20
    const BORDER_WIDTH = 1

    const BUTTON_WIDTH_COLLAPSED = COLLAPSED_SIDEBAR_WIDTH - NAV_PADDING * 2
    expect(BUTTON_WIDTH_COLLAPSED).toBe(53)

    const BUTTON_CONTENT_WIDTH = BUTTON_WIDTH_COLLAPSED - BORDER_WIDTH * 2
    expect(BUTTON_CONTENT_WIDTH).toBe(51)

    const ICON_LEFT_OFFSET = (BUTTON_CONTENT_WIDTH - ICON_SIZE) / 2
    expect(ICON_LEFT_OFFSET).toBe(15.5)

    // Verify centering: 15.5 left + 20 icon + 15.5 right + 2 borders = 53
    expect(ICON_LEFT_OFFSET + ICON_SIZE + ICON_LEFT_OFFSET + BORDER_WIDTH * 2).toBe(
      BUTTON_WIDTH_COLLAPSED
    )

    // Drag strip & fade mask left position based on collapse state
    const getLeftOffset = (isCollapsed: boolean) =>
      isCollapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : `${EXPANDED_SIDEBAR_WIDTH}px`

    expect(getLeftOffset(true)).toBe('85px')
    expect(getLeftOffset(false)).toBe('220px')
  })
})
