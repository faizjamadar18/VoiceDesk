import { describe, expect, it, vi } from 'vitest'
import {
  GroqTranscriptPolisher,
  buildPolishPrompt,
  type FetchLike,
  type PolishRequest
} from './llm-polish'

const CASUAL_STRUCTURE = {
  capitalization: 'auto' as const,
  sentenceEndings: 'light' as const,
  exclamation: 'off' as const,
  greeting: 'inline' as const
}

function request(overrides: Partial<PolishRequest> = {}): PolishRequest {
  return { text: 'some dictated text here', contextType: 'other', style: 'light', ...overrides }
}

describe('buildPolishPrompt', () => {
  it('keeps the base rules, style and channel lines', () => {
    const prompt = buildPolishPrompt(request({ style: 'polished', contextType: 'work_chat' }))

    expect(prompt.system).toContain('You are a dictation cleanup engine.')
    expect(prompt.system).toContain('Style: polished.')
    expect(prompt.system).toContain('Channel: work chat')
    expect(prompt.user).toBe('some dictated text here')
  })

  it('lists preferred spellings and spoken forms from the dictionary', () => {
    const prompt = buildPolishPrompt(
      request({
        dictionary: [{ text: 'Kanuel' }, { text: 'Figma', description: 'fig ma' }]
      })
    )

    expect(prompt.system).toContain('Always spell these exactly: Kanuel, Figma')
    expect(prompt.system).toContain('"fig ma" must be written as "Figma"')
  })

  it('describes personal replacements and keeps links intact', () => {
    const prompt = buildPolishPrompt(
      request({
        replacements: [{ title: 'my calendar link', content: 'https://cal.com/me' }]
      })
    )

    expect(prompt.system).toContain(
      'When the speaker says "my calendar link", write "https://cal.com/me" exactly (links and line breaks included).'
    )
  })

  it('adds the formatting preferences from the structure', () => {
    const prompt = buildPolishPrompt(request({ structure: CASUAL_STRUCTURE }))

    expect(prompt.system).toContain(
      'Formatting: capitalization auto; sentence endings light; exclamation off; greeting inline.'
    )
  })

  it('omits the optional sections when there is no data', () => {
    const prompt = buildPolishPrompt(request())

    expect(prompt.system).not.toContain('Always spell these exactly')
    expect(prompt.system).not.toContain('must be written as')
    expect(prompt.system).not.toContain('When the speaker says')
    expect(prompt.system).not.toContain('Formatting:')
  })

  it('caps the number of personal replacements', () => {
    const replacements = Array.from({ length: 60 }, (_, index) => ({
      title: `title ${index}`,
      content: `content ${index}`
    }))

    const prompt = buildPolishPrompt(request({ replacements }))

    expect(prompt.system).toContain('"title 49"')
    expect(prompt.system).not.toContain('"title 50"')
  })
})

describe('GroqTranscriptPolisher', () => {
  it('returns the text without a request when the style is none', async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike
    const polisher = new GroqTranscriptPolisher({ apiKey: 'test-key', fetch: fetchImpl })

    await expect(
      polisher.polish(request({ style: 'none', text: 'leave this exactly alone' }))
    ).resolves.toBe('leave this exactly alone')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('skips the request for dictations shorter than three words', async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike
    const polisher = new GroqTranscriptPolisher({ apiKey: 'test-key', fetch: fetchImpl })

    await expect(polisher.polish(request({ text: 'two words' }))).resolves.toBe('two words')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends the prompt and returns the cleaned text', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Some dictated text here.' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as FetchLike
    const polisher = new GroqTranscriptPolisher({ apiKey: 'test-key', fetch: fetchImpl })

    await expect(polisher.polish(request())).resolves.toBe('Some dictated text here.')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns the original text when the request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as FetchLike
    const polisher = new GroqTranscriptPolisher({ apiKey: 'test-key', fetch: fetchImpl })

    await expect(polisher.polish(request())).resolves.toBe('some dictated text here')
  })
})
