import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AppEntry,
  AppLaunchError,
  AppNotInstalledError,
  WindowsAppCatalog,
  WindowsAppCatalogOptions,
  appLabel
} from './app-catalog'

const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-apps-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function makeCatalog(
  overrides: WindowsAppCatalogOptions = {}
): WindowsAppCatalog {
  return new WindowsAppCatalog({
    appPathReader: () => [],
    shortcutRoots: [],
    startAppReader: () => [],
    pathFinder: () => null,
    cacheSeconds: 0,
    ...overrides
  })
}

describe('WindowsAppCatalog', () => {
  it('resolves a store app by display name', async () => {
    const catalog = makeCatalog({
      startAppReader: () => [
        {
          name: 'WhatsApp',
          launch: [
            'explorer.exe',
            'shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App'
          ],
          source: 'start_app'
        }
      ]
    })

    const entry = await catalog.resolve('whatsapp')

    expect(entry.name).toBe('WhatsApp')
    expect(entry.launch[0]).toBe('explorer.exe')
  })

  it('resolves a shortcut by partial name', async () => {
    const directory = tempDirectory()
    writeFileSync(join(directory, 'Google Chrome.lnk'), 'placeholder')
    writeFileSync(join(directory, 'notes.txt'), 'not an app')
    const catalog = makeCatalog({ shortcutRoots: [directory] })

    const entry = await catalog.resolve('chrome')

    expect(entry.name).toBe('Google Chrome')
    expect(entry.shell).toBe(true)
    expect(entry.launch).toEqual([join(directory, 'Google Chrome.lnk')])
  })

  it('resolves a registry app path', async () => {
    const catalog = makeCatalog({
      appPathReader: () => [
        {
          name: 'Notion',
          launch: ['C:\\Users\\me\\AppData\\Local\\Programs\\Notion\\Notion.exe']
        }
      ]
    })

    const entry = await catalog.resolve('notion')

    expect(entry.name).toBe('Notion')
    expect(entry.launch[entry.launch.length - 1].endsWith('Notion.exe')).toBe(
      true
    )
  })

  it('defers store app paths to the start apps catalog', async () => {
    const catalog = makeCatalog({
      appPathReader: () => [
        {
          name: 'notepad',
          launch: [
            'C:\\Program Files\\WindowsApps' +
              '\\Microsoft.WindowsNotepad_11.0_x64__8wekyb3d8bbwe' +
              '\\Notepad\\Notepad.exe'
          ],
          source: 'app_paths'
        }
      ],
      startAppReader: () => [
        {
          name: 'Notepad',
          launch: [
            'explorer.exe',
            'shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'
          ],
          source: 'start_app'
        }
      ]
    })

    const entry = await catalog.resolve('notepad')

    expect(entry.source).toBe('start_app')
    expect(entry.launch[0]).toBe('explorer.exe')
  })

  it('uses the Windows executable name for aliases', async () => {
    const seen: string[] = []
    const catalog = makeCatalog({
      pathFinder: (name) => {
        seen.push(name)
        return name === 'calc' ? 'C:\\Windows\\System32\\calc.exe' : null
      }
    })

    const entry = await catalog.resolve('calculator')

    expect(entry.launch).toEqual(['C:\\Windows\\System32\\calc.exe'])
    expect(seen).toContain('calc')
  })

  it('falls back from Windows Terminal to PowerShell', async () => {
    const catalog = makeCatalog({
      pathFinder: (name) =>
        name === 'powershell'
          ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
          : null
    })

    const entry = await catalog.resolve('terminal')

    expect(
      entry.launch[entry.launch.length - 1].endsWith('powershell.exe')
    ).toBe(true)
  })

  it('matches VS Code through the code executable', async () => {
    const catalog = makeCatalog({
      pathFinder: (name) =>
        name === 'code' ? 'C:\\VS Code\\Code.exe' : null
    })

    const entry = await catalog.resolve('vs code')

    expect(entry.launch).toEqual(['C:\\VS Code\\Code.exe'])
  })

  it('opens the Windows Settings URI', async () => {
    const entry = await makeCatalog().resolve('settings')

    expect(entry.shell).toBe(true)
    expect(entry.launch).toEqual(['ms-settings:'])
  })

  it('explains that a missing app is not installed', async () => {
    await expect(makeCatalog().resolve('notion')).rejects.toThrow(
      'Notion is not installed on this PC.'
    )
  })

  it('rejects a blank app name', async () => {
    await expect(makeCatalog().resolve('   ')).rejects.toBeInstanceOf(
      AppNotInstalledError
    )
  })

  it('launches the resolved entry through the injected launcher', async () => {
    const launched: AppEntry[] = []
    const catalog = makeCatalog({
      appPathReader: () => [{ name: 'Notion', launch: ['C:\\Notion.exe'] }],
      launcher: (entry) => {
        launched.push(entry)
      }
    })

    await catalog.launch('notion')

    expect(launched.map((entry) => entry.name)).toEqual(['Notion'])
  })

  it('reports launch failures clearly', async () => {
    const catalog = makeCatalog({
      appPathReader: () => [{ name: 'Notion', launch: ['C:\\Notion.exe'] }],
      launcher: () => {
        throw new Error('access denied')
      }
    })

    await expect(catalog.launch('notion')).rejects.toBeInstanceOf(AppLaunchError)
    await expect(catalog.launch('notion')).rejects.toThrow(
      "I found Notion, but Windows couldn't open it."
    )
  })

  it('caches the catalog between lookups', async () => {
    const reads: number[] = []
    const catalog = makeCatalog({
      appPathReader: () => {
        reads.push(1)
        return [{ name: 'Notion', launch: ['C:\\Notion.exe'] }]
      },
      cacheSeconds: 60
    })

    await catalog.resolve('notion')
    await catalog.resolve('notion')

    expect(reads).toHaveLength(1)
  })

  it('deduplicates identical entries from every source', async () => {
    const entry: AppEntry = {
      name: 'Notion',
      launch: ['C:\\Notion.exe']
    }
    const catalog = makeCatalog({
      appPathReader: () => [entry],
      startAppReader: () => [{ ...entry }]
    })

    const resolved = await catalog.resolve('notion')

    expect(resolved.name).toBe('Notion')
  })
})

describe('appLabel', () => {
  it.each([
    ['notion', 'Notion'],
    ['calc', 'Calculator'],
    ['vs code', 'Visual Studio Code'],
    ['google chrome', 'Chrome']
  ])('is friendly for %s', (spoken, label) => {
    expect(appLabel(spoken)).toBe(label)
  })

  it('falls back to a capitalised spoken name', () => {
    expect(appLabel('  spotify  ')).toBe('Spotify')
    expect(appLabel('   ')).toBe('That app')
  })
})
