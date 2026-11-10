import { describe, expect, it } from 'vitest'
import { isScreenQuestion } from './screen-intent'

describe('isScreenQuestion', () => {
  it.each([
    'what is this?',
    "what's that?",
    'what is this error',
    "what's this message?",
    'what is this window',
    'what is this page',
    'what is this button',
    'what is this icon',
    'what is this text?',
    'what is this code',
    'what is this image',
    "what's this photo?",
    'what is this chart',
    'what does this say?',
    'what does that mean',
    'what does this show',
    'what does this do?',
    'what does this error mean?',
    "what's wrong with this?",
    'read this',
    'read this to me',
    'explain this for me',
    'translate this into Spanish',
    'summarize this aloud',
    'describe this',
    "what's on my screen?",
    'what is on the screen',
    'what am I looking at?',
    'can you see this?',
    'look at this',
    "what's in the circle?",
    "what's inside the circle",
    "what's circled",
    'whats this?',
    'whats on my screen',
    'what can you see on my screen',
    'what is happening here',
    "what's in this picture",
    'summarise this',
    'is there an error on my screen',
    'read the message on the screen'
  ])('matches %j', (transcript) => {
    expect(isScreenQuestion(transcript)).toBe(true)
  })

  it.each([
    'open this app',
    'type this',
    'search for this',
    'click this',
    'open this app on my screen',
    'click the button on the screen',
    'type this on the screen',
    'put this on the screen',
    'what time is it?',
    'what is this weather',
    "what's the weather",
    'open notepad',
    'read my email',
    'describe this file',
    'translate the document',
    'what did I say',
    '',
    '   '
  ])('does not match %j', (transcript) => {
    expect(isScreenQuestion(transcript)).toBe(false)
  })

  it('normalizes case, whitespace, and trailing punctuation', () => {
    expect(isScreenQuestion('  WHAT   IS   THIS?!  ')).toBe(true)
    expect(isScreenQuestion('What’s on my screen.')).toBe(true)
  })
})
