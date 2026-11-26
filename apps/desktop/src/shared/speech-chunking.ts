/**
 * Split a spoken answer into even, syllable-paced chunks for streaming TTS.
 *
 * Sentence-sized splits are wildly uneven, so a slow chunk starves playback and
 * leaves silence between chunks. This packer keeps chunks near a target word
 * count so synthesis stays ahead of playback. Pure and dependency-free.
 */
export interface SpeechChunkOptions {
  targetWords?: number // preferred words per chunk
  maxWords?: number // hard word ceiling, bar a merged tail or a long single word
  minWords?: number // a shorter tail merges into the previous chunk
  maxChars?: number // hard character cap for one chunk, bar a long single word
}

const DEFAULTS = {
  targetWords: 12,
  maxWords: 16,
  minWords: 6,
  maxChars: 160
} as const

const TERMINATORS = new Set(['.', ',', ';', ':', '!', '?', '—', '–'])

function endsWithTerminator(word: string): boolean {
  if (!word) return false
  return TERMINATORS.has(word[word.length - 1])
}

function positiveCount(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback
  return Math.floor(value)
}

export function splitSpeechChunks(text: string, options: SpeechChunkOptions = {}): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const maxWords = Math.max(1, positiveCount(options.maxWords, DEFAULTS.maxWords))
  const targetWords = Math.min(maxWords, positiveCount(options.targetWords, DEFAULTS.targetWords))
  const minWords = positiveCount(options.minWords, DEFAULTS.minWords)
  const maxChars = positiveCount(options.maxChars, DEFAULTS.maxChars)

  const chunks: string[] = []
  let buffer: string[] = []
  let bufferChars = 0

  const flush = (): void => {
    if (buffer.length === 0) return
    chunks.push(buffer.join(' '))
    buffer = []
    bufferChars = 0
  }

  for (const word of normalized.split(' ')) {
    const projected = bufferChars === 0 ? word.length : bufferChars + 1 + word.length
    // maxChars is a hard cap: close the current chunk before overflowing it.
    if (buffer.length > 0 && projected > maxChars) {
      flush()
    }

    buffer.push(word)
    bufferChars = buffer.length === 1 ? word.length : bufferChars + 1 + word.length

    if (buffer.length >= targetWords) {
      // Prefer the nearest chunk-final terminator, but never cut below minWords.
      // buffer.length equals targetWords here, so the default cut is in range.
      let cut = buffer.length
      for (let index = buffer.length - 1; index >= 0; index -= 1) {
        if (endsWithTerminator(buffer[index]) && index + 1 >= minWords) {
          cut = index + 1
          break
        }
      }

      const tail = buffer.slice(cut)
      chunks.push(buffer.slice(0, cut).join(' '))
      buffer = tail
      bufferChars = tail.length === 0 ? 0 : tail.join(' ').length
    }
  }

  if (buffer.length > 0) {
    const tail = buffer.join(' ')
    const previous = chunks.length > 0 ? chunks[chunks.length - 1] : null
    const merged = previous ? `${previous} ${tail}` : tail
    const previousWords = previous ? previous.split(' ').length : 0

    // Fold a short tail back in, as long as the result stays bounded by both
    // the word ceiling (+4) and the maxChars hard cap.
    const canMerge =
      previous !== null &&
      buffer.length < minWords &&
      previousWords + buffer.length <= maxWords + 4 &&
      merged.length <= maxChars

    if (canMerge) {
      chunks[chunks.length - 1] = merged
    } else {
      chunks.push(tail)
    }
  }

  return chunks
}
