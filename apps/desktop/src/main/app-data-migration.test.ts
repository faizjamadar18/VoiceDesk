import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateUserData } from './app-data-migration'

const roots: string[] = []

function setup(): { root: string; legacyDir: string; currentDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'voicedesk-migrate-'))
  roots.push(root)
  return { root, legacyDir: join(root, 'VoiceOS'), currentDir: join(root, 'VoiceDesk') }
}

function seedLegacy(legacyDir: string): void {
  mkdirSync(join(legacyDir, 'history'), { recursive: true })
  writeFileSync(join(legacyDir, 'kestrel-settings.json'), '{"hotkey":"Control+Alt"}')
  writeFileSync(join(legacyDir, 'kestrel.db'), 'legacy database')
  writeFileSync(join(legacyDir, 'history', 'session.json'), 'legacy session')
}

function seedElectronScaffolding(dir: string): void {
  mkdirSync(join(dir, 'Cache'), { recursive: true })
  writeFileSync(join(dir, 'Local State'), '{"scaffolding":true}')
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('migrateUserData', () => {
  it('copies the legacy contents when the current directory does not exist', () => {
    const { legacyDir, currentDir } = setup()
    seedLegacy(legacyDir)

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'kestrel-settings.json'), 'utf8')).toBe(
      '{"hotkey":"Control+Alt"}'
    )
    expect(readFileSync(join(currentDir, 'kestrel.db'), 'utf8')).toBe('legacy database')
    expect(readFileSync(join(currentDir, 'history', 'session.json'), 'utf8')).toBe(
      'legacy session'
    )
    // The old folder stays in place as a fallback.
    expect(readFileSync(join(legacyDir, 'kestrel-settings.json'), 'utf8')).toBe(
      '{"hotkey":"Control+Alt"}'
    )
  })

  it('copies the legacy contents when the current directory exists but is empty', () => {
    const { legacyDir, currentDir } = setup()
    seedLegacy(legacyDir)
    mkdirSync(currentDir)

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'kestrel.db'), 'utf8')).toBe('legacy database')
    expect(readFileSync(join(currentDir, 'history', 'session.json'), 'utf8')).toBe(
      'legacy session'
    )
  })

  it('copies app data when the current directory only has Electron scaffolding', () => {
    const { legacyDir, currentDir } = setup()
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, 'voiceos.db'), 'legacy database')
    writeFileSync(join(legacyDir, 'config.json'), '{"theme":"dark"}')
    seedElectronScaffolding(currentDir)

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'voiceos.db'), 'utf8')).toBe('legacy database')
    expect(readFileSync(join(currentDir, 'config.json'), 'utf8')).toBe('{"theme":"dark"}')
    // Electron's own scaffolding is kept.
    expect(existsSync(join(currentDir, 'Cache'))).toBe(true)
    expect(readFileSync(join(currentDir, 'Local State'), 'utf8')).toBe('{"scaffolding":true}')
  })

  it('does not copy when the current directory already has a kestrel settings file', () => {
    const { legacyDir, currentDir } = setup()
    seedLegacy(legacyDir)
    mkdirSync(currentDir)
    writeFileSync(join(currentDir, 'kestrel-settings.json'), '{"hotkey":"Alt+F8"}')

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({
      migrated: false,
      outcome: 'skipped-existing-data',
      copiedFrom: []
    })
    expect(readFileSync(join(currentDir, 'kestrel-settings.json'), 'utf8')).toBe(
      '{"hotkey":"Alt+F8"}'
    )
    expect(() => readFileSync(join(currentDir, 'kestrel.db'))).toThrow()
  })

  it('does not copy when the current directory already has config.json', () => {
    const { legacyDir, currentDir } = setup()
    seedLegacy(legacyDir)
    mkdirSync(currentDir)
    writeFileSync(join(currentDir, 'config.json'), '{"theme":"light"}')

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({
      migrated: false,
      outcome: 'skipped-existing-data',
      copiedFrom: []
    })
    expect(readFileSync(join(currentDir, 'config.json'), 'utf8')).toBe('{"theme":"light"}')
    expect(() => readFileSync(join(currentDir, 'kestrel.db'))).toThrow()
  })

  it('only treats app data at the top level as existing data', () => {
    const { legacyDir, currentDir } = setup()
    seedLegacy(legacyDir)
    mkdirSync(join(currentDir, 'history'), { recursive: true })
    writeFileSync(join(currentDir, 'history', 'voiceos.db'), 'nested database')

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'kestrel.db'), 'utf8')).toBe('legacy database')
    expect(readFileSync(join(currentDir, 'history', 'voiceos.db'), 'utf8')).toBe(
      'nested database'
    )
  })

  it('never overwrites the current Local State file, but does copy the app data', () => {
    const { legacyDir, currentDir } = setup()
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, 'voiceos.db'), 'legacy database')
    writeFileSync(join(legacyDir, 'Local State'), 'legacy local state')
    seedElectronScaffolding(currentDir)
    const before = readFileSync(join(currentDir, 'Local State'))

    const result = migrateUserData({ legacyDirs: [legacyDir], currentDir })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'Local State'))).toEqual(before)
    expect(readFileSync(join(currentDir, 'voiceos.db'), 'utf8')).toBe('legacy database')
  })

  it('merges missing files from every legacy directory in order', () => {
    const { root, currentDir } = setup()
    const firstLegacyDir = join(root, 'legacy-first')
    const secondLegacyDir = join(root, 'legacy-second')
    mkdirSync(firstLegacyDir, { recursive: true })
    mkdirSync(secondLegacyDir, { recursive: true })
    writeFileSync(join(firstLegacyDir, 'voiceos.db'), 'first database')
    writeFileSync(join(secondLegacyDir, 'config.json'), '{"theme":"dark"}')

    const result = migrateUserData({
      legacyDirs: [firstLegacyDir, secondLegacyDir],
      currentDir
    })

    expect(result).toEqual({
      migrated: true,
      outcome: 'copied',
      copiedFrom: [firstLegacyDir, secondLegacyDir]
    })
    expect(readFileSync(join(currentDir, 'voiceos.db'), 'utf8')).toBe('first database')
    expect(readFileSync(join(currentDir, 'config.json'), 'utf8')).toBe('{"theme":"dark"}')
  })

  it('keeps the first legacy directory version when both have the same file', () => {
    const { root, currentDir } = setup()
    const firstLegacyDir = join(root, 'legacy-first')
    const secondLegacyDir = join(root, 'legacy-second')
    mkdirSync(firstLegacyDir, { recursive: true })
    mkdirSync(secondLegacyDir, { recursive: true })
    writeFileSync(join(firstLegacyDir, 'voiceos.db'), 'first database')
    writeFileSync(join(secondLegacyDir, 'voiceos.db'), 'second database')

    const result = migrateUserData({
      legacyDirs: [firstLegacyDir, secondLegacyDir],
      currentDir
    })

    expect(result).toEqual({
      migrated: true,
      outcome: 'copied',
      copiedFrom: [firstLegacyDir, secondLegacyDir]
    })
    expect(readFileSync(join(currentDir, 'voiceos.db'), 'utf8')).toBe('first database')
  })

  it('skips legacy directories that do not exist and still copies the others', () => {
    const { root, legacyDir, currentDir } = setup()
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, 'voiceos.db'), 'legacy database')

    const result = migrateUserData({
      legacyDirs: [join(root, 'missing'), legacyDir],
      currentDir
    })

    expect(result).toEqual({ migrated: true, outcome: 'copied', copiedFrom: [legacyDir] })
    expect(readFileSync(join(currentDir, 'voiceos.db'), 'utf8')).toBe('legacy database')
  })

  it('does nothing when no legacy directory exists', () => {
    const { root, currentDir } = setup()

    const result = migrateUserData({
      legacyDirs: [join(root, 'VoiceOS'), join(root, 'voiceos')],
      currentDir
    })

    expect(result).toEqual({ migrated: false, outcome: 'skipped-no-legacy', copiedFrom: [] })
    expect(() => readFileSync(join(currentDir, 'kestrel-settings.json'))).toThrow()
  })

  it('never throws when the copy fails and keeps the legacy data intact', () => {
    const { root, currentDir } = setup()
    const legacyFile = join(root, 'VoiceOS')
    writeFileSync(legacyFile, 'not a directory')

    let result: ReturnType<typeof migrateUserData> | undefined
    expect(() => {
      result = migrateUserData({ legacyDirs: [legacyFile], currentDir })
    }).not.toThrow()

    expect(result).toEqual({
      migrated: false,
      outcome: 'failed',
      copiedFrom: [],
      error: expect.any(String)
    })
    expect(readFileSync(legacyFile, 'utf8')).toBe('not a directory')
  })
})
