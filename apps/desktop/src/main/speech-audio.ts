/**
 * WAV helpers for streaming speech. Kokoro emits ~0.45 s of trailing silence on
 * every chunk; trimming it removes the dead air between chunks. Pure: the input
 * buffer is never mutated, and an unsupported buffer is returned unchanged.
 */

export interface TrimSilenceOptions {
  keepSilenceMs?: number // silence to keep after the last audible frame
  threshold?: number // normalised amplitude counted as audible
}

interface ParsedWav {
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  blockAlign: number
  dataOffset: number
  dataSize: number
  dataIsLast: boolean
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index))
  }
  return text
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseWav(wav: Uint8Array): ParsedWav | null {
  if (wav.length < 44) return null

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  if (readAscii(view, 0, 4) !== 'RIFF') return null
  if (readAscii(view, 8, 4) !== 'WAVE') return null

  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let blockAlign = 0
  let hasFormat = false
  let dataOffset = 0
  let dataSize = 0
  let dataIsLast = false

  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const payload = offset + 8
    if (payload + size > wav.length) return null

    if (id === 'fmt ') {
      if (size < 16) return null
      audioFormat = view.getUint16(payload, true)
      channels = view.getUint16(payload + 2, true)
      sampleRate = view.getUint32(payload + 4, true)
      blockAlign = view.getUint16(payload + 12, true)
      bitsPerSample = view.getUint16(payload + 14, true)
      hasFormat = true
    } else if (id === 'data') {
      dataOffset = payload
      dataSize = size
      dataIsLast = payload + size + (size % 2 === 1 ? 1 : 0) === wav.length
    }

    // Chunks are padded to an even length.
    offset = payload + size + (size % 2 === 1 ? 1 : 0)
  }

  if (!hasFormat || dataOffset === 0) return null
  if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0) return null
  if (blockAlign !== channels * (bitsPerSample / 8)) return null

  if (audioFormat === 1) {
    if (bitsPerSample !== 16) return null
  } else if (audioFormat === 3) {
    if (bitsPerSample !== 32) return null
  } else {
    return null
  }

  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    blockAlign,
    dataOffset,
    dataSize,
    dataIsLast
  }
}

function nonNegative(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

export function trimTrailingSilence(wav: Uint8Array, options: TrimSilenceOptions = {}): Uint8Array {
  const keepSilenceMs = nonNegative(options.keepSilenceMs, 100)
  const threshold = nonNegative(options.threshold, 0.004)

  const parsed = parseWav(wav)
  if (!parsed || !parsed.dataIsLast) return wav

  const bytesPerSample = parsed.bitsPerSample / 8
  const frameSize = parsed.blockAlign
  if (parsed.dataSize === 0 || parsed.dataSize % frameSize !== 0) return wav

  const frameCount = parsed.dataSize / frameSize
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

  // Walk back to the last frame with any audible sample.
  let lastAudible = -1
  for (let frame = frameCount - 1; frame >= 0; frame -= 1) {
    const frameOffset = parsed.dataOffset + frame * frameSize
    for (let channel = 0; channel < parsed.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * bytesPerSample
      const sample =
        parsed.audioFormat === 3
          ? view.getFloat32(sampleOffset, true)
          : view.getInt16(sampleOffset, true) / 32768
      if (Math.abs(sample) > threshold) {
        lastAudible = frame
        break
      }
    }
    if (lastAudible !== -1) break
  }

  // Nothing audible: never emit zero-length audio.
  if (lastAudible < 0) return wav

  const keepFrames = Math.ceil((keepSilenceMs / 1000) * parsed.sampleRate)
  const keep = clamp(lastAudible + 1 + keepFrames, 1, frameCount)
  if (keep >= frameCount) return wav

  const trimmedDataSize = keep * frameSize
  if (trimmedDataSize >= parsed.dataSize) return wav

  // Rebuild: header up to the sample data, then the truncated data (plus pad).
  const pad = trimmedDataSize % 2 === 1 ? 1 : 0
  const output = new Uint8Array(parsed.dataOffset + trimmedDataSize + pad)
  output.set(wav.subarray(0, parsed.dataOffset), 0)
  output.set(wav.subarray(parsed.dataOffset, parsed.dataOffset + trimmedDataSize), parsed.dataOffset)

  const outView = new DataView(output.buffer)
  outView.setUint32(parsed.dataOffset - 4, trimmedDataSize, true) // data chunk size
  outView.setUint32(4, output.length - 8, true) // RIFF size

  return output
}

export function wavDurationMs(wav: Uint8Array): number | null {
  const parsed = parseWav(wav)
  if (!parsed) return null

  const frameCount = Math.floor(parsed.dataSize / parsed.blockAlign)
  if (frameCount <= 0) return null

  return (frameCount / parsed.sampleRate) * 1000
}
