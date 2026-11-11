import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DirectFileSearch,
  FileNotFoundError,
  FileOps,
  LocationNotFound,
  TargetExists,
  UnsafeLocation
} from './files'

const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'kestrel-files-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

interface OpsFixture {
  ops: FileOps
  home: string
  known: Record<string, string>
  recorded: string[]
}

function makeOps(): OpsFixture {
  const root = tempDirectory()
  const home = path.join(root, 'home')
  mkdirSync(home)
  const known: Record<string, string> = {
    desktop: path.join(home, 'Desktop'),
    documents: path.join(home, 'Documents'),
    downloads: path.join(home, 'Downloads'),
    pictures: path.join(home, 'Pictures'),
    music: path.join(home, 'Music'),
    videos: path.join(home, 'Videos')
  }
  for (const folder of Object.values(known)) {
    mkdirSync(folder)
  }

  const recorded: string[] = []
  const trash = (target: string): void => {
    recorded.push(target)
    rmSync(target, { recursive: true, force: true })
  }

  return {
    ops: new FileOps(home, { knownFolders: known, trash }),
    home,
    known,
    recorded
  }
}

describe('FileOps.search', () => {
  it('finds matching files and ignores others', async () => {
    const directory = tempDirectory()
    writeFileSync(path.join(directory, 'budget_2026.xlsx'), 'x')
    writeFileSync(path.join(directory, 'notes.txt'), 'y')
    const reports = path.join(directory, 'reports')
    mkdirSync(reports)
    writeFileSync(path.join(reports, 'budget_summary.pdf'), 'z')

    const results = await new FileOps().search('budget', [directory])

    expect(new Set(results.map((item) => item.name))).toEqual(
      new Set(['budget_2026.xlsx', 'budget_summary.pdf'])
    )
  })

  it('requires every whitespace token', async () => {
    const directory = tempDirectory()
    writeFileSync(path.join(directory, 'budget_2026.xlsx'), 'x')
    writeFileSync(path.join(directory, 'budget.txt'), 'y')

    const results = await new FileOps().search('budget xlsx', [directory])

    expect(results.map((item) => item.name)).toEqual(['budget_2026.xlsx'])
  })

  it('returns the expected shape', async () => {
    const directory = tempDirectory()
    writeFileSync(path.join(directory, 'note.txt'), 'hello')

    const results = await new FileOps().search('note', [directory])

    expect(results).toHaveLength(1)
    const item = results[0]
    expect(new Set(Object.keys(item))).toEqual(
      new Set(['name', 'path', 'sizeBytes', 'modified'])
    )
    expect(item.sizeBytes).toBe(5)
    expect(item.path.endsWith('note.txt')).toBe(true)
    expect(item.modified.endsWith('+00:00')).toBe(true)
    expect(Number.isNaN(Date.parse(item.modified))).toBe(false)
  })

  it('is bounded and skips heavy directories', async () => {
    const directory = tempDirectory()
    const heavy = path.join(directory, 'node_modules', 'deep')
    mkdirSync(heavy, { recursive: true })
    writeFileSync(path.join(heavy, 'treasure.txt'), 'hidden')

    const results = await new FileOps().search('treasure', [directory])

    expect(results).toEqual([])
  })

  it('respects the limit', async () => {
    const directory = tempDirectory()
    for (let index = 0; index < 5; index += 1) {
      writeFileSync(path.join(directory, `report_${index}.txt`), 'x')
    }

    const results = await new FileOps().search('report', [directory], 2)

    expect(results).toHaveLength(2)
  })

  it('does not descend past the maximum depth', async () => {
    const directory = tempDirectory()
    let deep = directory
    for (let index = 0; index < 5; index += 1) {
      deep = path.join(deep, `level${index}`)
    }
    mkdirSync(deep, { recursive: true })
    writeFileSync(path.join(deep, 'buried.txt'), 'x')

    const results = await new FileOps().search('buried', [directory])

    expect(results).toEqual([])
  })
})

describe('FileOps locations and creation', () => {
  it('creates folders on the desktop by default', async () => {
    const { ops, known } = makeOps()

    const target = await ops.createFolder('Invoices', null)

    expect(target).toBe(path.resolve(path.join(known.desktop, 'Invoices')))
    expect(statSync(target).isDirectory()).toBe(true)
  })

  it('honours a named location', async () => {
    const { ops, known } = makeOps()

    const target = await ops.createFolder('Q1', 'Downloads')

    expect(target).toBe(path.resolve(path.join(known.downloads, 'Q1')))
  })

  it('accepts articles and case in location names', async () => {
    const { ops, known } = makeOps()

    const target = await ops.createFolder('Notes', 'my Documents')

    expect(path.dirname(target)).toBe(path.resolve(known.documents))
  })

  it('refuses an existing folder name', async () => {
    const { ops, known } = makeOps()
    mkdirSync(path.join(known.desktop, 'Invoices'))

    await expect(ops.createFolder('Invoices', null)).rejects.toBeInstanceOf(
      TargetExists
    )
  })

  it('refuses system folders', async () => {
    const { ops, known } = makeOps()
    const system = path.join(known.desktop, 'Program Files')
    mkdirSync(system)

    await expect(ops.createFolder('X', system)).rejects.toBeInstanceOf(
      UnsafeLocation
    )
  })

  it('rejects a path in the name', async () => {
    const { ops } = makeOps()

    await expect(ops.createFolder('../escape', null)).rejects.toBeInstanceOf(
      UnsafeLocation
    )
    await expect(ops.createFolder('sub/child', null)).rejects.toBeInstanceOf(
      UnsafeLocation
    )
  })

  it('reports an unknown location', async () => {
    const { ops, known } = makeOps()

    await expect(
      ops.createFolder('X', path.join(known.desktop, 'nope'))
    ).rejects.toBeInstanceOf(LocationNotFound)
  })

  it('adds .txt to a file without an extension and keeps it empty', async () => {
    const { ops, known } = makeOps()

    const target = await ops.createFile('notes', null)

    expect(path.basename(target)).toBe('notes.txt')
    expect(path.dirname(target)).toBe(path.resolve(known.desktop))
    expect(await readFile(target, 'utf8')).toBe('')
  })

  it('keeps an explicit extension', async () => {
    const { ops } = makeOps()

    const target = await ops.createFile('plan.md', null)

    expect(path.basename(target)).toBe('plan.md')
  })

  it('refuses an existing file name', async () => {
    const { ops, known } = makeOps()
    writeFileSync(path.join(known.desktop, 'notes.txt'), 'keep')

    await expect(ops.createFile('notes.txt', null)).rejects.toBeInstanceOf(
      TargetExists
    )
  })

  it('refuses an empty file name', async () => {
    const { ops } = makeOps()

    await expect(ops.createFile('   ', null)).rejects.toThrow(
      'A name is required.'
    )
  })
})

describe('FileOps deletion', () => {
  it('sends the file to the trash', async () => {
    const { ops, known, recorded } = makeOps()
    const victim = path.join(known.desktop, 'old.txt')
    writeFileSync(victim, 'bye')

    const result = await ops.deleteFile(victim)

    expect(result).toBe(path.resolve(victim))
    expect(recorded).toEqual([path.resolve(victim)])
  })

  it('refuses system folders', async () => {
    const { ops, known, recorded } = makeOps()
    const hidden = path.join(known.desktop, 'AppData')
    mkdirSync(hidden)
    const victim = path.join(hidden, 'x.txt')
    writeFileSync(victim, 'x')

    await expect(ops.deleteFile(victim)).rejects.toBeInstanceOf(UnsafeLocation)

    expect(recorded).toEqual([])
  })

  it('reports a missing file', async () => {
    const { ops, known } = makeOps()

    await expect(
      ops.deleteFile(path.join(known.desktop, 'gone.txt'))
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it('refuses a relative path', async () => {
    const { ops } = makeOps()

    await expect(ops.deleteFile('report.pdf')).rejects.toBeInstanceOf(
      UnsafeLocation
    )
  })

  it('trashes the path when undoing a creation', async () => {
    const { ops, recorded } = makeOps()
    const created = await ops.createFolder('Temp', null)

    await ops.removeCreated(created)

    expect(recorded).toEqual([created])
  })
})

describe('DirectFileSearch', () => {
  it('exposes FileOps.search through the provider API', async () => {
    const directory = tempDirectory()
    writeFileSync(path.join(directory, 'note.txt'), 'hello')
    const search = new DirectFileSearch(new FileOps(), [directory])

    const results = await search.search('note')

    expect(results.map((item) => item.name)).toEqual(['note.txt'])
  })
})
