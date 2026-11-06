import { describe, expect, it } from 'vitest'
import { polishTranscript } from './polish'

describe('polishTranscript', () => {
  it('trims the ends and collapses internal whitespace', () => {
    expect(polishTranscript('  Hello   world \n\t again  ')).toBe('Hello world again')
  })

  it('capitalizes the first letter without adding punctuation', () => {
    expect(polishTranscript('hello world')).toBe('Hello world')
  })

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(polishTranscript('')).toBe('')
    expect(polishTranscript('  \n\t  ')).toBe('')
  })

  it('leaves already-clean text unchanged', () => {
    expect(polishTranscript('Already clean.')).toBe('Already clean.')
  })

  it('leaves URLs and filesystem paths intact', () => {
    expect(polishTranscript('https://example.com/Path?q=1')).toBe(
      'https://example.com/Path?q=1'
    )
    expect(polishTranscript('www.example.com/docs')).toBe('www.example.com/docs')
    expect(polishTranscript('c:\\Users\\faiz\\Notes.txt')).toBe('c:\\Users\\faiz\\Notes.txt')
    expect(polishTranscript('/home/faiz/notes.txt')).toBe('/home/faiz/notes.txt')
  })
})
