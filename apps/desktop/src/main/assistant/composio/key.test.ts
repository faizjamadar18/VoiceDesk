import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposioKeyStore, type ComposioKeyStoreOptions } from './key'

const directories: string[] = []

function setup(): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), 'kestrel-composio-key-'))
  directories.push(directory)
  return { directory, file: join(directory, 'composio-key.json') }
}

/** Deterministic stand-in for Electron's safeStorage. */
function store(
  filePath: string,
  options: ComposioKeyStoreOptions = {}
): ComposioKeyStore {
  return new ComposioKeyStore(filePath, {
    encrypt: (plain) =>
      Buffer.from(`enc:${plain}`, 'utf8').toString('base64'),
    decrypt: (cipher) =>
      Buffer.from(cipher, 'base64').toString('utf8').replace(/^enc:/, ''),
    ...options
  })
}

beforeEach(() => {
  // Keep the tests independent of whatever the developer has exported.
  vi.stubEnv('KESTREL_COMPOSIO_API_KEY', '')
  vi.stubEnv('COMPOSIO_API_KEY', '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ComposioKeyStore', () => {
  it('round-trips a saved key as stored', () => {
    const { file } = setup()
    const keys = store(file)

    keys.save('  composio-secret  ')

    expect(keys.read()).toEqual({ source: 'stored', key: 'composio-secret' })
    expect(keys.hasStored()).toBe(true)
  })

  it('writes an encrypted version 1 record', () => {
    const { file } = setup()
    const keys = store(file)

    keys.save('composio-secret')

    const record = JSON.parse(readFileSync(file, 'utf8')) as {
      version: number
      cipher: string
    }
    expect(record.version).toBe(1)
    expect(typeof record.cipher).toBe('string')
    expect(record.cipher).not.toContain('composio-secret')
  })

  it('returns no source and no key when nothing is stored or set', () => {
    const { file } = setup()

    expect(store(file).read()).toEqual({ source: null, key: null })
    expect(store(file).hasStored()).toBe(false)
  })

  it('prefers the stored key over the environment', () => {
    const { file } = setup()
    const keys = store(file)
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', 'env-key')

    keys.save('stored-key')

    expect(keys.read()).toEqual({ source: 'stored', key: 'stored-key' })
  })

  it('falls back to KESTREL_COMPOSIO_API_KEY', () => {
    const { file } = setup()
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', '  env-key  ')

    expect(store(file).read()).toEqual({ source: 'env', key: 'env-key' })
  })

  it('falls back to COMPOSIO_API_KEY second', () => {
    const { file } = setup()
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', '')
    vi.stubEnv('COMPOSIO_API_KEY', 'composio-key')

    expect(store(file).read()).toEqual({ source: 'env', key: 'composio-key' })
  })

  it('falls back to the environment after clear', () => {
    const { file } = setup()
    const keys = store(file)
    keys.save('stored-key')
    vi.stubEnv('KESTREL_COMPOSIO_API_KEY', 'env-key')

    keys.clear()

    expect(existsSync(file)).toBe(false)
    expect(keys.read()).toEqual({ source: 'env', key: 'env-key' })
  })

  it('does not treat clearing a missing file as an error', () => {
    const { file } = setup()

    expect(() => store(file).clear()).not.toThrow()
  })

  it('does not throw on a corrupt key file', () => {
    const { file } = setup()
    writeFileSync(file, '{not json', 'utf8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(store(file).read()).toEqual({ source: null, key: null })
    expect(console.warn).toHaveBeenCalled()
  })

  it('does not throw when the stored key cannot be decrypted', () => {
    const { file } = setup()
    writeFileSync(file, JSON.stringify({ version: 1, cipher: 'garbage' }), 'utf8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const keys = store(file, {
      decrypt: () => {
        throw new Error('bad ciphertext')
      }
    })

    expect(keys.read()).toEqual({ source: null, key: null })
    expect(console.warn).toHaveBeenCalled()
  })

  it('throws when saving an empty key', () => {
    const { file } = setup()
    const keys = store(file)

    expect(() => keys.save('')).toThrow('Enter a Composio API key.')
    expect(() => keys.save('   ')).toThrow('Enter a Composio API key.')
  })

  it('rejects a consumer key with a message naming the right key type', () => {
    const { file } = setup()
    const keys = store(file)

    expect(() => keys.save('ck_abc')).toThrow(/consumer key/)
    expect(() => keys.save('ck_abc')).toThrow(/ak_/)
    expect(keys.hasStored()).toBe(false)
  })
})
