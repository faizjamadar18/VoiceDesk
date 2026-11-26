import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_DICTATION_SETTINGS, normalizeDictationSettings } from '../shared/dictation'
import { DEFAULT_DICTATION_HOTKEY } from '../shared/types'
import type { AsrMode, KestrelSettings } from '../shared/types'
import { parseHotkey } from './hotkey'

export type { AsrMode, KestrelSettings }

export const DEFAULT_SETTINGS: KestrelSettings = {
  hotkey: 'Control+Alt',
  dictationHotkey: DEFAULT_DICTATION_HOTKEY,
  asrMode: 'nemo',
  dictation: DEFAULT_DICTATION_SETTINGS
}

/**
 * Older installs stored `Control+Space`, which the Windows IME owns and which
 * leaks a literal Space into the focused app. Rewrite only that exact value.
 */
function migrateHotkey(hotkey: string): string {
  return hotkey === 'Control+Space' ? 'Control+Alt' : hotkey
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
    if (!this.exists()) return this.normalize({})

    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<KestrelSettings>
      return this.normalize(raw)
    } catch (error) {
      console.warn(`[settings] could not read ${this.filePath}:`, error)
      return this.normalize({})
    }
  }

  save(patch: Partial<KestrelSettings>): KestrelSettings {
    const next = this.normalize({ ...this.load(), ...patch })

    if (typeof patch.hotkey === 'string' && parseHotkey(patch.hotkey) === null) {
      throw new Error('Use a key combination, for example Control+Alt or Alt+F8.')
    }
    if (typeof patch.dictationHotkey === 'string' && parseHotkey(patch.dictationHotkey) === null) {
      throw new Error('Use a key combination, for example Control+Shift or Alt+Shift.')
    }

    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  private normalize(raw: Partial<KestrelSettings>): KestrelSettings {
    const storedHotkey = typeof raw.hotkey === 'string' ? migrateHotkey(raw.hotkey) : null
    const hotkey =
      storedHotkey !== null && parseHotkey(storedHotkey) !== null
        ? storedHotkey
        : DEFAULT_SETTINGS.hotkey
    const dictationHotkey =
      typeof raw.dictationHotkey === 'string' && parseHotkey(raw.dictationHotkey) !== null
        ? raw.dictationHotkey
        : DEFAULT_SETTINGS.dictationHotkey
    const asrMode: AsrMode = raw.asrMode === 'fake' ? 'fake' : DEFAULT_SETTINGS.asrMode
    return {
      hotkey,
      ...(dictationHotkey ? { dictationHotkey } : {}),
      asrMode,
      dictation: normalizeDictationSettings(raw.dictation)
    }
  }
}
