import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SELECTED_TEXT_CHARS,
  SelectedTextTooLongError,
  SelectionCapture,
  collapseSelectedText,
  type SelectionCaptureDeps
} from './selection-capture'

const SENTINEL_PREFIX = '\u200b'

/** Virtual time: every delay advances the clock instead of waiting. */
class FakeClock {
  time = 0

  now = (): number => this.time

  delay = async (ms: number): Promise<void> => {
    this.time += ms
  }
}

/**
 * Clipboard double that models the part a real clipboard cannot tell us:
 * the copy chord only lands when the foreground app had something selected.
 */
class FakeClipboard {
  readonly events: string[] = []
  readonly writes: string[] = []
  value: string
  presses = 0
  copyError: Error | null = null
  /** What the copy chord puts on the clipboard; null models "nothing selected". */
  copied: string | null = null
  /** How many clipboard reads pass before the copy lands. */
  landAfterReads = 0
  private pending: string | null = null
  private readsUntilLand = 0

  constructor(initial = '') {
    this.value = initial
  }

  async readClipboard(): Promise<string> {
    this.events.push('read')
    if (this.pending !== null) {
      if (this.readsUntilLand <= 0) {
        this.value = this.pending
        this.pending = null
      } else {
        this.readsUntilLand -= 1
      }
    }
    return this.value
  }

  async writeClipboard(text: string): Promise<void> {
    this.events.push(text.startsWith(SENTINEL_PREFIX) ? 'write:sentinel' : `write:${text}`)
    this.writes.push(text)
    this.value = text
  }

  async pressCopy(): Promise<void> {
    this.events.push('press')
    this.presses += 1
    if (this.copyError) throw this.copyError
    if (this.copied !== null) {
      this.pending = this.copied
      this.readsUntilLand = this.landAfterReads
    }
  }
}

function setup(
  options: {
    clipboard?: string
    copied?: string | null
    landAfterReads?: number
    pollMs?: number
    timeoutMs?: number
  } = {}
) {
  const clock = new FakeClock()
  const clipboard = new FakeClipboard(options.clipboard ?? '')
  clipboard.copied = options.copied ?? null
  clipboard.landAfterReads = options.landAfterReads ?? 0
  const deps: SelectionCaptureDeps = {
    readClipboard: () => clipboard.readClipboard(),
    writeClipboard: (text) => clipboard.writeClipboard(text),
    pressCopy: () => clipboard.pressCopy(),
    delay: clock.delay,
    now: clock.now
  }
  const capture = new SelectionCapture(deps, {
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs
  })
  return { clock, clipboard, capture }
}

describe('collapseSelectedText', () => {
  it('folds runs of whitespace into single spaces and trims the ends', () => {
    expect(collapseSelectedText('  a\n\nb\t c  ')).toBe('a b c')
  })
})

describe('SelectionCapture', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the text the foreground app copied after the copy chord', async () => {
    const { clipboard, capture } = setup({
      clipboard: 'old clipboard',
      copied: 'Hello there'
    })

    await expect(capture.read()).resolves.toBe('Hello there')

    expect(clipboard.presses).toBe(1)
    expect(clipboard.events).toEqual([
      'read',
      'write:sentinel',
      'press',
      'read',
      'write:old clipboard'
    ])
  })

  it('keeps polling until a slow copy lands', async () => {
    const { clipboard, capture } = setup({
      clipboard: 'old clipboard',
      copied: 'late text',
      landAfterReads: 3,
      pollMs: 25,
      timeoutMs: 300
    })

    await expect(capture.read()).resolves.toBe('late text')

    expect(clipboard.events.filter((event) => event === 'read')).toHaveLength(5)
    expect(clipboard.value).toBe('old clipboard')
  })

  it('returns null when nothing was selected and restores the clipboard', async () => {
    const { clock, clipboard, capture } = setup({
      clipboard: 'old clipboard',
      copied: null,
      pollMs: 25,
      timeoutMs: 300
    })

    await expect(capture.read()).resolves.toBeNull()

    expect(clock.time).toBe(300)
    expect(clipboard.value).toBe('old clipboard')
  })

  it('returns null for a whitespace-only selection', async () => {
    const { clipboard, capture } = setup({
      clipboard: 'old clipboard',
      copied: ' \n\t  \n '
    })

    await expect(capture.read()).resolves.toBeNull()
    expect(clipboard.value).toBe('old clipboard')
  })

  it('collapses a multi-line selection onto one line', async () => {
    const { capture } = setup({
      copied: '  first line\n\n  second\tline  '
    })

    await expect(capture.read()).resolves.toBe('first line second line')
  })

  it('throws SelectedTextTooLongError above the character cap', async () => {
    const { clipboard, capture } = setup({
      clipboard: 'old clipboard',
      copied: 'a'.repeat(MAX_SELECTED_TEXT_CHARS + 1)
    })

    await expect(capture.read()).rejects.toBeInstanceOf(SelectedTextTooLongError)
    expect(clipboard.value).toBe('old clipboard')
  })

  it('accepts a selection exactly at the character cap', async () => {
    const text = 'a'.repeat(MAX_SELECTED_TEXT_CHARS)
    const { capture } = setup({ copied: text })

    await expect(capture.read()).resolves.toBe(text)
  })

  it('restores the clipboard when the clipboard cannot be written', async () => {
    const clock = new FakeClock()
    let writeAttempt = 0
    const capture = new SelectionCapture(
      {
        readClipboard: async () => 'old clipboard',
        writeClipboard: async () => {
          writeAttempt += 1
          throw new Error('clipboard is locked')
        },
        pressCopy: async () => undefined,
        delay: clock.delay,
        now: clock.now
      },
      { timeoutMs: 50, pollMs: 10 }
    )

    await expect(capture.read()).rejects.toThrow('clipboard is locked')
    expect(writeAttempt).toBe(2)
  })

  it('restores the clipboard when the copy chord cannot be dispatched', async () => {
    const { clipboard, capture } = setup({ clipboard: 'old clipboard', copied: 'text' })
    clipboard.copyError = new Error('no foreground window')

    await expect(capture.read()).rejects.toThrow('no foreground window')
    expect(clipboard.value).toBe('old clipboard')
  })

  it('runs concurrent reads one at a time so the clipboard is never interleaved', async () => {
    const { clipboard, capture } = setup({
      clipboard: 'original',
      copied: 'picked',
      landAfterReads: 2,
      pollMs: 25,
      timeoutMs: 300
    })

    const reads = await Promise.all([capture.read(), capture.read()])

    expect(reads).toEqual(['picked', 'picked'])
    expect(clipboard.presses).toBe(2)

    const pressIndexes = clipboard.events.flatMap((event, index) =>
      event === 'press' ? [index] : []
    )
    const firstRestore = clipboard.events.indexOf('write:original')
    expect(firstRestore).toBeGreaterThan(pressIndexes[0])
    expect(pressIndexes[1]).toBeGreaterThan(firstRestore)
  })

  it('reports injecting from the copy chord until 80ms after it settles', async () => {
    vi.useFakeTimers()
    const { capture } = setup({ clipboard: 'old clipboard', copied: 'picked' })

    expect(capture.isInjecting()).toBe(false)

    await capture.read()
    expect(capture.isInjecting()).toBe(true)

    await vi.advanceTimersByTimeAsync(79)
    expect(capture.isInjecting()).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(capture.isInjecting()).toBe(false)
  })

  it('stops reporting injecting after the copy chord throws', async () => {
    vi.useFakeTimers()
    const { clipboard, capture } = setup({ clipboard: 'old clipboard', copied: 'text' })
    clipboard.copyError = new Error('no foreground window')

    await expect(capture.read()).rejects.toThrow('no foreground window')
    expect(capture.isInjecting()).toBe(true)

    await vi.advanceTimersByTimeAsync(80)
    expect(capture.isInjecting()).toBe(false)
  })
})
