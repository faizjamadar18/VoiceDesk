import { describe, expect, it } from 'vitest'
import { splitSpeechChunks } from './speech-chunking'

const SCREENSHOT_TEXT =
  "I'm Kestrel, your executive voice assistant on Windows. Think of me as a friendly, always-on-hand helper who can open apps, search files, check the weather, type for you, and even pull up information from Notion—all with a simple voice command. I'm here to keep your day running smoothly, so just tell me what you need and I'll take care of it."

function words(chunk: string): string[] {
  return chunk.split(' ')
}

describe('splitSpeechChunks', () => {
  it('preserves every word, in order, across the chunks', () => {
    const normalized = SCREENSHOT_TEXT.replace(/\s+/g, ' ').trim()
    expect(splitSpeechChunks(SCREENSHOT_TEXT).join(' ')).toBe(normalized)
  })

  it('keeps every chunk non-empty and within the word bounds', () => {
    const chunks = splitSpeechChunks(SCREENSHOT_TEXT)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0)
      expect(words(chunk).length).toBeGreaterThanOrEqual(6) // minWords
      expect(words(chunk).length).toBeLessThanOrEqual(16 + 4) // maxWords + merged tail
    }
  })

  it('holds the first chunk to the target word count', () => {
    const chunks = splitSpeechChunks(SCREENSHOT_TEXT)
    expect(words(chunks[0]).length).toBeLessThanOrEqual(12) // targetWords
  })

  it('keeps chunks balanced with no short-then-huge jump', () => {
    const counts = splitSpeechChunks(SCREENSHOT_TEXT).map((chunk) => words(chunk).length)
    const min = Math.min(...counts)
    const max = Math.max(...counts)

    expect(max).toBeLessThanOrEqual(min * 2)
    expect(max).toBeLessThanOrEqual(16 + 4)
  })

  it('never splits inside a decimal or version number', () => {
    const text = 'The file is 3.5 GB and version 23.2 works fine.'
    const chunks = splitSpeechChunks(text)

    expect(chunks.join(' ')).toBe(text)
    const tokens = chunks.flatMap(words)
    expect(tokens).toContain('3.5')
    expect(tokens).toContain('23.2')
  })

  it('keeps decimals whole when it has to split', () => {
    const text = 'The file is 3.5 GB and version 23.2 works fine.'
    const chunks = splitSpeechChunks(text, { targetWords: 4, maxWords: 6, minWords: 1 })
    const tokens = chunks.flatMap(words)

    expect(chunks.join(' ')).toBe(text)
    expect(tokens).toContain('3.5')
    expect(tokens).toContain('23.2')
    expect(tokens).not.toContain('3.')
    expect(tokens).not.toContain('5')
  })

  it('splits a long run without punctuation into balanced chunks under maxWords', () => {
    const text = Array.from({ length: 35 }, (_, index) => `word${index}`).join(' ')
    const chunks = splitSpeechChunks(text)

    expect(chunks.join(' ')).toBe(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(words(chunk).length).toBeLessThanOrEqual(16) // maxWords
    }

    const counts = chunks.map((chunk) => words(chunk).length)
    expect(Math.max(...counts)).toBeLessThanOrEqual(Math.min(...counts) * 2)
  })

  it('returns an empty array for empty or whitespace input', () => {
    expect(splitSpeechChunks('')).toEqual([])
    expect(splitSpeechChunks('   \n\t  ')).toEqual([])
  })

  it('respects custom options', () => {
    const text = 'one two three four five six seven eight nine ten'
    const chunks = splitSpeechChunks(text, { targetWords: 4, maxWords: 6, minWords: 2 })

    expect(chunks).toEqual(['one two three four', 'five six seven eight', 'nine ten'])
  })

  it('applies maxChars as a hard cap', () => {
    const text = Array.from({ length: 30 }, () => 'aaaaaaaaaa').join(' ') // 10 chars a word
    const chunks = splitSpeechChunks(text, { maxChars: 25 })

    expect(chunks.join(' ')).toBe(text)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25)
    }
  })

  it('allows a single word longer than maxChars on its own', () => {
    const long = 'x'.repeat(200)
    const text = `${long} tail words here now`
    const chunks = splitSpeechChunks(text, { maxChars: 160 })

    expect(chunks.join(' ')).toBe(text)
    expect(chunks.some((chunk) => chunk.length > 160)).toBe(true)
  })
})
