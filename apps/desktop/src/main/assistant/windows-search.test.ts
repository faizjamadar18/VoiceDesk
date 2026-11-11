import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMIT,
  SearchRow,
  SearchTransport,
  WindowsSearchProvider,
  WindowsSearchUnavailable,
  buildSearchSql,
  sanitizeQuery
} from './windows-search'

const directories: string[] = []

function tempDirectory(): string {
  // Keep test paths outside AppData: the production exclusion list refuses it.
  const directory = mkdtempSync(path.join(process.cwd(), '.kestrel-search-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

class RecordingTransport implements SearchTransport {
  readonly rows: SearchRow[]
  readonly error: unknown
  readonly calls: Array<{ sql: string; timeout: number }> = []

  constructor(rows: SearchRow[] = [], error?: unknown) {
    this.rows = rows
    this.error = error
  }

  fetch(sql: string, timeout: number): SearchRow[] {
    this.calls.push({ sql, timeout })
    if (this.error !== undefined) {
      throw this.error
    }
    return [...this.rows]
  }
}

function rowFor(file: string, name?: string): SearchRow {
  return {
    name: name ?? path.basename(file),
    path: file,
    size: statSync(file).size,
    modified: new Date('2026-11-07T09:41:12Z')
  }
}

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1
}

describe('WindowsSearchProvider', () => {
  it('returns only existing regular files', async () => {
    const directory = tempDirectory()
    const first = path.join(directory, 'budget.xlsx')
    const second = path.join(directory, 'notes.txt')
    writeFileSync(first, 'data')
    writeFileSync(second, 'hello')
    const folder = path.join(directory, 'a-folder')
    mkdirSync(folder)
    const missing = path.join(directory, 'gone.txt')

    const transport = new RecordingTransport([
      rowFor(first),
      rowFor(second),
      { name: 'a-folder', path: folder, size: null, modified: null },
      { name: 'gone.txt', path: missing, size: 1, modified: null }
    ])

    const results = await new WindowsSearchProvider(transport).search('budget')

    expect(results.map((item) => item.path)).toEqual([first, second])
  })

  it('filters system, app, and node_modules paths', async () => {
    const directory = tempDirectory()
    const keep = path.join(directory, 'Documents', 'keep.txt')
    mkdirSync(path.dirname(keep))
    writeFileSync(keep, 'keep')

    const excluded: string[] = []
    for (const relative of [
      'Windows/note.txt',
      'Program Files/app.txt',
      'Program Files (x86)/app.txt',
      'ProgramData/data.txt',
      'node_modules/pkg/readme.txt',
      '$Recycle.Bin/deleted.txt',
      'System Volume Information/info.txt'
    ]) {
      const target = path.join(directory, ...relative.split('/'))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, 'clutter')
      excluded.push(target)
    }

    const transport = new RecordingTransport(
      [keep, ...excluded].map((file) => rowFor(file))
    )

    const results = await new WindowsSearchProvider(transport).search('anything')

    expect(results.map((item) => item.path)).toEqual([keep])
  })

  it('excludes appdata paths', async () => {
    const directory = tempDirectory()
    const target = path.join(directory, 'AppData', 'Local', 'data.txt')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, 'clutter')
    const transport = new RecordingTransport([rowFor(target)])

    const results = await new WindowsSearchProvider(transport).search('anything')

    expect(results).toEqual([])
  })

  it('matches folder names in the generated query', async () => {
    const directory = tempDirectory()
    const target = path.join(directory, '2025 Tax Returns', 'scan-001.pdf')
    mkdirSync(path.dirname(target))
    writeFileSync(target, 'pdf')

    const sql = buildSearchSql(sanitizeQuery('tax returns'), 50)

    expect(
      sql.includes(`CONTAINS("System.FileName", '"tax*"')`)
    ).toBe(true)
    expect(
      sql.includes(`CONTAINS("System.ItemPathDisplay", '"tax*"')`)
    ).toBe(true)
    expect(
      sql.includes(`CONTAINS("System.FileName", '"returns*"')`)
    ).toBe(true)
    expect(
      sql.includes(`CONTAINS("System.ItemPathDisplay", '"returns*"')`)
    ).toBe(true)

    const transport = new RecordingTransport([rowFor(target)])
    const results = await new WindowsSearchProvider(transport).search(
      'tax returns'
    )

    expect(results.map((item) => item.name)).toEqual(['scan-001.pdf'])
  })

  it('requires every query token', async () => {
    const directory = tempDirectory()
    const target = path.join(directory, 'budget_2026.xlsx')
    writeFileSync(target, 'x')

    const sql = buildSearchSql(sanitizeQuery('budget xlsx'), 50)

    expect(sql).toContain(' AND ')
    for (const token of ['budget', 'xlsx']) {
      expect(
        occurrences(sql, `CONTAINS("System.FileName", '"${token}*"')`)
      ).toBe(1)
      expect(
        occurrences(sql, `CONTAINS("System.ItemPathDisplay", '"${token}*"')`)
      ).toBe(1)
    }

    const transport = new RecordingTransport([rowFor(target)])
    const results = await new WindowsSearchProvider(transport).search(
      'budget xlsx'
    )

    expect(results.map((item) => item.name)).toEqual(['budget_2026.xlsx'])
  })

  it('returns empty without calling the index for blank queries', async () => {
    const transport = new RecordingTransport([
      { name: 'x', path: 'C:\\x.txt', size: 1, modified: null }
    ])

    expect(await new WindowsSearchProvider(transport).search('')).toEqual([])
    expect(await new WindowsSearchProvider(transport).search('   ')).toEqual([])
    expect(await new WindowsSearchProvider(transport).search('?!...')).toEqual(
      []
    )
    expect(transport.calls).toEqual([])
  })

  it('returns an empty list when there are no rows', async () => {
    const transport = new RecordingTransport([])

    expect(await new WindowsSearchProvider(transport).search('nothing')).toEqual(
      []
    )
  })

  it('returns the expected shape with ISO modified text', async () => {
    const directory = tempDirectory()
    const target = path.join(directory, 'note.txt')
    writeFileSync(target, 'hello')
    const transport = new RecordingTransport([rowFor(target)])

    const results = await new WindowsSearchProvider(transport).search('note')

    expect(results).toHaveLength(1)
    const item = results[0]
    expect(new Set(Object.keys(item))).toEqual(
      new Set(['name', 'path', 'sizeBytes', 'modified'])
    )
    expect(item.name).toBe('note.txt')
    expect(item.path).toBe(target)
    expect(item.sizeBytes).toBe(5)
    expect(typeof item.sizeBytes).toBe('number')
    expect(Number(new Date(String(item.modified)).getUTCFullYear())).toBe(2026)
  })

  it('dedupes by case-insensitive absolute path', async () => {
    const directory = tempDirectory()
    const target = path.join(directory, 'Report.txt')
    writeFileSync(target, 'x')
    const transport = new RecordingTransport([
      rowFor(target),
      rowFor(target, path.basename(target).toUpperCase())
    ])

    const results = await new WindowsSearchProvider(transport).search('report')

    expect(results).toHaveLength(1)
  })

  it('respects the limit and overfetches from the index', async () => {
    const directory = tempDirectory()
    const files: string[] = []
    for (let index = 0; index < 3; index += 1) {
      const target = path.join(directory, `report_${index}.txt`)
      writeFileSync(target, 'x')
      files.push(target)
    }
    const transport = new RecordingTransport(files.map((file) => rowFor(file)))

    const results = await new WindowsSearchProvider(transport).search(
      'report',
      2
    )

    expect(results).toHaveLength(2)
    expect(transport.calls).toHaveLength(1)
    const { sql, timeout } = transport.calls[0]
    const afterTop = sql.split('TOP')[1] ?? ''
    const top = Number(afterTop.trim().split(/\s+/)[0])
    expect(top).toBeGreaterThan(2)
    expect(timeout).toBe(5)
  })

  it('defaults to twenty results', async () => {
    const directory = tempDirectory()
    const files: string[] = []
    for (let index = 0; index < 25; index += 1) {
      const target = path.join(directory, `report_${index}.txt`)
      writeFileSync(target, 'x')
      files.push(target)
    }
    const transport = new RecordingTransport(files.map((file) => rowFor(file)))

    const results = await new WindowsSearchProvider(transport).search('report')

    expect(results).toHaveLength(DEFAULT_LIMIT)
  })

  it('raises WindowsSearchUnavailable when the transport fails', async () => {
    const transport = new RecordingTransport([], new Error('COM exploded'))

    await expect(
      new WindowsSearchProvider(transport).search('budget')
    ).rejects.toBeInstanceOf(WindowsSearchUnavailable)
  })
})

describe('sanitizeQuery', () => {
  it('removes search syntax', () => {
    const tokens = sanitizeQuery('budget"); DROP TABLE "files" -- (x) OR *')

    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) {
      for (const character of ['"', "'", ';', '(', ')', '*', '\\']) {
        expect(token.includes(character)).toBe(false)
      }
    }
    expect(tokens).toContain('budget')
  })

  it('truncates very long tokens', () => {
    const [token] = sanitizeQuery('a'.repeat(100))

    expect(token).toHaveLength(64)
  })
})

describe('buildSearchSql', () => {
  it('excludes node_modules and orders by modified date', () => {
    const sql = buildSearchSql(['budget'], 50)

    expect(sql.startsWith('SELECT TOP 50 ')).toBe(true)
    expect(sql).toContain(
      `NOT CONTAINS("System.ItemPathDisplay", '"node_modules"')`
    )
    expect(sql.endsWith('ORDER BY "System.DateModified" DESC')).toBe(true)
  })
})
