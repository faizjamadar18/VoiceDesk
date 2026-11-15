import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_DICTATION_HOTKEY } from '../shared/types'
import { parseHotkey } from './hotkey'

export type AsrMode = 'nemo' | 'fake'

export interface KestrelSettings {
  hotkey: string
  dictationHotkey?: string
  asrMode: AsrMode
}


export const DEFAULT_SETTINGS: KestrelSettings = {
  hotkey: 'Control+Space',
  dictationHotkey: DEFAULT_DICTATION_HOTKEY,
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
    if (typeof patch.dictationHotkey === 'string' && parseHotkey(patch.dictationHotkey) === null) {
      throw new Error('Use a modifier plus a key, for example Control+Shift or Alt+Shift.')
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
    const dictationHotkey =
      typeof raw.dictationHotkey === 'string' && parseHotkey(raw.dictationHotkey) !== null
        ? raw.dictationHotkey
        : DEFAULT_SETTINGS.dictationHotkey
    const asrMode: AsrMode = raw.asrMode === 'fake' ? 'fake' : DEFAULT_SETTINGS.asrMode
    return {
      hotkey,
      ...(dictationHotkey ? { dictationHotkey } : {}),
      asrMode
    }
  }

}
