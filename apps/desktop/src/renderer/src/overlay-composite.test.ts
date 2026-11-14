import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compositeScreenshotWithAnnotations,
  parseImageBlob
} from './overlay-composite'

describe('parseImageBlob', () => {
  it('parses data:image/jpeg data URL', () => {
    const raw = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0))
    const blob = parseImageBlob(`data:image/jpeg;base64,${raw}`)
    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBe(4)
  })

  it('parses data:image/png data URL', () => {
    const raw = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47))
    const blob = parseImageBlob(`data:image/png;base64,${raw}`)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(4)
  })

  it('parses raw Uint8Array with JPEG signature', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const blob = parseImageBlob(bytes)
    expect(blob.type).toBe('image/jpeg')
  })

  it('parses raw Uint8Array with PNG signature', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const blob = parseImageBlob(bytes)
    expect(blob.type).toBe('image/png')
  })
})

describe('compositeScreenshotWithAnnotations', () => {
  const originalCreateElement = globalThis.document?.createElement
  const originalCreateImageBitmap = globalThis.createImageBitmap

  afterEach(() => {
    if (originalCreateElement && globalThis.document) {
      globalThis.document.createElement = originalCreateElement
    }
    if (originalCreateImageBitmap) {
      globalThis.createImageBitmap = originalCreateImageBitmap
    }
    vi.restoreAllMocks()
  })

  it('encodes to image/jpeg with quality 0.85 and returns array buffer', async () => {
    const closeBitmap = vi.fn()
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      close: closeBitmap
    })

    const ctx = {
      drawImage: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn()
    }

    let exportedMimeType = ''
    let exportedQuality = 0

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(ctx),
      toBlob: vi.fn(
        (cb: (blob: Blob | null) => void, mimeType: string, quality: number) => {
          exportedMimeType = mimeType
          exportedQuality = quality
          cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: mimeType }))
        }
      )
    }

    if (!globalThis.document) {
      // @ts-expect-error mock document for test
      globalThis.document = {}
    }
    globalThis.document.createElement = vi.fn().mockReturnValue(mockCanvas)

    const rawJpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0))
    const result = await compositeScreenshotWithAnnotations(
      `data:image/jpeg;base64,${rawJpeg}`,
      [{ x: 10, y: 10 }, { x: 20, y: 20 }],
      1920,
      1080
    )

    expect(exportedMimeType).toBe('image/jpeg')
    expect(exportedQuality).toBe(0.85)
    expect(closeBitmap).toHaveBeenCalled()
    expect(new Uint8Array(result)).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
  })
})
