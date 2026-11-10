import { describe, expect, it } from 'vitest'
import { splitSpeechText } from './speech'

describe('splitSpeechText', () => {
  it('keeps a short answer in one chunk', () => {
    expect(splitSpeechText('The file could not be found.')).toEqual([
      'The file could not be found.'
    ])
  })

  it('splits at sentence boundaries', () => {
    expect(
      splitSpeechText('The error means the file is missing. Choose another file to continue.')
    ).toEqual([
      'The error means the file is missing.',
      'Choose another file to continue.'
    ])
  })

  it('keeps decimals and version numbers inside one sentence', () => {
    expect(
      splitSpeechText('The file is 3.5 GB. Install version 23.2 and try again.')
    ).toEqual([
      'The file is 3.5 GB.',
      'Install version 23.2 and try again.'
    ])
  })

  it('collapses whitespace and ignores blank input', () => {
    expect(splitSpeechText('  First line.\n\nSecond   line.  ')).toEqual([
      'First line.',
      'Second line.'
    ])
    expect(splitSpeechText('   ')).toEqual([])
  })

  it('hard-wraps a long sentence without breaking words', () => {
    const text = `${'word '.repeat(60).trim()}.`
    const chunks = splitSpeechText(text, 80)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80)
      expect(chunk.startsWith(' ')).toBe(false)
      expect(chunk.endsWith(' ')).toBe(false)
    }
    expect(chunks.join(' ')).toBe(text)
  })

  it('keeps default chunks well under the Chromium long-utterance cutoff', () => {
    const text = Array.from(
      { length: 30 },
      (_, index) => `This is sentence ${index} with a few extra words in it.`
    ).join(' ')

    const chunks = splitSpeechText(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(160)
    }
  })

  it('splits a long unbroken run rather than dropping it', () => {
    const chunks = splitSpeechText('x'.repeat(50), 20)

    expect(chunks.join('')).toBe('x'.repeat(50))
    expect(chunks.every((chunk) => chunk.length <= 20)).toBe(true)
  })
})
