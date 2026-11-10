import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseHotkey } from './hotkey'

export type AsrMode = 'nemo' | 'fake'

export interface KestrelSettings {
  hotkey: string
  asrMode: AsrMode
}

export const DEFAULT_SETTINGS: KestrelSettings = {
  hotkey: 'Control+Space',
  asrMode: 'nemo'
}

/**
 * Small JSON settings store. Only configuration is persisted here; audio and
 * transcripts stay in memory.
 */
export class SettingsStore {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  exists(): boolean {
    return existsSync(this.filePath)
  }

  load(): KestrelSettings {
    if (!this.exists()) return { ...DEFAULT_SETTINGS }

    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<KestrelSettings>
      return this.normalize(raw)
    } catch (error) {
      console.warn(`[settings] could not read ${this.filePath}:`, error)
      return { ...DEFAULT_SETTINGS }
    }
  }

  save(patch: Partial<KestrelSettings>): KestrelSettings {
    const next = this.normalize({ ...this.load(), ...patch })

    if (typeof patch.hotkey === 'string' && parseHotkey(patch.hotkey) === null) {
      throw new Error('Use a modifier plus a key, for example Control+Space or Alt+F8.')
    }

    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  private normalize(raw: Partial<KestrelSettings>): KestrelSettings {
    const hotkey =
      typeof raw.hotkey === 'string' && parseHotkey(raw.hotkey) !== null
        ? raw.hotkey
        : DEFAULT_SETTINGS.hotkey
    const asrMode: AsrMode = raw.asrMode === 'fake' ? 'fake' : DEFAULT_SETTINGS.asrMode
    return { hotkey, asrMode }
  }
}
