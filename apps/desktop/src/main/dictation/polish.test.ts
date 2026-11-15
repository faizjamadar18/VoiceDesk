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

  describe('capitalization rules', () => {
    it('handles capitalization="always"', () => {
      expect(
        polishTranscript('first sentence. second sentence', {
          structure: { capitalization: 'always', sentenceEndings: 'proper' }
        })
      ).toBe('First sentence. Second sentence.')
    })

    it('handles capitalization="never"', () => {
      expect(
        polishTranscript('Hello World. Another Sentence', {
          structure: { capitalization: 'never', sentenceEndings: 'none' }
        })
      ).toBe('hello world another sentence')
    })
  })

  describe('sentence endings rules', () => {
    it('handles sentenceEndings="proper"', () => {
      expect(
        polishTranscript('hello world', {
          structure: { sentenceEndings: 'proper' }
        })
      ).toBe('Hello world.')
    })

    it('handles sentenceEndings="light" (omits period on short chat, adds on long)', () => {
      expect(
        polishTranscript('hey there', {
          structure: { sentenceEndings: 'light' }
        })
      ).toBe('Hey there')

      expect(
        polishTranscript(
          'this is a much longer sentence that contains enough words to warrant proper punctuation at the end of it',
          { structure: { sentenceEndings: 'light' } }
        )
      ).toBe(
        'This is a much longer sentence that contains enough words to warrant proper punctuation at the end of it.'
      )
    })

    it('handles sentenceEndings="none"', () => {
      expect(
        polishTranscript('Hello world. Second sentence.', {
          structure: { sentenceEndings: 'none' }
        })
      ).toBe('Hello world Second sentence')
    })
  })

  describe('greeting rules', () => {
    it('handles greeting="newline"', () => {
      expect(
        polishTranscript('Hi Sarah, I wanted to follow up on the proposal', {
          structure: { greeting: 'newline', sentenceEndings: 'proper' }
        })
      ).toBe('Hi Sarah,\n\nI wanted to follow up on the proposal.')
    })

    it('handles greeting="inline"', () => {
      expect(
        polishTranscript('Hi Sarah, I wanted to follow up on the proposal', {
          structure: { greeting: 'inline', sentenceEndings: 'proper' }
        })
      ).toBe('Hi Sarah, I wanted to follow up on the proposal.')
    })
  })

  describe('exclamation rules', () => {
    it('suppresses exclamation marks when exclamation="off"', () => {
      expect(
        polishTranscript('Great job! That was fantastic!', {
          structure: { exclamation: 'off', sentenceEndings: 'proper' }
        })
      ).toBe('Great job. That was fantastic.')
    })

    it('preserves exclamation marks when exclamation="on"', () => {
      expect(
        polishTranscript('Great job! That was fantastic!', {
          structure: { exclamation: 'on', sentenceEndings: 'proper' }
        })
      ).toBe('Great job! That was fantastic!')
    })
  })

  describe('filler word removal and polish styles', () => {
    it('keeps fillers when polishStyle="none" or "light"', () => {
      const raw = 'Um, I think, uh, we are ready'
      expect(polishTranscript(raw, { style: 'light' })).toBe('Um, I think, uh, we are ready')
    })

    it('strips filler words when polishStyle="polished"', () => {
      const raw = 'Um, I think, uh, we should, you know, meet up'
      expect(polishTranscript(raw, { style: 'polished' })).toBe('I think we should meet up')
    })
  })

  describe('spelling replacements and text shortcuts', () => {
    it('applies custom spelling replacements', () => {
      expect(
        polishTranscript('i love github and vscode', {
          replacements: { github: 'GitHub', vscode: 'VS Code' }
        })
      ).toBe('I love GitHub and VS Code')
    })

    it('expands text shortcuts', () => {
      expect(
        polishTranscript('send it to :email please', {
          shortcuts: { ':email': 'team@incredible.ai' }
        })
      ).toBe('Send it to team@incredible.ai please')
    })
  })
})

