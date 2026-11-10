import type {
  ScreenOverlayCompose,
  ScreenOverlayPoint,
  ScreenOverlayStart
} from '../../shared/types'
import './overlay.css'

const GLOW_WIDTH = 14
const CORE_WIDTH = 3.5
const GLOW_COLOR = 'rgba(59, 130, 246, 0.28)'
const MID_COLOR = 'rgba(96, 165, 250, 0.42)'
const CORE_COLOR = '#3b82f6'

const canvasElement = document.getElementById('overlay-canvas')
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error('Overlay canvas was not found.')
}
const canvas: HTMLCanvasElement = canvasElement
const canvasContext = canvas.getContext('2d')
if (!canvasContext) {
  throw new Error('Overlay canvas context was not available.')
}
const context: CanvasRenderingContext2D = canvasContext

let points: ScreenOverlayPoint[] = []
let frameWidth = 1
let frameHeight = 1

function applySize(width: number, height: number): void {
  const pixelRatio = window.devicePixelRatio || 1
  frameWidth = Math.max(1, Math.round(width))
  frameHeight = Math.max(1, Math.round(height))
  canvas.width = Math.max(1, Math.round(frameWidth * pixelRatio))
  canvas.height = Math.max(1, Math.round(frameHeight * pixelRatio))
  canvas.style.width = `${frameWidth}px`
  canvas.style.height = `${frameHeight}px`
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, frameWidth, frameHeight)
}

function strokeLine(
  target: CanvasRenderingContext2D,
  from: ScreenOverlayPoint,
  to: ScreenOverlayPoint
): void {
  target.beginPath()
  target.moveTo(from.x, from.y)
  target.lineTo(to.x, to.y)
  target.stroke()
}

function drawSegment(from: ScreenOverlayPoint, to: ScreenOverlayPoint): void {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  context.strokeStyle = GLOW_COLOR
  context.lineWidth = GLOW_WIDTH
  strokeLine(context, from, to)

  context.strokeStyle = MID_COLOR
  context.lineWidth = GLOW_WIDTH / 2
  strokeLine(context, from, to)

  context.strokeStyle = CORE_COLOR
  context.lineWidth = CORE_WIDTH
  strokeLine(context, from, to)
  context.restore()
}

function drawTrail(
  target: CanvasRenderingContext2D,
  trail: readonly ScreenOverlayPoint[]
): void {
  if (trail.length < 2) return

  target.save()
  target.lineCap = 'round'
  target.lineJoin = 'round'

  const passes: Array<{ color: string; width: number }> = [
    { color: GLOW_COLOR, width: GLOW_WIDTH },
    { color: MID_COLOR, width: GLOW_WIDTH / 2 },
    { color: CORE_COLOR, width: CORE_WIDTH }
  ]

  for (const pass of passes) {
    target.strokeStyle = pass.color
    target.lineWidth = pass.width
    target.beginPath()
    target.moveTo(trail[0].x, trail[0].y)
    for (let index = 1; index < trail.length; index += 1) {
      target.lineTo(trail[index].x, trail[index].y)
    }
    target.stroke()
  }
  target.restore()
}

function handleStart(payload: ScreenOverlayStart): void {
  points = []
  // The main process computes trail points against the locked display bounds,
  // so use those exact dimensions rather than a possibly rounded viewport.
  applySize(payload.width, payload.height)
}

function handlePoint(point: ScreenOverlayPoint): void {
  const previous = points.at(-1)
  const next = { x: point.x, y: point.y }
  points.push(next)
  if (previous) drawSegment(previous, next)
}

function handleFinish(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.kestrelOverlay.acknowledgeFinish())
  })
}

function handleCancel(): void {
  points = []
  context.clearRect(0, 0, frameWidth, frameHeight)
}

function canvasToPng(source: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    source.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Could not export the annotated screenshot.'))
      }
    }, 'image/png')
  })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleCompose(payload: ScreenOverlayCompose): Promise<void> {
  try {
    const png = new Uint8Array(payload.image)
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }))
    try {
      // The clean screenshot is at physical resolution; the stored trail is in
      // CSS pixels. Draw at natural size and scale the trail to match exactly.
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
        bitmap.width / Math.max(1, frameWidth),
        bitmap.height / Math.max(1, frameHeight)
      )
      drawTrail(outputContext, points)
      outputContext.restore()

      const blob = await canvasToPng(output)
      const buffer = await blob.arrayBuffer()
      window.kestrelOverlay.sendComposed(buffer)
    } finally {
      bitmap.close()
    }
  } catch (error) {
    window.kestrelOverlay.sendComposeError(describeError(error))
  }
}

window.kestrelOverlay.onStart(handleStart)
window.kestrelOverlay.onPoint(handlePoint)
window.kestrelOverlay.onFinish(handleFinish)
window.kestrelOverlay.onCancel(handleCancel)
window.kestrelOverlay.onCompose((payload) => {
  void handleCompose(payload)
})
window.kestrelOverlay.notifyReady()