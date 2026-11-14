import { desktopCapturer, screen } from 'electron'
import type { ScreenOverlayPoint } from '../shared/types'
import type { ScreenDisplay } from './screen-service'

/** Keep the captured bitmap bounded on high-DPI or very large displays. */
export const MAX_THUMBNAIL_EDGE = 1_600

export const SCREEN_CAPTURE_MIME_TYPE = 'image/jpeg' as const

export function cursorScreenPoint(): ScreenOverlayPoint {
  const point = screen.getCursorScreenPoint()
  return { x: point.x, y: point.y }
}

export function displayUnderCursor(): ScreenDisplay {
  return toScreenDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
}

export function thumbnailSizeForDisplay(display: ScreenDisplay): {
  width: number
  height: number
} {
  const physicalWidth = Math.max(
    1,
    Math.round(display.size.width * display.scaleFactor)
  )
  const physicalHeight = Math.max(
    1,
    Math.round(display.size.height * display.scaleFactor)
  )
  const longestEdge = Math.max(physicalWidth, physicalHeight)
  if (longestEdge <= MAX_THUMBNAIL_EDGE) {
    return { width: physicalWidth, height: physicalHeight }
  }

  const scale = MAX_THUMBNAIL_EDGE / longestEdge
  return {
    width: Math.max(1, Math.round(physicalWidth * scale)),
    height: Math.max(1, Math.round(physicalHeight * scale))
  }
}

/**
 * Captures one full monitor at its physical resolution. Never captures the
 * transparent overlay: the caller hides it and waits for a clean frame first.
 */
export async function captureDisplay(display: ScreenDisplay): Promise<Uint8Array> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailSizeForDisplay(display)
  })

  const matched = sources.find((source) => source.display_id === String(display.id))
  // Electron can report an empty display_id on some Windows setups. Only then,
  // and only with a single screen source, is the fallback safe.
  const source = matched ?? (sources.length === 1 ? sources[0] : undefined)
  if (!source) {
    throw new Error('Could not find the screen to capture. Try again.')
  }
  if (source.thumbnail.isEmpty()) {
    throw new Error('The screen capture came back empty. Try again.')
  }

  return new Uint8Array(source.thumbnail.toJPEG(85))
}

function toScreenDisplay(display: Electron.Display): ScreenDisplay {
  return {
    id: display.id,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    },
    size: { width: display.size.width, height: display.size.height },
    scaleFactor: display.scaleFactor
  }
}
