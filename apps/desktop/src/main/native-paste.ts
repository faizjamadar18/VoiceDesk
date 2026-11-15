import type { ClipboardDriver, KeyDispatcher, PasteService } from './dictation/paste'

type NutModule = typeof import('@nut-tree-fork/nut-js')

export const DEFAULT_RESTORE_DELAY_MS = 500

export interface NativePasteServiceOptions {
  clipboard?: ClipboardDriver
  dispatcher?: KeyDispatcher
  restoreDelayMs?: number
  platform?: NodeJS.Platform
}

/** The subset of an Electron `ClipboardItem` this module reads. */
export interface ElectronClipboardItemLike {
  types?: string[]
  getType(type: string): Promise<unknown>
}

/**
 * The W3C-style clipboard surface Electron ships (`readText`/`writeText` as
 * promises, `read`/`write` for rich text). Older sync methods are tolerated
 * because `await` on a non-promise is a no-op.
 */
export interface ElectronClipboardApi {
  readText(): Promise<string> | string
  writeText(text: string): Promise<void> | void
  read?(): Promise<unknown>
  write?(data: unknown[]): Promise<void> | void
}

export type ClipboardItemConstructor = new (items: Record<string, string>) => unknown

/**
 * Adapts an Electron clipboard module to the {@link ClipboardDriver} contract.
 *
 * Electron 45 dropped the synchronous `readHTML()`/`write({ text, html })`
 * helpers in favour of W3C `navigator.clipboard` semantics: rich text flows
 * through `ClipboardItem` and `read()`/`write()`. HTML handling is best-effort
 * so a clipboard hiccup degrades to plain text instead of failing the paste.
 */
export function createElectronClipboardDriver(
  api: ElectronClipboardApi,
  ItemConstructor?: ClipboardItemConstructor
): ClipboardDriver {
  const readHtml = async (): Promise<string | undefined> => {
    try {
      const items = await api.read?.()
      if (!Array.isArray(items)) return undefined
      for (const item of items as ElectronClipboardItemLike[]) {
        if (!item?.types?.includes('text/html')) continue
        const value = await item.getType('text/html')
        if (typeof value === 'string' && value) return value
      }
    } catch {
      // HTML is a nicety; a failed read must not break the snapshot.
    }
    return undefined
  }

  return {
    async read() {
      const text = await api.readText()
      const html = await readHtml()
      return html ? { text, html } : { text }
    },
    async write(snapshot) {
      const text = typeof snapshot === 'string' ? snapshot : snapshot.text
      const html = typeof snapshot === 'string' ? undefined : snapshot.html

      if (html && ItemConstructor && api.write) {
        try {
          await api.write([new ItemConstructor({ 'text/plain': text, 'text/html': html })])
          return
        } catch {
          // Fall through to plain text rather than losing the paste.
        }
      }

      await api.writeText(text)
    }
  }
}

/**
 * Pastes text using clipboard snapshot preservation and synthetic Ctrl+V (or Cmd+V on macOS).
 * nut.js is loaded lazily so a native-module failure only affects dictation, not app startup.
 */
export class NativePasteService implements PasteService {
  private modulePromise: Promise<NutModule> | null = null
  private clipboardDriver: ClipboardDriver | null = null
  private keyDispatcher: KeyDispatcher | null = null
  private readonly restoreDelayMs: number
  private readonly platform: NodeJS.Platform
  private operationId = 0
  private pendingTimer: NodeJS.Timeout | null = null

  constructor(options: NativePasteServiceOptions = {}) {
    this.clipboardDriver = options.clipboard ?? null
    this.keyDispatcher = options.dispatcher ?? null
    this.restoreDelayMs = options.restoreDelayMs ?? DEFAULT_RESTORE_DELAY_MS
    this.platform = options.platform ?? process.platform
  }

  private load(): Promise<NutModule> {
    this.modulePromise ??= import('@nut-tree-fork/nut-js')
    return this.modulePromise
  }

  private getClipboard(): ClipboardDriver {
    if (this.clipboardDriver) return this.clipboardDriver

    // Prefer Electron's clipboard (W3C-style async in Electron 45) when running in the main process.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as
        | { clipboard?: ElectronClipboardApi; ClipboardItem?: ClipboardItemConstructor }
        | undefined

      const api = electron?.clipboard
      if (api && typeof api.readText === 'function' && typeof api.writeText === 'function') {
        this.clipboardDriver = createElectronClipboardDriver(api, electron?.ClipboardItem)
        return this.clipboardDriver
      }
    } catch {
      // Not in electron runtime or require failed; fall back to nut-js
    }

    this.clipboardDriver = {
      read: async () => {
        const { clipboard } = await this.load()
        const text = await clipboard.getContent()
        return { text }
      },
      write: async (s) => {
        const { clipboard } = await this.load()
        const text = typeof s === 'string' ? s : s.text
        await clipboard.setContent(text)
      }
    }
    return this.clipboardDriver
  }

  private getDispatcher(): KeyDispatcher {
    if (this.keyDispatcher) return this.keyDispatcher

    this.keyDispatcher = {
      paste: async () => {
        const { keyboard, Key } = await this.load()
        keyboard.config.autoDelayMs = 0
        const modifier = this.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl
        try {
          await keyboard.pressKey(modifier, Key.V)
        } finally {
          await keyboard.releaseKey(modifier, Key.V)
        }
      }
    }
    return this.keyDispatcher
  }

  async paste(text: string): Promise<void> {
    if (!text.trim()) {
      throw new Error('Refusing to paste empty text.')
    }

    const clipboard = this.getClipboard()
    const dispatcher = this.getDispatcher()

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }

    this.operationId++
    const currentOp = this.operationId

    const previous = await clipboard.read()

    await clipboard.write(text)

    await dispatcher.paste()

    if (this.restoreDelayMs > 0) {
      this.pendingTimer = setTimeout(async () => {
        if (this.operationId !== currentOp) return
        try {
          const current = await clipboard.read()
          // Only restore if user hasn't overwritten the clipboard with something else
          if (current.text === text) {
            await clipboard.write(previous)
          }
        } catch {
          // Ignore error during clipboard restore
        }
      }, this.restoreDelayMs)
    }
  }
}
