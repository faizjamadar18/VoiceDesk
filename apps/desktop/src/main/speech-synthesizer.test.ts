import { describe, expect, it, vi } from 'vitest'
import { splitSpeechChunks } from '../shared/speech-chunking'
import { wavDurationMs } from './speech-audio'
import {
  DEFAULT_KOKORO_MODEL_ID,
  KokoroSynthesizerEngine,
  resolveDefaultKokoroModelId,
  SpeechSynthesizer,
  type SpeechSynthesizerEngine,
  sanitizeSpeechText,
  splitSpeechSentences
} from './speech-synthesizer'

describe('SpeechSynthesizer', () => {
  it('returns null for empty or whitespace text', async () => {
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    expect(await synthesizer.synthesize('')).toBeNull()
    expect(await synthesizer.synthesize('   ')).toBeNull()
    expect(await synthesizer.synthesize('\t\n ')).toBeNull()
    expect(engine.synthesize).not.toHaveBeenCalled()
  })

  it('returns audio buffer for valid text using the synthesizer engine', async () => {
    const sampleAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46])
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(sampleAudio)
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    const result = await synthesizer.synthesize('Hello world')
    expect(result).toEqual(sampleAudio)
    expect(engine.synthesize).toHaveBeenCalledWith('Hello world', {
      voice: 'af_heart',
      speed: 1.0
    })
  })

  it('uses default voice "af_heart"', async () => {
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(new Uint8Array([1]))
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    await synthesizer.synthesize('Testing default voice')
    expect(engine.synthesize).toHaveBeenCalledWith(
      'Testing default voice',
      expect.objectContaining({ voice: 'af_heart' })
    )

    await synthesizer.synthesize('Testing custom voice', { voice: 'af_bella' })
    expect(engine.synthesize).toHaveBeenCalledWith(
      'Testing custom voice',
      expect.objectContaining({ voice: 'af_bella' })
    )
  })

  it('handles engine error gracefully', async () => {
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockRejectedValue(new Error('TTS inference failed'))
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    const result = await synthesizer.synthesize('This will fail')
    expect(result).toBeNull()
  })

  it('delegates warmup to underlying engine if available', () => {
    const warmup = vi.fn().mockResolvedValue(undefined)
    const engine = {
      synthesize: vi.fn(),
      warmup
    }
    const synthesizer = new SpeechSynthesizer({ engine })
    synthesizer.warmup()
    expect(warmup).toHaveBeenCalledTimes(1)
  })
})

describe('SpeechSynthesizer.synthesizeStream', () => {
  it('yields chunks in order with incrementing index', async () => {
    const stream = vi.fn(async function* () {
      yield { text: 'one', audio: new Uint8Array([1]) }
      yield { text: 'two', audio: new Uint8Array([2]) }
      yield { text: 'three', audio: new Uint8Array([3]) }
    })
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn(),
      stream
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    const chunks = []
    for await (const chunk of synthesizer.synthesizeStream('one two three')) {
      chunks.push(chunk)
    }

    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2])
    expect(chunks.map((chunk) => chunk.text)).toEqual(['one', 'two', 'three'])
    expect(chunks.map((chunk) => Array.from(chunk.audio))).toEqual([[1], [2], [3]])
    expect(stream).toHaveBeenCalledWith('one two three', { voice: 'af_heart', speed: 1.0 })
  })

  it('yields the first chunk before the second one is produced (true streaming)', async () => {
    let releaseSecondChunk: () => void = () => {}
    const secondChunkGate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve
    })
    let secondProduced = false

    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn(),
      stream: async function* () {
        yield { text: 'First sentence.', audio: new Uint8Array([1]) }
        await secondChunkGate
        secondProduced = true
        yield { text: 'Second sentence.', audio: new Uint8Array([2]) }
      }
    }
    const synthesizer = new SpeechSynthesizer({ engine })
    const iterator = synthesizer
      .synthesizeStream('First sentence. Second sentence.')
      [Symbol.asyncIterator]()

    const first = await iterator.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual({
      index: 0,
      text: 'First sentence.',
      audio: new Uint8Array([1])
    })
    expect(secondProduced).toBe(false)

    releaseSecondChunk()
    const second = await iterator.next()
    expect(second.done).toBe(false)
    expect(second.value).toEqual({
      index: 1,
      text: 'Second sentence.',
      audio: new Uint8Array([2])
    })
    expect(secondProduced).toBe(true)
  })

  it('yields no chunks for blank text', async () => {
    const stream = vi.fn(async function* () {
      yield { text: 'never', audio: new Uint8Array([1]) }
    })
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(new Uint8Array([1])),
      stream
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    for (const text of ['', '   ', '\t\n ']) {
      const chunks = []
      for await (const chunk of synthesizer.synthesizeStream(text)) {
        chunks.push(chunk)
      }
      expect(chunks).toEqual([])
    }

    expect(stream).not.toHaveBeenCalled()
    expect(engine.synthesize).not.toHaveBeenCalled()
  })

  it('falls back to a single synthesize chunk when engine has no stream', async () => {
    const audio = new Uint8Array([9, 9])
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(audio)
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    const chunks = []
    for await (const chunk of synthesizer.synthesizeStream('  Hello world  ')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ index: 0, text: 'Hello world', audio }])
    expect(engine.synthesize).toHaveBeenCalledWith('Hello world', {
      voice: 'af_heart',
      speed: 1.0
    })
  })

  it('yields nothing in fallback when synthesize returns null', async () => {
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn().mockResolvedValue(null)
    }
    const synthesizer = new SpeechSynthesizer({ engine })

    const chunks = []
    for await (const chunk of synthesizer.synthesizeStream('Hello world')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([])
  })

  it('propagates stream errors after already-yielded chunks', async () => {
    const engine: SpeechSynthesizerEngine = {
      synthesize: vi.fn(),
      stream: async function* () {
        yield { text: 'Chunk one.', audio: new Uint8Array([1]) }
        throw new Error('stream boom')
      }
    }
    const synthesizer = new SpeechSynthesizer({ engine })
    const iterator = synthesizer.synthesizeStream('Chunk one.')[Symbol.asyncIterator]()

    const first = await iterator.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual({
      index: 0,
      text: 'Chunk one.',
      audio: new Uint8Array([1])
    })

    await expect(iterator.next()).rejects.toThrow('stream boom')
  })
})

const mockFromPretrained = vi.fn()

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: (...args: unknown[]) => mockFromPretrained(...args)
  }
}))

const SCREENSHOT_TEXT =
  "I'm Kestrel, your executive voice assistant on Windows. Think of me as a friendly, always-on-hand helper who can open apps, search files, check the weather, type for you, and even pull up information from Notion—all with a simple voice command. I'm here to keep your day running smoothly, so just tell me what you need and I'll take care of it."

/** Minimal mono int16 WAV writer with a trailing data chunk. */
function encodeMonoWav(sampleRate: number, samples: Float32Array): Uint8Array {
  const dataSize = samples.length * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)

  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index)
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, Math.round(clamped * 0x7fff), true)
  }

  return bytes
}

function toneThenSilence(
  sampleRate: number,
  toneSeconds: number,
  silenceSeconds: number
): Float32Array {
  const toneFrames = Math.round(sampleRate * toneSeconds)
  const silenceFrames = Math.round(sampleRate * silenceSeconds)
  const samples = new Float32Array(toneFrames + silenceFrames)

  for (let index = 0; index < toneFrames; index += 1) {
    samples[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)
  }

  return samples
}

describe('resolveDefaultKokoroModelId', () => {
  it('returns default Hugging Face model id when not packaged', () => {
    expect(resolveDefaultKokoroModelId()).toBe(DEFAULT_KOKORO_MODEL_ID)
  })
})

describe('KokoroSynthesizerEngine', () => {
  it('defaults to resolved default model id and allows custom modelId', () => {
    const defaultEngine = new KokoroSynthesizerEngine()
    expect((defaultEngine as unknown as { modelId: string }).modelId).toBe(DEFAULT_KOKORO_MODEL_ID)

    const customEngine = new KokoroSynthesizerEngine({ modelId: 'custom/model-path' })
    expect((customEngine as unknown as { modelId: string }).modelId).toBe('custom/model-path')
  })

  it('defaults device to null when not specified', () => {
    const engine = new KokoroSynthesizerEngine()
    expect((engine as unknown as { device: unknown }).device).toBeNull()
  })

  it('preserves explicitly configured device', () => {
    const engineCpu = new KokoroSynthesizerEngine({ device: 'cpu' })
    expect((engineCpu as unknown as { device: unknown }).device).toBe('cpu')

    const engineDml = new KokoroSynthesizerEngine({ device: 'dml' })
    expect((engineDml as unknown as { device: unknown }).device).toBe('dml')

    const engineWasm = new KokoroSynthesizerEngine({ device: 'wasm' })
    expect((engineWasm as unknown as { device: unknown }).device).toBe('wasm')

    const engineNull = new KokoroSynthesizerEngine({ device: null })
    expect((engineNull as unknown as { device: unknown }).device).toBeNull()
  })

  it('passes device null to KokoroTTS.from_pretrained by default', async () => {
    const fakeWavBuffer = new Uint8Array([5, 6, 7]).buffer
    const mockModel = {
      generate: vi.fn().mockResolvedValue({
        toWav: () => fakeWavBuffer
      })
    }
    mockFromPretrained.mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine()
    const audio = await engine.synthesize('Testing default device')

    expect(mockFromPretrained).toHaveBeenCalledWith('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: null
    })
    expect(audio).toBeInstanceOf(Uint8Array)
    expect(Array.from(audio ?? [])).toEqual([5, 6, 7])
  })

  it('passes configured device dml to KokoroTTS.from_pretrained', async () => {
    const fakeWavBuffer = new Uint8Array([8, 9]).buffer
    const mockModel = {
      generate: vi.fn().mockResolvedValue({
        toWav: () => fakeWavBuffer
      })
    }
    mockFromPretrained.mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ device: 'dml' })
    await engine.synthesize('Testing dml device')

    expect(mockFromPretrained).toHaveBeenCalledWith('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'dml'
    })
  })

  it('loads model lazily and converts generated audio to WAV Uint8Array', async () => {
    const fakeWavBuffer = new Uint8Array([1, 2, 3, 4]).buffer
    const mockModel = {
      generate: vi.fn().mockResolvedValue({
        toWav: () => fakeWavBuffer
      })
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    expect(mockLoader).not.toHaveBeenCalled()

    const audio = await engine.synthesize('Hello from Kokoro', { voice: 'af_heart' })
    expect(mockLoader).toHaveBeenCalledTimes(1)
    expect(mockModel.generate).toHaveBeenCalledWith('Hello from Kokoro', {
      voice: 'af_heart',
      speed: 1.0
    })
    expect(audio).toBeInstanceOf(Uint8Array)
    expect(Array.from(audio ?? [])).toEqual([1, 2, 3, 4])
  })

  it('sanitizes text, splits into balanced chunks, calls model.generate() sequentially without calling model.stream()', async () => {
    const firstWav = new Uint8Array([1, 2]).buffer
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => firstWav }),
      stream: vi.fn()
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const input = '## Hello **world**! [Visit us](https://example.com)?'
    const chunks = []
    for await (const chunk of engine.stream(input, { voice: 'af_bella', speed: 1.25 })) {
      chunks.push(chunk)
    }

    expect(mockLoader).toHaveBeenCalledTimes(1)
    expect(mockModel.stream).not.toHaveBeenCalled()
    expect(mockModel.generate).toHaveBeenCalledTimes(1)
    expect(mockModel.generate).toHaveBeenNthCalledWith(1, 'Hello world! Visit us?', {
      voice: 'af_bella',
      speed: 1.25
    })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('Hello world! Visit us?')
    expect(Array.from(chunks[0].audio)).toEqual([1, 2])
  })

  it('streams the balanced splitSpeechChunks in order', async () => {
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => new Uint8Array([1]).buffer }),
      stream: vi.fn()
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const chunks = []
    for await (const chunk of engine.stream(SCREENSHOT_TEXT)) {
      chunks.push(chunk)
    }

    const expected = splitSpeechChunks(SCREENSHOT_TEXT)
    expect(expected).toHaveLength(6)
    expect(chunks.map((chunk) => chunk.text)).toEqual(expected)
    expect(mockModel.generate.mock.calls.map((call) => call[0])).toEqual(expected)
    expect(chunks.map((chunk) => chunk.text).join(' ')).toBe(
      sanitizeSpeechText(SCREENSHOT_TEXT).replace(/\s+/g, ' ').trim()
    )
  })

  it('trims trailing silence from each streamed chunk', async () => {
    const sampleRate = 16000
    const wav = encodeMonoWav(sampleRate, toneThenSilence(sampleRate, 0.2, 0.8))
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => wav.buffer as ArrayBuffer }),
      stream: vi.fn()
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const chunks = []
    for await (const chunk of engine.stream('Hello there.')) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(1)
    expect(chunks[0].audio.length).toBeLessThan(wav.length)
    expect(wavDurationMs(chunks[0].audio)).toBeCloseTo(300, 0)
  })

  it('trims trailing silence in the single-shot synthesize path', async () => {
    const sampleRate = 16000
    const wav = encodeMonoWav(sampleRate, toneThenSilence(sampleRate, 0.2, 0.8))
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => wav.buffer as ArrayBuffer })
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const audio = await engine.synthesize('Hello there.')

    expect(audio).not.toBeNull()
    expect((audio as Uint8Array).length).toBeLessThan(wav.length)
    expect(wavDurationMs(audio as Uint8Array)).toBeCloseTo(300, 0)
  })

  it('runs one real warm-up generation and reuses the same promise', async () => {
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => new Uint8Array([1]).buffer })
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const first = engine.warmup()
    const second = engine.warmup()

    expect(second).toBe(first)
    await Promise.all([first, second])

    expect(mockLoader).toHaveBeenCalledTimes(1)
    expect(mockModel.generate).toHaveBeenCalledTimes(1)
    expect(mockModel.generate).toHaveBeenCalledWith('Ready.', { voice: 'af_heart', speed: 1.0 })
  })

  it('ignores a failed warm-up instead of rejecting', async () => {
    const mockLoader = vi.fn().mockRejectedValue(new Error('model load failed'))
    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })

    await expect(engine.warmup()).resolves.toBeUndefined()
  })

  it('awaits an in-flight warm-up before generating the first real chunk', async () => {
    let releaseWarmup: () => void = () => {}
    const warmupGate = new Promise<void>((resolve) => {
      releaseWarmup = resolve
    })
    const calls: string[] = []

    const mockModel = {
      generate: vi.fn(async (input: string) => {
        calls.push(input)
        if (input === 'Ready.') {
          await warmupGate
        }
        return { toWav: () => new Uint8Array([1]).buffer }
      })
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const warmup = engine.warmup()
    const iterator = engine.stream('Hello there.')[Symbol.asyncIterator]()
    const first = iterator.next()

    // Let the warm-up reach its gated generation.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(['Ready.'])

    releaseWarmup()
    await warmup

    const result = await first
    expect(calls).toEqual(['Ready.', 'Hello there.'])
    expect(result.done).toBe(false)
    expect(result.value?.text).toBe('Hello there.')
  })

  it('does not start a warm-up on its own when warmup() was never called', async () => {
    const generate = vi.fn().mockResolvedValue({ toWav: () => new Uint8Array([1]).buffer })
    const mockLoader = vi.fn().mockResolvedValue({ generate })

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const chunks = []
    for await (const chunk of engine.stream('Hello there.')) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(1)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledWith('Hello there.', { voice: undefined, speed: 1.0 })
    expect(generate.mock.calls.map((call) => call[0])).not.toContain('Ready.')
  })

  it('yields nothing and does not call model.generate() when text is empty after sanitization', async () => {
    const mockModel = {
      generate: vi.fn(),
      stream: vi.fn()
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const chunks = []
    for await (const chunk of engine.stream('   ** **   ')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([])
    expect(mockModel.generate).not.toHaveBeenCalled()
    expect(mockModel.stream).not.toHaveBeenCalled()
  })

  it('yields a single chunk when input has only one sentence', async () => {
    const fakeWav = new Uint8Array([7, 8, 9]).buffer
    const mockModel = {
      generate: vi.fn().mockResolvedValue({ toWav: () => fakeWav }),
      stream: vi.fn()
    }
    const mockLoader = vi.fn().mockResolvedValue(mockModel)

    const engine = new KokoroSynthesizerEngine({ loader: mockLoader })
    const chunks = []
    for await (const chunk of engine.stream('Single sentence.')) {
      chunks.push(chunk)
    }

    expect(mockModel.generate).toHaveBeenCalledTimes(1)
    expect(mockModel.generate).toHaveBeenCalledWith('Single sentence.', {
      voice: undefined,
      speed: 1.0
    })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('Single sentence.')
    expect(Array.from(chunks[0].audio)).toEqual([7, 8, 9])
  })
})

describe('sanitizeSpeechText', () => {
  it('returns empty string for empty or falsy text', () => {
    expect(sanitizeSpeechText('')).toBe('')
  })

  it('strips markdown bold, italic, and tildes', () => {
    expect(sanitizeSpeechText('This is **bold**, *italic*, and ~~strikethrough~~.')).toBe(
      'This is bold, italic, and strikethrough.'
    )
  })

  it('strips markdown headings (#, ##, ###)', () => {
    expect(sanitizeSpeechText('## Heading 2\nSome content\n### Heading 3')).toBe(
      'Heading 2\nSome content\nHeading 3'
    )
  })

  it('converts markdown links to just the link text', () => {
    expect(
      sanitizeSpeechText('Visit [Google](https://google.com) and [GitHub](https://github.com).')
    ).toBe('Visit Google and GitHub.')
  })

  it('strips code fences and inline backticks', () => {
    const raw = '```typescript\nconst x = 42;\n```\nRun `npm test` next.'
    expect(sanitizeSpeechText(raw)).toBe('const x = 42;\nRun npm test next.')
  })
})

describe('splitSpeechSentences', () => {
  it('returns empty array for empty or whitespace text', () => {
    expect(splitSpeechSentences('')).toEqual([])
    expect(splitSpeechSentences('   \n\t  ')).toEqual([])
  })

  it('splits on periods, exclamation marks, and question marks', () => {
    const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.'
    expect(splitSpeechSentences(text)).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third sentence?',
      'Fourth sentence.'
    ])
  })

  it('splits on newlines while ignoring empty chunks', () => {
    const text = 'Line one\n\nLine two.\nLine three!'
    expect(splitSpeechSentences(text)).toEqual(['Line one', 'Line two.', 'Line three!'])
  })

  it('preserves decimals without splitting them', () => {
    const text = 'The price is 3.50 dollars. Version 2.0 is out!'
    expect(splitSpeechSentences(text)).toEqual(['The price is 3.50 dollars.', 'Version 2.0 is out!'])
  })

  it('returns a single sentence if no split points exist', () => {
    expect(splitSpeechSentences('Just a single sentence without punctuation')).toEqual([
      'Just a single sentence without punctuation'
    ])
  })
})

