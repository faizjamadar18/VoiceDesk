import { useEffect, useRef, useState } from 'react'
import type { VoiceTypeData, VoiceTypeStat } from './types'

export interface VoiceTypeModalProps {
  isOpen: boolean
  onClose: () => void
  data?: VoiceTypeData
}

const DEFAULT_VOICE_TYPE_DATA: VoiceTypeData = {
  brand: 'VoiceOS.com',
  kicker: 'YOUR VOICE TYPE',
  typeName: 'The Agent Commander',
  stats: [
    { value: '2,717', label: 'Words dictated' },
    { value: '1h 39m', label: 'Time saved' },
    { value: '151', label: 'Agent tasks' }
  ]
}

const SHARE_CARD_WIDTH = 440
const SHARE_CARD_HEIGHT = 286
const CARD_RADIUS = 24
const PADDING = 28
const CARD_SEED = 20260801
const INK = 'rgba(255, 255, 255, 0.96)'
const INK_FAINT = 'rgba(255, 255, 255, 0.78)'
const GLOW_X = 356
const GLOW_Y = 150
const MARK_WIDTH = 244
const MARK_RIGHT = 424
const MARK_CENTRE_Y = 158
const MARK_LINE_WIDTH = 2.1
const MARK_CIRCLE_X = 17.2
const MARK_CIRCLE_R = 4.5
const MARK_BOX = {
  left: 1.5,
  right: MARK_CIRCLE_X + MARK_CIRCLE_R,
  top: 7.5,
  bottom: 16.5
}

function traceCardOutline(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const scale = width / SHARE_CARD_WIDTH
  const radius = CARD_RADIUS * scale
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(width - radius, 0)
  ctx.quadraticCurveTo(width, 0, width, radius)
  ctx.lineTo(width, height - radius)
  ctx.quadraticCurveTo(width, height, width - radius, height)
  ctx.lineTo(radius, height)
  ctx.quadraticCurveTo(0, height, 0, height - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
}

function traceLogoMark(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(2.7, 7.5)
  ctx.lineTo(10.7, 7.5)
  ctx.quadraticCurveTo(11.9, 7.5, 11.3, 8.54)
  ctx.lineTo(7.3, 15.46)
  ctx.quadraticCurveTo(6.7, 16.5, 6.1, 15.46)
  ctx.lineTo(2.1, 8.54)
  ctx.quadraticCurveTo(1.5, 7.5, 2.7, 7.5)
  ctx.closePath()
  ctx.moveTo(MARK_CIRCLE_X + MARK_CIRCLE_R, 12)
  ctx.arc(MARK_CIRCLE_X, 12, MARK_CIRCLE_R, 0, Math.PI * 2)
}

function renderMarkLayer(width: number, height: number, opacity: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.beginPath()
  traceCardOutline(ctx, width, height)
  ctx.clip()

  const ratio = width / SHARE_CARD_WIDTH
  const scale = (MARK_WIDTH / (MARK_BOX.right - MARK_BOX.left)) * ratio
  ctx.translate(
    (MARK_RIGHT - MARK_WIDTH) * ratio - MARK_BOX.left * scale,
    MARK_CENTRE_Y * ratio - ((MARK_BOX.top + MARK_BOX.bottom) / 2) * scale
  )
  ctx.scale(scale, scale)
  traceLogoMark(ctx)
  ctx.lineWidth = (MARK_LINE_WIDTH * ratio) / scale
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
  ctx.stroke()
  return canvas
}

function paintBackground(ctx: CanvasRenderingContext2D) {
  const width = SHARE_CARD_WIDTH
  const height = SHARE_CARD_HEIGHT

  const base = ctx.createLinearGradient(0, height * -0.06, width * 0.24, height)
  base.addColorStop(0, '#f9fcff')
  base.addColorStop(0.18, '#eef6fe')
  base.addColorStop(0.46, '#96c0ee')
  base.addColorStop(0.68, '#3f7ed8')
  base.addColorStop(1, '#1f4bb8')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  const blooms = [
    { x: 0.16, y: -0.1, radius: 0.86, squash: 0.44, color: [252, 254, 255], alpha: 1 },
    { x: 0.8, y: -0.12, radius: 0.76, squash: 0.52, color: [250, 253, 255], alpha: 0.98 },
    { x: 1.06, y: 0.56, radius: 0.48, color: [43, 112, 228], alpha: 0.55 },
    { x: 0.02, y: 1.08, radius: 0.6, color: [16, 40, 128], alpha: 0.72 },
    { x: 1, y: 1.1, radius: 0.48, color: [18, 46, 140], alpha: 0.55 },
    { x: 0.05, y: 0.52, radius: 0.4, color: [116, 142, 208], alpha: 0.26 }
  ]

  for (const bloom of blooms) {
    const radius = bloom.radius * width
    const squash = (bloom as { squash?: number }).squash ?? 1
    const [red, green, blue] = bloom.color
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${bloom.alpha})`)
    gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`)
    ctx.save()
    ctx.translate(bloom.x * width, bloom.y * height)
    ctx.scale(1, squash)
    ctx.fillStyle = gradient
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
    ctx.restore()
  }

  const halo = ctx.createRadialGradient(GLOW_X, GLOW_Y, 0, GLOW_X, GLOW_Y, 170)
  halo.addColorStop(0, 'rgba(226, 240, 255, 0.16)')
  halo.addColorStop(1, 'rgba(226, 240, 255, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, width, height)

  const heart = ctx.createRadialGradient(GLOW_X, GLOW_Y, 0, GLOW_X, GLOW_Y, 34)
  heart.addColorStop(0, 'rgba(240, 248, 255, 0.12)')
  heart.addColorStop(1, 'rgba(240, 248, 255, 0)')
  ctx.fillStyle = heart
  ctx.fillRect(0, 0, width, height)
}

function hashSeed(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function paintGrain(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number) {
  const image = ctx.createImageData(width, height)
  const pixels = image.data
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const level = Math.round(hashSeed(CARD_SEED, x, y) * 255)
      const alpha = Math.round(intensity * 255)
      for (let dy = 0; dy < 2 && y + dy < height; dy++) {
        for (let dx = 0; dx < 2 && x + dx < width; dx++) {
          const offset = ((y + dy) * width + (x + dx)) * 4
          pixels[offset] = level
          pixels[offset + 1] = level
          pixels[offset + 2] = level
          pixels[offset + 3] = alpha
        }
      }
    }
  }
  const scratch = document.createElement('canvas')
  scratch.width = width
  scratch.height = height
  const scratchCtx = scratch.getContext('2d')
  if (!scratchCtx) return
  scratchCtx.putImageData(image, 0, 0)
  const prevOp = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'overlay'
  ctx.drawImage(scratch, 0, 0)
  ctx.globalCompositeOperation = prevOp
}

function paintBrand(ctx: CanvasRenderingContext2D, brand: string) {
  const baseline = 52
  const size = 17
  const stamp = ctx.createLinearGradient(0, baseline - size * 0.72, 0, baseline)
  stamp.addColorStop(0, 'rgb(90, 90, 90)')
  stamp.addColorStop(0.55, 'rgb(38, 38, 38)')
  stamp.addColorStop(1, 'rgb(10, 10, 10)')
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.fillStyle = stamp
  const text = brand.endsWith('.com') ? brand : `${brand}.com`
  ctx.fillText(text, PADDING, baseline)
  ctx.restore()
}

function traceCapsule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const radius = height / 2
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x + radius, y + height)
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
}

function paintKicker(ctx: CanvasRenderingContext2D, kicker: string) {
  const text = kicker.toUpperCase()
  const size = 10
  const baseline = 108
  const height = 22
  const top = baseline - 15
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const textWidth = ctx.measureText(text).width
  const width = textWidth + 24
  const body = ctx.createLinearGradient(0, top, 0, top + height)
  body.addColorStop(0, 'rgba(255, 255, 255, 0.28)')
  body.addColorStop(1, 'rgba(255, 255, 255, 0.1)')
  traceCapsule(ctx, PADDING, top, width, height)
  ctx.fillStyle = body
  ctx.fill()
  const rim = ctx.createLinearGradient(0, top, 0, top + height)
  rim.addColorStop(0, 'rgba(255, 255, 255, 0.72)')
  rim.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)')
  rim.addColorStop(1, 'rgba(255, 255, 255, 0.4)')
  ctx.strokeStyle = rim
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.fillText(text, PADDING + 12, baseline)
  ctx.restore()
}

function paintTypeName(ctx: CanvasRenderingContext2D, typeName: string) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const typeWidth = SHARE_CARD_WIDTH - PADDING * 2
  const typeInk = ctx.createLinearGradient(PADDING, 152 - 26, PADDING + typeWidth * 0.75, 158)
  typeInk.addColorStop(0, 'rgba(255, 255, 255, 0.98)')
  typeInk.addColorStop(0.55, 'rgba(242, 247, 253, 0.96)')
  typeInk.addColorStop(1, 'rgba(214, 235, 252, 0.94)')
  ctx.fillStyle = typeInk
  ctx.font = `700 27px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.fillText(typeName, PADDING, 152)
  ctx.restore()
}

function paintStats(ctx: CanvasRenderingContext2D, stats: VoiceTypeStat[]) {
  const columnWidth = (SHARE_CARD_WIDTH - PADDING * 2) / 3
  const valueBaseline = SHARE_CARD_HEIGHT - 50
  const labelBaseline = SHARE_CARD_HEIGHT - 28

  stats.slice(0, 3).forEach((stat, index) => {
    const isLast = index === 2
    const isMiddle = index === 1
    ctx.textAlign = isLast ? 'right' : isMiddle ? 'center' : 'left'
    const x = isLast ? SHARE_CARD_WIDTH - PADDING : isMiddle ? PADDING + columnWidth * 1.5 : PADDING
    ctx.textBaseline = 'alphabetic'
    ctx.font = `600 19px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.fillStyle = INK
    ctx.fillText(stat.value, x, valueBaseline)
    ctx.font = `500 11px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.fillStyle = INK_FAINT
    ctx.fillText(stat.label, x, labelBaseline)
  })
}

function paintShareCard(
  canvas: HTMLCanvasElement,
  data: VoiceTypeData,
  pixelRatio: number = 2
) {
  canvas.width = Math.round(SHARE_CARD_WIDTH * pixelRatio)
  canvas.height = Math.round(SHARE_CARD_HEIGHT * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  traceCardOutline(ctx, canvas.width, canvas.height)
  ctx.clip()

  // Base painter
  ctx.save()
  ctx.scale(pixelRatio, pixelRatio)
  paintBackground(ctx)
  ctx.restore()

  // Mark layer
  const markCanvas = renderMarkLayer(canvas.width, canvas.height, 0.18)
  ctx.drawImage(markCanvas, 0, 0)

  // Grain
  paintGrain(ctx, canvas.width, canvas.height, 0.12)

  // Typography
  ctx.save()
  ctx.scale(pixelRatio, pixelRatio)
  paintBrand(ctx, data.brand)
  paintKicker(ctx, data.kicker)
  paintTypeName(ctx, data.typeName)
  paintStats(ctx, data.stats)
  ctx.restore()

  ctx.restore()
}

export function VoiceTypeModal({ isOpen, onClose, data = DEFAULT_VOICE_TYPE_DATA }: VoiceTypeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [downloadFeedback, setDownloadFeedback] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      if (canvasRef.current) {
        paintShareCard(canvasRef.current, data)
      }
    }, 16)
    return () => clearTimeout(timer)
  }, [isOpen, data])

  if (!isOpen) return null

  const handleCopyImage = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ])
          setCopyFeedback(true)
          setTimeout(() => setCopyFeedback(false), 2000)
        } catch {
          // Fallback if write not supported
          setCopyFeedback(false)
        }
      })
    } catch {
      // ignore
    }
  }

  const handleDownloadImage = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.download = `${data.typeName.toLowerCase().replace(/\s+/g, '-')}-voice-type.png`
    a.href = url
    a.click()
    setDownloadFeedback(true)
    setTimeout(() => setDownloadFeedback(false), 2000)
  }

  const handlePostToLinkedIn = async () => {
    await handleCopyImage()
    setShareFeedback('linkedin')
    setTimeout(() => setShareFeedback(null), 2500)
    const text = encodeURIComponent(
      `My Voice Type is ${data.typeName} on VoiceOS! 🎙️✨`
    )
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${text}`, '_blank')
  }

  const handlePostToTwitter = async () => {
    await handleCopyImage()
    setShareFeedback('twitter')
    setTimeout(() => setShareFeedback(null), 2500)
    const text = encodeURIComponent(
      `My Voice Type is "${data.typeName}" on @VoiceOS! 🎙️⚡`
    )
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-[488px] w-full rounded-[30px] bg-[#1e1f23] p-6 shadow-2xl border border-white/10 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.12] text-white transition-colors hover:bg-white/[0.22] focus:outline-none"
          aria-label="Close modal"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Card Canvas */}
        <div className="w-[440px] h-[286px] rounded-[24px] overflow-hidden shadow-lg border border-white/[0.08] relative select-none">
          <canvas
            ref={canvasRef}
            style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
            className="block w-full h-full"
          />
        </div>

        {/* Bottom Action Buttons */}
        <div className="mt-6 flex w-full items-center gap-2 px-1">
          {/* Copy Image Button */}
          <button
            type="button"
            onClick={handleCopyImage}
            title={copyFeedback ? 'Copied to clipboard!' : 'Copy image'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16] border border-white/[0.08] focus:outline-none flex-shrink-0"
          >
            {copyFeedback ? (
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {/* Download Image Button */}
          <button
            type="button"
            onClick={handleDownloadImage}
            title={downloadFeedback ? 'Saved!' : 'Download image'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white transition-colors hover:bg-white/[0.16] border border-white/[0.08] focus:outline-none flex-shrink-0"
          >
            {downloadFeedback ? (
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </button>

          <div className="flex-1" />

          {/* Post to LinkedIn */}
          <button
            type="button"
            onClick={handlePostToLinkedIn}
            className="rounded-full px-3.5 py-2 bg-white/[0.08] hover:bg-white/[0.16] text-white text-xs font-semibold flex items-center gap-1.5 border border-white/[0.08] transition-colors focus:outline-none"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            <span>{shareFeedback === 'linkedin' ? 'Copied & Opening...' : 'Post to LinkedIn'}</span>
          </button>

          {/* Post to Twitter / X */}
          <button
            type="button"
            onClick={handlePostToTwitter}
            className="rounded-full px-3.5 py-2 bg-white hover:bg-white/90 text-gray-950 text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>{shareFeedback === 'twitter' ? 'Copied & Opening...' : 'Post to Twitter'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
