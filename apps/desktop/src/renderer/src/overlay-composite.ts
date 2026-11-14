import type { ScreenOverlayPoint } from '../../shared/types'

export const OVERLAY_HUE = 214

export function parseImageBlob(source: Uint8Array | ArrayBuffer | string): Blob {
  if (typeof source === 'string') {
    const dataUrlMatch = source.match(/^data:([^;]+);base64,(.+)$/)
    if (dataUrlMatch) {
      const mime = dataUrlMatch[1]
      const binary = atob(dataUrlMatch[2])
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new Blob([bytes as BlobPart], { type: mime })
    }
    const binary = atob(source.includes(',') ? source.split(',')[1] : source)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    return new Blob([bytes as BlobPart], { type: isJpeg ? 'image/jpeg' : 'image/png' })
  }

  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source)
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  return new Blob([bytes as BlobPart], { type: isJpeg ? 'image/jpeg' : 'image/png' })
}

export function canvasToJpeg(
  source: HTMLCanvasElement,
  quality = 0.85
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    source.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not export the annotated screenshot.'))
        }
      },
      'image/jpeg',
      quality
    )
  })
}

export function drawRecordedStroke(
  target: CanvasRenderingContext2D,
  stroke: readonly ScreenOverlayPoint[]
): void {
  if (stroke.length === 0) return

  target.save()

  if (stroke.length === 1) {
    target.fillStyle = `hsl(${OVERLAY_HUE}, 100%, 65%)`
    target.beginPath()
    target.arc(stroke[0].x, stroke[0].y, 7, 0, Math.PI * 2)
    target.fill()
    target.restore()
    return
  }

  target.lineCap = 'round'
  target.lineJoin = 'round'

  function buildPath(): void {
    target.beginPath()
    target.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midX = (stroke[i].x + stroke[i + 1].x) / 2
      const midY = (stroke[i].y + stroke[i + 1].y) / 2
      target.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY)
    }
    target.lineTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y)
  }

  // Outer glow pass
  target.strokeStyle = `hsla(${OVERLAY_HUE}, 100%, 65%, 0.25)`
  target.lineWidth = 18
  buildPath()
  target.stroke()

  // Mid glow pass
  target.strokeStyle = `hsla(${OVERLAY_HUE}, 100%, 65%, 0.45)`
  target.lineWidth = 10
  buildPath()
  target.stroke()

  // Crisp core pass
  target.strokeStyle = `hsl(${OVERLAY_HUE}, 100%, 65%)`
  target.lineWidth = 4
  buildPath()
  target.stroke()

  target.restore()
}

export async function compositeScreenshotWithAnnotations(
  imageInput: Uint8Array | ArrayBuffer | string,
  strokePoints: readonly ScreenOverlayPoint[],
  displayWidth: number,
  displayHeight: number,
  quality = 0.85
): Promise<ArrayBuffer> {
  const blob = parseImageBlob(imageInput)
  const bitmap = await createImageBitmap(blob)
  try {
    const output = document.createElement('canvas')
    output.width = bitmap.width
    output.height = bitmap.height
    const outputContext = output.getContext('2d')
    if (!outputContext) {
      throw new Error('Could not prepare the annotated screenshot.')
    }

    outputContext.drawImage(bitmap, 0, 0)
    outputContext.save()
    outputContext.scale(
      bitmap.width / Math.max(1, displayWidth),
      bitmap.height / Math.max(1, displayHeight)
    )
    drawRecordedStroke(outputContext, strokePoints)
    outputContext.restore()

    const jpegBlob = await canvasToJpeg(output, quality)
    return await jpegBlob.arrayBuffer()
  } finally {
    bitmap.close()
  }
}
