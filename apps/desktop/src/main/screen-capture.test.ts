import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScreenDisplay } from './screen-service'

const mocks = vi.hoisted(() => ({
  toJPEG: vi.fn().mockReturnValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
  toPNG: vi.fn().mockReturnValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
}))

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn().mockResolvedValue([
      {
        id: 'screen:1:0',
        display_id: '1',
        name: 'Screen 1',
        thumbnail: {
          isEmpty: () => false,
          toJPEG: mocks.toJPEG,
          toPNG: mocks.toPNG
        }
      }
    ])
  },
  screen: {
    getCursorScreenPoint: () => ({ x: 100, y: 200 }),
    getDisplayNearestPoint: () => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1
    })
  }
}))

import {
  MAX_THUMBNAIL_EDGE,
  SCREEN_CAPTURE_MIME_TYPE,
  captureDisplay,
  thumbnailSizeForDisplay
} from './screen-capture'

describe('screen-capture', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('bounds thumbnail edge to 1600', () => {
    expect(MAX_THUMBNAIL_EDGE).toBe(1_600)
    expect(SCREEN_CAPTURE_MIME_TYPE).toBe('image/jpeg')

    const display4k: ScreenDisplay = {
      id: 1,
      bounds: { x: 0, y: 0, width: 3840, height: 2160 },
      size: { width: 3840, height: 2160 },
      scaleFactor: 1
    }
    const size = thumbnailSizeForDisplay(display4k)
    expect(size.width).toBe(1_600)
    expect(size.height).toBe(900)
  })

  it('captures display as JPEG with quality 85', async () => {
    const display: ScreenDisplay = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1
    }

    const bytes = await captureDisplay(display)

    expect(mocks.toJPEG).toHaveBeenCalledWith(85)
    expect(mocks.toPNG).not.toHaveBeenCalled()
    expect(bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))
  })
})
