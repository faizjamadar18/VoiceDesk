import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore, MAX_HISTORY_RECORDS } from './store'

const directories: string[] = []

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-history-'))
  directories.push(directory)
  return { directory, file: join(directory, 'history.json') }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('HistoryStore', () => {
  it('starts empty when the file is missing', () => {
    const { file } = setup()
    const store = new HistoryStore(file)

    expect(store.list()).toEqual([])
    expect(store.count()).toBe(0)
  })

  it('records a turn with an id and ISO timestamp, newest first', () => {
    const { file } = setup()
    const store = new HistoryStore(file)

    const first = store.record(
      { prompt: 'what time is it', reply: 'It is noon.' },
      new Date('2026-01-01T10:00:00.000Z')
    )
    const second = store.record(
      { prompt: 'open my email', reply: 'Opening Gmail.', tool: 'gmail' },
      new Date('2026-01-01T11:00:00.000Z')
    )

    expect(first.id).not.toBe('')
    expect(first.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(store.list().map((record) => record.id)).toEqual([second.id, first.id])
    expect(store.count()).toBe(2)
  })

  it('persists records across a restart', () => {
    const { file } = setup()
    const saved = new HistoryStore(file).record({
      prompt: 'hello',
      reply: 'hi there'
    })

    expect(new HistoryStore(file).list()).toEqual([saved])
  })

  it('deletes a record and reports unknown ids', () => {
    const { file } = setup()
    const store = new HistoryStore(file)
    const saved = store.record({ prompt: 'a', reply: 'b' })

    expect(store.delete(saved.id)).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.delete('does-not-exist')).toBe(false)
  })

  it('treats a corrupt file as empty without throwing', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')

    const store = new HistoryStore(file)
    expect(store.list()).toEqual([])
    expect(() => store.record({ prompt: 'a', reply: 'b' })).not.toThrow()
    expect(store.count()).toBe(1)
  })

  it('keeps only the newest records once the cap is exceeded', () => {
    const { file } = setup()
    const store = new HistoryStore(file)

    for (let index = 0; index < MAX_HISTORY_RECORDS + 1; index += 1) {
      store.record(
        { prompt: `prompt ${index}`, reply: `reply ${index}` },
        new Date(Date.UTC(2026, 0, 1, 0, 0, index))
      )
    }

    const records = store.list()
    expect(records).toHaveLength(MAX_HISTORY_RECORDS)
    expect(records.some((record) => record.prompt === 'prompt 0')).toBe(false)
    expect(records.at(0)?.prompt).toBe(`prompt ${MAX_HISTORY_RECORDS}`)
  })

  it('reads a record without a tool back as null', () => {
    const { file } = setup()
    const store = new HistoryStore(file)

    const saved = store.record({ prompt: 'a', reply: 'b' })

    expect(saved.tool).toBeNull()
    expect(new HistoryStore(file).list()[0]?.tool).toBeNull()
  })

  it('writes a pretty-printed JSON array with a trailing newline', () => {
    const { file } = setup()
    const store = new HistoryStore(file)
    store.record({ prompt: 'a', reply: 'b' })

    const raw = readFileSync(file, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw)).toHaveLength(1)
  })
})
