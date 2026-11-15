/** In-memory PCM helpers. No audio is ever written to disk. */

export const ASR_SAMPLE_RATE = 16_000

export function durationMs(samples: Float32Array, sampleRate: number): number {
  if (sampleRate <= 0) return 0
  return (samples.length / sampleRate) * 1000
}

/** Encode mono Float32 PCM as little-endian 16-bit PCM for the realtime socket. */
export function encodePcm16(samples: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    view.setInt16(index * 2, Math.round(value), true)
  }

  return new Uint8Array(buffer)
}

/**
 * Wrap little-endian 16-bit PCM in a canonical 44-byte RIFF/WAVE container.
 * Whisper-family APIs reject raw PCM, so dictation sends a real WAV instead.
 */
export function encodeWav(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array {
  const bitsPerSample = 16
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const header = new ArrayBuffer(44)
  const view = new DataView(header)

  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcm.byteLength, true)

  const wav = new Uint8Array(44 + pcm.byteLength)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcm, 44)
  return wav
}

/**
 * Decode a canonical 44-byte RIFF/WAVE file (16-bit PCM, format 1) back into
 * mono Float32 samples and its sample rate. The exact inverse of `encodeWav`.
 * Throws when the buffer is not a RIFF/WAVE 16-bit PCM file.
 */
export function decodeWav(wav: Uint8Array): { samples: Float32Array; sampleRate: number } {
  if (wav.byteLength < 44) {
    throw new Error('Not a RIFF/WAVE file: the buffer is too small for a WAV header.')
  }

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const ascii = (offset: number, length: number): string => {
    let text = ''
    for (let index = 0; index < length; index += 1) {
      text += String.fromCharCode(view.getUint8(offset + index))
    }
    return text
  }

  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file: the RIFF or WAVE marker is missing.')
  }

  const format = view.getUint16(20, true)
  const bitsPerSample = view.getUint16(34, true)
  if (format !== 1 || bitsPerSample !== 16) {
    throw new Error(
      `Unsupported WAV encoding: expected 16-bit PCM, got format ${format} with ${bitsPerSample} bits per sample.`
    )
  }

  const sampleRate = view.getUint32(24, true)
  const channels = view.getUint16(22, true) || 1
  const dataLength = Math.min(view.getUint32(40, true), wav.byteLength - 44)
  const frameCount = Math.floor(dataLength / (2 * channels))
  const samples = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame += 1) {
    // Downmix to mono; canonical dictation recordings are already mono.
    let sum = 0
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(44 + (frame * channels + channel) * 2, true)
    }
    samples[frame] = sum / channels / 0x8000
  }

  return { samples, sampleRate }
}
