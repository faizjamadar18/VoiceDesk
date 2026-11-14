import type { VoiceTypeCardModel } from './types'

export const SHARE_CARD_WIDTH = 440
export const SHARE_CARD_HEIGHT = 286
export const EXPORT_PIXEL_RATIO = 2
const CARD_RADIUS = 24
const PADDING = 28
const CARD_SEED = 20260801
const INK = 'rgba(255, 255, 255, 0.96)'
const INK_FAINT = 'rgba(255, 255, 255, 0.78)'
const INK_RGB = [255, 255, 255]
const GLOW_X = 356
const GLOW_Y = 150
const TEXTURE_RATIO = 2
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

function traceCardOutline(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const scale = width / SHARE_CARD_WIDTH
  const radius = CARD_RADIUS * scale
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

function cardFontFamily(): string {
  const configured = getComputedStyle(document.body).getPropertyValue('--app-font-family').trim()
  return configured || 'Lexend, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

function font(size: number, weight: number, family: string): string {
  return `${weight} ${size}px ${family}`
}

function fittedFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  maxSize: number,
  minSize: number,
  maxWidth: number
): number {
  for (let size = maxSize; size > minSize; size--) {
    ctx.font = font(size, weight, family)
    if (ctx.measureText(text).width <= maxWidth) return size
  }
  return minSize
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}…`
}

function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(seed, xi, yi)
  const b = hash(seed, xi + 1, yi)
  const c = hash(seed, xi, yi + 1)
  const d = hash(seed, xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(seed: number, x: number, y: number, octaves: number): number {
  let value = 0
  let amplitude = 0.5
  let total = 0
  let frequency = 1
  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise(seed + octave * 101, x * frequency, y * frequency) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / total
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function sequence(seed: number): () => number {
  let index = 0
  return () => hash(seed, index++, 0)
}

function buildNoiseField(
  width: number,
  height: number,
  scale: number,
  seed: number,
  octaves = 4,
  scaleY = scale
): Float32Array {
  const field = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      field[y * width + x] = fbm(seed, x / scale, y / scaleY, octaves)
    }
  }
  return field
}

function paintCoarseField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  write: (value: number, pixels: Uint8ClampedArray, offset: number) => void,
  options: { scale: number; seed: number; octaves?: number; scaleY?: number }
): void {
  const step = 6
  const fieldWidth = Math.max(2, Math.ceil(width / step))
  const fieldHeight = Math.max(2, Math.ceil(height / step))
  const field = buildNoiseField(
    fieldWidth,
    fieldHeight,
    options.scale / step,
    options.seed,
    options.octaves ?? 3,
    (options.scaleY ?? options.scale) / step
  )
  const image = new ImageData(fieldWidth, fieldHeight)
  for (let index = 0; index < field.length; index++) {
    write(field[index], image.data, index * 4)
  }
  const scratch = document.createElement('canvas')
  scratch.width = fieldWidth
  scratch.height = fieldHeight
  const scratchCtx = scratch.getContext('2d')
  if (!scratchCtx) return
  scratchCtx.putImageData(image, 0, 0)
  ctx.drawImage(scratch, 0, 0, width, height)
}

function paintDyeMottle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: { scale: number; scaleY: number; strength: number; seed: number }
): void {
  const { strength } = options
  const alpha = Math.round(strength * 255)
  const previousOperation = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'overlay'
  paintCoarseField(
    ctx,
    width,
    height,
    (value, pixels, offset) => {
      const level = Math.round(clamp01(0.5 + (value - 0.5) * 2.4) * 255)
      pixels[offset] = level
      pixels[offset + 1] = level
      pixels[offset + 2] = level
      pixels[offset + 3] = alpha
    },
    options
  )
  ctx.globalCompositeOperation = previousOperation
}

function paintFibers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    count: number
    minLength: number
    maxLength: number
    opacity: number
    lit: [number, number, number]
    shade: [number, number, number]
    seed: number
  }
): void {
  const { count, minLength, maxLength, opacity, lit, shade, seed } = options
  const next = sequence(seed)
  ctx.save()
  ctx.lineCap = 'round'
  for (let index = 0; index < count; index++) {
    const x = next() * width
    const y = next() * height
    const angle = next() * Math.PI * 2
    const length = minLength + next() * (maxLength - minLength)
    const bend = (next() - 0.5) * length * 0.4
    const catchesLight = next() > 0.42
    const alpha = opacity * (0.3 + next() * 0.7)
    const endX = x + Math.cos(angle) * length
    const endY = y + Math.sin(angle) * length
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      (x + endX) / 2 - Math.sin(angle) * bend * 2,
      (y + endY) / 2 + Math.cos(angle) * bend * 2,
      endX,
      endY
    )
    const [red, green, blue] = catchesLight ? lit : shade
    ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`
    ctx.lineWidth = 0.45 + next() * 0.85
    ctx.stroke()
  }
  ctx.restore()
}

function paintGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: { intensity: number; cellSize: number; seed: number }
): void {
  const { intensity, cellSize, seed } = options
  const grainWidth = Math.max(1, Math.ceil(width / cellSize))
  const grainHeight = Math.max(1, Math.ceil(height / cellSize))
  const image = ctx.createImageData(grainWidth, grainHeight)
  const pixels = image.data
  for (let y = 0; y < grainHeight; y++) {
    for (let x = 0; x < grainWidth; x++) {
      const offset = (y * grainWidth + x) * 4
      const level = Math.round(hash(seed, x, y) * 255)
      pixels[offset] = level
      pixels[offset + 1] = level
      pixels[offset + 2] = level
      pixels[offset + 3] = Math.round(intensity * 255)
    }
  }
  const scratch = document.createElement('canvas')
  scratch.width = image.width
  scratch.height = image.height
  const scratchCtx = scratch.getContext('2d')
  if (!scratchCtx) return
  scratchCtx.putImageData(image, 0, 0)
  const previousOperation = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'overlay'
  ctx.drawImage(scratch, 0, 0, width, height)
  ctx.globalCompositeOperation = previousOperation
}

function paintBackground(ctx: CanvasRenderingContext2D): void {
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

  const blooms: Array<{
    x: number
    y: number
    radius: number
    squash?: number
    color: [number, number, number]
    alpha: number
  }> = [
    { x: 0.16, y: -0.1, radius: 0.86, squash: 0.44, color: [252, 254, 255], alpha: 1 },
    { x: 0.8, y: -0.12, radius: 0.76, squash: 0.52, color: [250, 253, 255], alpha: 0.98 },
    { x: 1.06, y: 0.56, radius: 0.48, color: [43, 112, 228], alpha: 0.55 },
    { x: 0.02, y: 1.08, radius: 0.6, color: [16, 40, 128], alpha: 0.72 },
    { x: 1.0, y: 1.1, radius: 0.48, color: [18, 46, 140], alpha: 0.55 },
    { x: 0.05, y: 0.52, radius: 0.4, color: [116, 142, 208], alpha: 0.26 }
  ]

  for (const bloom of blooms) {
    const radius = bloom.radius * width
    const squash = bloom.squash ?? 1
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
}

function traceLogoMark(ctx: CanvasRenderingContext2D): void {
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

let cachedMarkLayer: HTMLCanvasElement | null = null

function markLayer(width: number, height: number): HTMLCanvasElement {
  if (cachedMarkLayer && cachedMarkLayer.width === width && cachedMarkLayer.height === height) {
    return cachedMarkLayer
  }
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
  ctx.strokeStyle = `rgb(${INK_RGB.join(', ')})`
  ctx.stroke()
  cachedMarkLayer = canvas
  return canvas
}

function renderMarkLayer(opacity: number): HTMLCanvasElement {
  const width = Math.round(SHARE_CARD_WIDTH * TEXTURE_RATIO)
  const height = Math.round(SHARE_CARD_HEIGHT * TEXTURE_RATIO)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.globalAlpha = opacity
  ctx.drawImage(markLayer(width, height), 0, 0)
  return canvas
}

export function renderMarkTexture(opacity: number): string {
  return renderMarkLayer(opacity).toDataURL('image/png')
}

function paintBrand(ctx: CanvasRenderingContext2D, brand: string, family: string): void {
  const baseline = 52
  const size = 17
  const stamp = ctx.createLinearGradient(0, baseline - size * 0.72, 0, baseline)
  stamp.addColorStop(0, 'rgb(90, 90, 90)')
  stamp.addColorStop(0.55, 'rgb(38, 38, 38)')
  stamp.addColorStop(1, 'rgb(10, 10, 10)')
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(size, 600, family)
  ctx.fillStyle = stamp
  ctx.fillText(`${brand}.com`, PADDING, baseline)
  ctx.restore()
}

function traceCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const radius = height / 2
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(x + radius, y + height)
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
}

function paintKicker(ctx: CanvasRenderingContext2D, kicker: string, family: string): void {
  const text = kicker.toUpperCase()
  const size = 10
  const baseline = 110
  const height = 22
  const top = baseline - 15
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(size, 700, family)
  ctx.letterSpacing = '0.14em'
  const textWidth = ctx.measureText(text).width - size * 0.14
  const width = textWidth + 22
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
  ctx.save()
  ctx.clip()
  const glint = ctx.createLinearGradient(PADDING, 0, PADDING + width, 0)
  glint.addColorStop(0, 'rgba(255, 255, 255, 0)')
  glint.addColorStop(0.35, 'rgba(255, 255, 255, 0.5)')
  glint.addColorStop(0.65, 'rgba(255, 255, 255, 0.5)')
  glint.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glint
  ctx.fillRect(PADDING + height * 0.4, top + 1.6, width - height * 0.8, 1)
  ctx.restore()
  ctx.fillStyle = INK
  ctx.fillText(text, PADDING + 11, baseline)
  ctx.restore()
}

function paintStats(
  ctx: CanvasRenderingContext2D,
  stats: Array<{ label: string; value: string }>,
  family: string
): void {
  const columnWidth = (SHARE_CARD_WIDTH - PADDING * 2) / 3
  const valueBaseline = SHARE_CARD_HEIGHT - 50
  const labelBaseline = SHARE_CARD_HEIGHT - 28
  stats.slice(0, 3).forEach((stat, index) => {
    const isLast = index === 2
    const isMiddle = index === 1
    ctx.textAlign = isLast ? 'right' : isMiddle ? 'center' : 'left'
    const x = isLast ? SHARE_CARD_WIDTH - PADDING : isMiddle ? PADDING + columnWidth * 1.5 : PADDING
    ctx.textBaseline = 'alphabetic'
    ctx.font = font(19, 600, family)
    ctx.fillStyle = INK
    ctx.fillText(fitText(ctx, stat.value, columnWidth - 6), x, valueBaseline)
    ctx.font = font(11, 500, family)
    ctx.fillStyle = INK_FAINT
    ctx.fillText(fitText(ctx, stat.label, columnWidth - 6), x, labelBaseline)
  })
}

export function paintShareCard(
  canvas: HTMLCanvasElement,
  model: VoiceTypeCardModel,
  options: { pixelRatio: number } = { pixelRatio: EXPORT_PIXEL_RATIO }
): void {
  const { pixelRatio } = options
  canvas.width = Math.round(SHARE_CARD_WIDTH * pixelRatio)
  canvas.height = Math.round(SHARE_CARD_HEIGHT * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const family = cardFontFamily()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.beginPath()
  traceCardOutline(ctx, canvas.width, canvas.height)
  ctx.clip()
  ctx.save()
  ctx.scale(pixelRatio, pixelRatio)
  paintBackground(ctx)
  ctx.restore()
  paintDyeMottle(ctx, canvas.width, canvas.height, {
    scale: 150 * pixelRatio,
    scaleY: 320 * pixelRatio,
    strength: 0.2,
    seed: CARD_SEED + 41
  })
  paintFibers(ctx, canvas.width, canvas.height, {
    count: 190,
    minLength: 14 * pixelRatio,
    maxLength: 62 * pixelRatio,
    opacity: 0.07,
    lit: [255, 255, 255],
    shade: [12, 52, 96],
    seed: CARD_SEED + 53
  })
  ctx.drawImage(renderMarkLayer(0.16), 0, 0, canvas.width, canvas.height)
  paintGrain(ctx, canvas.width, canvas.height, {
    intensity: 0.17,
    cellSize: pixelRatio,
    seed: CARD_SEED + 7
  })
  ctx.save()
  ctx.scale(pixelRatio, pixelRatio)
  paintBrand(ctx, model.brand, family)
  paintKicker(ctx, model.kicker, family)
  const typeText = model.typeName
  const typeWidth = SHARE_CARD_WIDTH - PADDING * 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '-0.01em'
  const typeSize = fittedFontSize(ctx, typeText, family, 700, 30, 21, typeWidth)
  ctx.font = font(typeSize, 700, family)
  const typeInk = ctx.createLinearGradient(
    PADDING,
    152 - typeSize,
    PADDING + typeWidth * 0.75,
    158
  )
  typeInk.addColorStop(0, 'rgba(255, 255, 255, 0.98)')
  typeInk.addColorStop(0.55, 'rgba(242, 247, 253, 0.96)')
  typeInk.addColorStop(1, 'rgba(214, 235, 252, 0.94)')
  ctx.fillStyle = typeInk
  ctx.fillText(fitText(ctx, typeText, typeWidth), PADDING, 152)
  ctx.letterSpacing = '0px'
  paintStats(ctx, model.stats, family)
  ctx.restore()
  ctx.restore()
}
