import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore } from './settings-store'

const directories: string[] = []

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-settings-'))
  directories.push(directory)
  return { directory, file: join(directory, 'settings.json') }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SettingsStore', () => {
  it('returns defaults when the file is missing', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    expect(store.exists()).toBe(false)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists and reloads a valid hotkey and mode', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    const saved = store.save({ hotkey: 'Alt+F8', asrMode: 'fake' })

    expect(saved).toEqual({ hotkey: 'Alt+F8', asrMode: 'fake' })
    expect(store.exists()).toBe(true)
    expect(new SettingsStore(file).load()).toEqual(saved)
  })

  it('rejects an invalid hotkey without writing it', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    expect(() => store.save({ hotkey: 'Space' })).toThrow(/modifier plus a key/i)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults for corrupt JSON and bad fields', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)

    writeFileSync(file, JSON.stringify({ hotkey: 'A', asrMode: 'cloud' }), 'utf8')
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps existing fields when saving a partial patch', () => {
    const { file } = setup()
    const store = new SettingsStore(file)
    store.save({ hotkey: 'Control+Alt+Space', asrMode: 'fake' })

    const saved = store.save({ asrMode: 'nemo' })

    expect(saved.hotkey).toBe('Control+Alt+Space')
    expect(saved.asrMode).toBe('nemo')
  })

  it('migrates the removed whisper mode to the streaming engine', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ asrMode: 'whisper' }), 'utf8')

    expect(new SettingsStore(file).load().asrMode).toBe('nemo')
  })
})
