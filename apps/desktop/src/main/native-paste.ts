import type { PasteService } from './dictation/paste'

type NutModule = typeof import('@nut-tree-fork/nut-js')

/**
 * Pastes text with the system clipboard and a synthetic Ctrl+V. nut.js is
 * loaded lazily so a native-module failure only affects dictation, not app
 * startup.
 */
export class NativePasteService implements PasteService {
  private modulePromise: Promise<NutModule> | null = null

  private load(): Promise<NutModule> {
    this.modulePromise ??= import('@nut-tree-fork/nut-js')
    return this.modulePromise
  }

  async paste(text: string): Promise<void> {
    if (!text.trim()) {
      throw new Error('Refusing to paste empty text.')
    }

    const { clipboard, keyboard, Key } = await this.load()
    keyboard.config.autoDelayMs = 0

    await clipboard.setContent(text)
    try {
      await keyboard.pressKey(Key.LeftControl, Key.V)
    } finally {
      await keyboard.releaseKey(Key.LeftControl, Key.V)
    }
  }
}
