type NutModule = typeof import('@nut-tree-fork/nut-js')

/**
 * Reads the text the user has highlighted in the foreground app.
 *
 * Windows (and every other desktop OS) offers no API for "the current
 * selection", so the only portable route is the clipboard: park a sentinel on
 * it, send the copy chord (Ctrl+Insert), and watch for the sentinel to be
 * replaced. Ctrl+Insert is used instead of Ctrl+C because Ctrl+C is SIGINT in a
 * terminal, where pressing the hotkey must never kill the running process. The
 * sentinel is what distinguishes "nothing selected" (clipboard unchanged) from
 * "the clipboard already held exactly that text".
 */

export const MAX_SELECTED_TEXT_CHARS = 100_000

const SENTINEL_PREFIX = '\u200b'
const DEFAULT_POLL_MS = 25
const DEFAULT_TIMEOUT_MS = 300
/** How long the synthetic copy chord may keep echoing through the global hook. */
const INJECTION_SETTLE_MS = 80

export class SelectedTextTooLongError extends Error {
  constructor(length: number) {
    super(
      `Selected text is too long (${length} characters, limit ${MAX_SELECTED_TEXT_CHARS}).`
    )
    this.name = 'SelectedTextTooLongError'
  }
}

/** Folds a multi-line selection onto one line, the way speech needs it. */
export function collapseSelectedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export interface SelectionCaptureDeps {
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
  pressCopy(): Promise<void>
  delay(ms: number): Promise<void>
  now?(): number
}

export interface SelectionCaptureOptions {
  /** How often to look for the copy landing. */
  pollMs?: number
  /** How long to wait for the copy before giving up. */
  timeoutMs?: number
}

export class SelectionCapture {
  private readonly deps: SelectionCaptureDeps
  private readonly pollMs: number
  private readonly timeoutMs: number
  private queue: Promise<void> = Promise.resolve()
  private sentinelSeq = 0
  private injecting = false
  private injectionTimer: NodeJS.Timeout | null = null

  constructor(deps: SelectionCaptureDeps, options: SelectionCaptureOptions = {}) {
    this.deps = deps
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /**
   * True while our own synthetic copy chord (Ctrl+Insert) can still reach the
   * global key hook.
   * The hook uses this to ignore the keyup that would otherwise end a hold the
   * user never released.
   */
  isInjecting(): boolean {
    return this.injecting
  }

  /**
   * Captures the current selection, or null when there is nothing to read.
   *
   * Calls are serialised: one capture owns the clipboard at a time, so a second
   * call cannot overwrite the sentinel the first one is still watching.
   */
  read(): Promise<string | null> {
    const result = this.queue.then(() => this.capture())
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async capture(): Promise<string | null> {
    const previous = (await this.readBestEffort()) ?? ''
    const sentinel = this.nextSentinel()
    let captured: string | null

    try {
      await this.deps.writeClipboard(sentinel)
      this.beginInjection()
      try {
        await this.deps.pressCopy()
      } finally {
        this.finishInjectionSoon()
      }
      captured = await this.pollForChange(sentinel)
    } finally {
      await this.restore(previous)
    }

    if (captured === null) return null

    const collapsed = collapseSelectedText(captured)
    if (!collapsed) return null
    if (collapsed.length > MAX_SELECTED_TEXT_CHARS) {
      throw new SelectedTextTooLongError(collapsed.length)
    }
    return collapsed
  }

  private async pollForChange(sentinel: string): Promise<string | null> {
    const startedAt = this.now()
    const maxPolls = Math.ceil(this.timeoutMs / Math.max(1, this.pollMs)) + 1

    for (let poll = 0; poll < maxPolls; poll += 1) {
      const text = await this.readBestEffort()
      if (text !== null && text !== sentinel) return text
      await this.deps.delay(this.pollMs)
      if (this.now() - startedAt >= this.timeoutMs) return null
    }
    return null
  }

  private async readBestEffort(): Promise<string | null> {
    try {
      return await this.deps.readClipboard()
    } catch {
      // A clipboard read can fail while another app holds it open; treat it as
      // "not readable yet" and let the caller decide what that means.
      return null
    }
  }

  private async restore(text: string): Promise<void> {
    try {
      await this.deps.writeClipboard(text)
    } catch {
      // The user's clipboard is a nicety here; never fail the capture over it.
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private beginInjection(): void {
    if (this.injectionTimer) clearTimeout(this.injectionTimer)
    this.injectionTimer = null
    this.injecting = true
  }

  private finishInjectionSoon(): void {
    if (this.injectionTimer) clearTimeout(this.injectionTimer)
    this.injectionTimer = setTimeout(() => {
      this.injectionTimer = null
      this.injecting = false
    }, INJECTION_SETTLE_MS)
  }

  private nextSentinel(): string {
    this.sentinelSeq += 1
    return `${SENTINEL_PREFIX}kestrel-selection-${this.sentinelSeq}-${Math.random().toString(36).slice(2, 10)}`
  }
}

interface ElectronClipboardLike {
  readText(): string
  writeText(text: string): void
}

/** The subset of nut.js' clipboard this module needs when Electron is absent. */
interface MemoryClipboard {
  text: string
}

/**
 * Wires the selection capture to Electron's clipboard and nut.js' copy chord.
 * nut.js is imported lazily so a native-module failure never breaks app startup.
 */
export function createNativeSelectionCapture(): SelectionCapture {
  let modulePromise: Promise<NutModule> | null = null
  let electronClipboard: ElectronClipboardLike | null | undefined
  const memory: MemoryClipboard = { text: '' }

  const loadNut = (): Promise<NutModule> => {
    modulePromise ??= import('@nut-tree-fork/nut-js')
    return modulePromise
  }

  const resolveClipboard = (): ElectronClipboardLike | null => {
    if (electronClipboard !== undefined) return electronClipboard

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as
        | { clipboard?: ElectronClipboardLike }
        | undefined
      const api = electron?.clipboard
      electronClipboard =
        api && typeof api.readText === 'function' && typeof api.writeText === 'function'
          ? api
          : null
    } catch {
      // Not running inside Electron (tests, tooling); stay in memory.
      electronClipboard = null
    }

    return electronClipboard
  }

  return new SelectionCapture({
    readClipboard: async () => {
      const api = resolveClipboard()
      if (!api) return memory.text
      const text = await api.readText()
      return typeof text === 'string' ? text : ''
    },
    writeClipboard: async (text) => {
      const api = resolveClipboard()
      if (!api) {
        memory.text = text
        return
      }
      await api.writeText(text)
    },
    pressCopy: async () => {
      const { keyboard, Key } = await loadNut()
      keyboard.config.autoDelayMs = 0
      try {
        await keyboard.pressKey(Key.LeftControl, Key.Insert)
      } finally {
        await keyboard.releaseKey(Key.LeftControl, Key.Insert)
      }
    },
    delay: (ms) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
      })
  })
}
