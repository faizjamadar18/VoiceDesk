import type {
  ScreenOverlayCompose,
  ScreenOverlayPoint,
  ScreenOverlayStart
} from '../../shared/types'
import {
  compositeScreenshotWithAnnotations,
  canvasToJpeg,
  drawRecordedStroke,
  parseImageBlob
} from './overlay-composite'
import './overlay.css'

const TAG_FADE_TRAVEL = 220
const TAG_OFFSET_X = 18
const TAG_OFFSET_Y = 20
const TRAIL_LIFE_MS = 360
const HUE = 214

interface TrailPoint {
  x: number
  y: number
  t: number
}

interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

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

const tagElement = document.getElementById('tag')
const tagLabel = document.getElementById('tag-label')

let recordedPoints: ScreenOverlayPoint[] = []
let trailPoints: TrailPoint[] = []
let frameWidth = 1
let frameHeight = 1
let tagTravel = 0
let tagLast: ScreenOverlayPoint | null = null
let tagDone = false
let prevBox: BoundingBox | null = null
let animationFrameId: number | null = null

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

function placeTag(x: number, y: number): void {
  if (!tagElement) return
  const width = tagElement.offsetWidth || 140
  const height = tagElement.offsetHeight || 26
  const left =
    x + TAG_OFFSET_X + width > frameWidth - 8 ? x - width - 14 : x + TAG_OFFSET_X
  const top =
    y + TAG_OFFSET_Y + height > frameHeight - 8 ? y - height - 14 : y + TAG_OFFSET_Y
  tagElement.style.left = `${left}px`
  tagElement.style.top = `${top}px`
}

function moveTag(x: number, y: number): void {
  if (tagDone || !tagElement) return
  if (tagLast) {
    tagTravel += Math.hypot(x - tagLast.x, y - tagLast.y)
  }
  tagLast = { x, y }
  if (tagTravel > TAG_FADE_TRAVEL) {
    tagDone = true
    tagElement.style.opacity = '0'
    tagElement.classList.remove('show')
    return
  }
  placeTag(x, y)
  tagElement.classList.remove('hidden')
  tagElement.classList.add('show')
  tagElement.style.opacity = '1'
}

function hideTagImmediately(): void {
  tagDone = true
  if (tagElement) {
    tagElement.style.transition = 'none'
    tagElement.style.animation = 'none'
    tagElement.style.opacity = '0'
    tagElement.classList.add('hidden')
    tagElement.classList.remove('show')
  }
}

function paintPointingTrail(): void {
  if (prevBox) {
    const pad = 14
    context.clearRect(
      prevBox.minX - pad,
      prevBox.minY - pad,
      prevBox.maxX - prevBox.minX + pad * 2,
      prevBox.maxY - prevBox.minY + pad * 2
    )
    prevBox = null
  }

  const now = performance.now()
  while (trailPoints.length > 0 && now - trailPoints[0].t > TRAIL_LIFE_MS) {
    trailPoints.shift()
  }

  if (trailPoints.length === 0) {
    return
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of trailPoints) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  if (trailPoints.length >= 2) {
    const tail = trailPoints[0]
    const head = trailPoints[trailPoints.length - 1]

    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'

    context.beginPath()
    context.moveTo(trailPoints[0].x, trailPoints[0].y)
    for (let i = 1; i < trailPoints.length - 1; i += 1) {
      const midX = (trailPoints[i].x + trailPoints[i + 1].x) / 2
      const midY = (trailPoints[i].y + trailPoints[i + 1].y) / 2
      context.quadraticCurveTo(trailPoints[i].x, trailPoints[i].y, midX, midY)
    }
    context.lineTo(head.x, head.y)

    const dx = head.x - tail.x
    const dy = head.y - tail.y
    let grad: string | CanvasGradient
    if (dx === 0 && dy === 0) {
      grad = `hsl(${HUE}, 100%, 65%)`
    } else {
      const linear = context.createLinearGradient(tail.x, tail.y, head.x, head.y)
      linear.addColorStop(0, `hsla(${HUE}, 100%, 65%, 0)`)
      linear.addColorStop(1, `hsla(${HUE}, 100%, 65%, 1)`)
      grad = linear
    }

    context.strokeStyle = grad

    // Outer glow pass
    context.lineWidth = 20
    context.globalAlpha = 0.14
    context.stroke()

    // Crisp core pass
    context.lineWidth = 8
    context.globalAlpha = 0.55
    context.stroke()

    context.restore()

    prevBox = { minX, minY, maxX, maxY }
  } else {
    // 1 point: glowing pulse circle (radius: 7)
    const p = trailPoints[0]
    const age = now - p.t
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE_MS)

    context.save()

    // Outer glow pass
    context.globalAlpha = 0.14 * alpha
    context.fillStyle = `hsl(${HUE}, 100%, 65%)`
    context.beginPath()
    context.arc(p.x, p.y, 14, 0, Math.PI * 2)
    context.fill()

    // Crisp core pass
    context.globalAlpha = 0.55 * alpha
    context.beginPath()
    context.arc(p.x, p.y, 7, 0, Math.PI * 2)
    context.fill()

    context.restore()

    prevBox = {
      minX: p.x - 14,
      minY: p.y - 14,
      maxX: p.x + 14,
      maxY: p.y + 14
    }
  }
}

function animationLoop(): void {
  animationFrameId = null
  paintPointingTrail()
  if (trailPoints.length > 0) {
    animationFrameId = window.requestAnimationFrame(animationLoop)
  }
}

function startAnimationLoop(): void {
  if (animationFrameId !== null) return
  animationFrameId = window.requestAnimationFrame(animationLoop)
}


function handleStart(payload: ScreenOverlayStart): void {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  recordedPoints = []
  trailPoints = []
  tagTravel = 0
  tagDone = false
  prevBox = null

  applySize(payload.width, payload.height)

  if (tagElement) {
    tagElement.style.transition = ''
    tagElement.style.animation = ''
  }

  if (payload.tagText && tagLabel) {
    tagLabel.textContent = payload.tagText
  }

  if (payload.cursor) {
    tagLast = { x: payload.cursor.x, y: payload.cursor.y }
    if (tagElement) {
      tagElement.classList.remove('hidden')
      placeTag(payload.cursor.x, payload.cursor.y)
      tagElement.style.opacity = '1'
      tagElement.classList.add('show')
    }
  } else {
    tagLast = null
    if (tagElement) {
      tagElement.classList.add('hidden')
      tagElement.classList.remove('show')
      tagElement.style.opacity = '0'
    }
  }
}

function handlePoint(point: ScreenOverlayPoint): void {
  const next = { x: point.x, y: point.y }
  recordedPoints.push(next)
  trailPoints.push({ x: next.x, y: next.y, t: performance.now() })
  moveTag(next.x, next.y)
  startAnimationLoop()
}

function handleFinish(): void {
  hideTagImmediately()
  window.kestrelOverlay.acknowledgeFinish()
}

function handleCancel(): void {
  hideTagImmediately()
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  recordedPoints = []
  trailPoints = []
  prevBox = null
  context.clearRect(0, 0, frameWidth, frameHeight)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleCompose(payload: ScreenOverlayCompose): Promise<void> {
  hideTagImmediately()
  try {
    const buffer = await compositeScreenshotWithAnnotations(
      payload.image,
      recordedPoints,
      frameWidth,
      frameHeight,
      0.85
    )
    window.kestrelOverlay.sendComposed(buffer)
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

export {
  compositeScreenshotWithAnnotations,
  parseImageBlob,
  canvasToJpeg,
  drawRecordedStroke
}
