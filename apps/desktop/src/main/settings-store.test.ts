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

  it('defaults dictationHotkey to Control+Shift', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    expect(store.load().dictationHotkey).toBe('Control+Shift')
    expect(DEFAULT_SETTINGS.dictationHotkey).toBe('Control+Shift')
  })

  it('defaults the agent hotkey to Control+Alt', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    expect(store.load().hotkey).toBe('Control+Alt')
    expect(DEFAULT_SETTINGS.hotkey).toBe('Control+Alt')
  })

  it('migrates a stored Control+Space agent hotkey on load', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ hotkey: 'Control+Space', asrMode: 'fake' }), 'utf8')

    const settings = new SettingsStore(file).load()

    expect(settings.hotkey).toBe('Control+Alt')
    expect(settings.asrMode).toBe('fake')
  })

  it('does not migrate other stored agent hotkeys', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ hotkey: 'Alt+F8', asrMode: 'fake' }), 'utf8')

    expect(new SettingsStore(file).load().hotkey).toBe('Alt+F8')
  })

  it('keeps an explicit non-default agent hotkey across a reload', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    store.save({ hotkey: 'Control+Alt+Space' })

    expect(new SettingsStore(file).load().hotkey).toBe('Control+Alt+Space')
  })

  it('saves a modifier-only agent hotkey', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    store.save({ hotkey: 'Alt+Shift' })

    expect(store.load().hotkey).toBe('Alt+Shift')
  })

  it('includes the default dictation settings', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    const settings = store.load()

    expect(settings.dictation).toEqual(DEFAULT_SETTINGS.dictation)
    expect(settings.dictation.polishStyle).toBe('light')
    expect(settings.dictation.writingContexts).toHaveLength(4)
  })

  it('does not share the default dictation objects between loads', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    const first = store.load()
    first.dictation.writingContexts[0].assignedApps.push('Slack')

    expect(store.load().dictation.writingContexts[0].assignedApps).toEqual([])
  })

  it('persists and reloads a valid hotkey and mode', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    const saved = store.save({ hotkey: 'Alt+F8', asrMode: 'fake' })

    expect(saved).toEqual({
      hotkey: 'Alt+F8',
      dictationHotkey: 'Control+Shift',
      asrMode: 'fake',
      dictation: DEFAULT_SETTINGS.dictation
    })
    expect(store.exists()).toBe(true)
    expect(new SettingsStore(file).load()).toEqual(saved)
  })

  it('rejects an invalid hotkey without writing it', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    expect(() => store.save({ hotkey: 'Space' })).toThrow(/key combination/i)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults for corrupt JSON and bad fields', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)

    writeFileSync(file, JSON.stringify({ hotkey: 'A', asrMode: 'cloud' }), 'utf8')
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('loads dictation defaults from a settings file written before dictation existed', () => {
    const { file } = setup()
    writeFileSync(
      file,
      JSON.stringify({ hotkey: 'Alt+F8', dictationHotkey: 'Alt+Shift', asrMode: 'fake' }),
      'utf8'
    )

    const settings = new SettingsStore(file).load()

    expect(settings.hotkey).toBe('Alt+F8')
    expect(settings.dictationHotkey).toBe('Alt+Shift')
    expect(settings.asrMode).toBe('fake')
    expect(settings.dictation).toEqual(DEFAULT_SETTINGS.dictation)
  })

  it('persists a dictation patch and reloads it', () => {
    const { file } = setup()
    const store = new SettingsStore(file)

    store.save({
      dictation: {
        ...DEFAULT_SETTINGS.dictation,
        polishStyle: 'polished',
        activeContextType: 'work_chat',
        spellingEntries: [{ id: 'spell-1', text: 'Kestrel', auto_added: true }],
        showSpellingExamples: false
      }
    })

    const reloaded = new SettingsStore(file).load()

    expect(reloaded.dictation.polishStyle).toBe('polished')
    expect(reloaded.dictation.activeContextType).toBe('work_chat')
    expect(reloaded.dictation.spellingEntries).toEqual([
      { id: 'spell-1', text: 'Kestrel', description: undefined, auto_added: true }
    ])
    expect(reloaded.dictation.showSpellingExamples).toBe(false)
    expect(reloaded.hotkey).toBe(DEFAULT_SETTINGS.hotkey)
  })

  it('normalizes a corrupt dictation value without losing other fields', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ hotkey: 'Alt+F8', asrMode: 'fake', dictation: 'nope' }), 'utf8')

    const settings = new SettingsStore(file).load()

    expect(settings.hotkey).toBe('Alt+F8')
    expect(settings.asrMode).toBe('fake')
    expect(settings.dictation).toEqual(DEFAULT_SETTINGS.dictation)

    writeFileSync(
      file,
      JSON.stringify({ hotkey: 'Alt+F8', asrMode: 'fake', dictation: { polishStyle: 'shiny', activeContextType: 'meeting' } }),
      'utf8'
    )

    const partial = new SettingsStore(file).load()

    expect(partial.hotkey).toBe('Alt+F8')
    expect(partial.asrMode).toBe('fake')
    expect(partial.dictation.polishStyle).toBe('light')
    expect(partial.dictation.activeContextType).toBe('personal_chat')
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
