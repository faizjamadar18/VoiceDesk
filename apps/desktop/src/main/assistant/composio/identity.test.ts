import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSIO_USER_ID_ENV, loadOrCreateUserId } from './identity'

const directories: string[] = []

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function setup(): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-composio-identity-'))
  directories.push(directory)
  return { directory, file: join(directory, 'composio-identity.json') }
}

function jsonOf(file: string): { version: number; userId: string } {
  return JSON.parse(readFileSync(file, 'utf8')) as {
    version: number
    userId: string
  }
}

beforeEach(() => {
  // Keep the tests independent of whatever the developer has exported.
  vi.stubEnv(COMPOSIO_USER_ID_ENV, '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('loadOrCreateUserId', () => {
  it('creates and persists a UUID on the first call', () => {
    const { file } = setup()

    expect(existsSync(file)).toBe(false)

    const id = loadOrCreateUserId(file)

    expect(id).toMatch(UUID_PATTERN)
    expect(existsSync(file)).toBe(true)
    expect(jsonOf(file)).toEqual({ version: 1, userId: id })
  })

  it('returns the identical id on a second call', () => {
    const { file } = setup()

    const first = loadOrCreateUserId(file)
    const second = loadOrCreateUserId(file)

    expect(second).toBe(first)
  })

  it('returns a non-blank environment id and writes nothing', () => {
    const { file } = setup()
    vi.stubEnv(COMPOSIO_USER_ID_ENV, 'abc')

    expect(loadOrCreateUserId(file)).toBe('abc')
    expect(existsSync(file)).toBe(false)
  })

  it('ignores a blank environment id and uses the file', () => {
    const { file } = setup()
    vi.stubEnv(COMPOSIO_USER_ID_ENV, '   ')
    writeFileSync(file, JSON.stringify({ version: 1, userId: 'stored-id' }))

    expect(loadOrCreateUserId(file)).toBe('stored-id')
  })

  it('replaces a corrupt file without throwing', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const id = loadOrCreateUserId(file)

    expect(id).toMatch(UUID_PATTERN)
    expect(jsonOf(file)).toEqual({ version: 1, userId: id })
  })

  it('replaces a wrong-shape payload without throwing', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ version: 1, userId: 42 }), 'utf8')

    const id = loadOrCreateUserId(file)

    expect(id).toMatch(UUID_PATTERN)
    expect(jsonOf(file)).toEqual({ version: 1, userId: id })
  })

  it('creates a missing parent directory', () => {
    const { directory } = setup()
    const file = join(directory, 'nested', 'composio-identity.json')

    const id = loadOrCreateUserId(file)

    expect(id).toMatch(UUID_PATTERN)
    expect(existsSync(file)).toBe(true)
    expect(jsonOf(file)).toEqual({ version: 1, userId: id })
  })
})
