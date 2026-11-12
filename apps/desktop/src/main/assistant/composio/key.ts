/**
 * Persist the user's own Composio API key (bring-your-own-key).
 *
 * Kestrel never ships a Composio key and never proxies one through its own
 * backend: the key is the user's, it stays on the user's machine, and any bill
 * Composio charges is theirs. The key is encrypted with Electron's
 * `safeStorage` when the OS keychain is available, and only written as plain
 * text when it is not, so the integration still works on machines without a
 * keychain.
 *
 * Encryption is injected, and the Electron import is lazy, so the unit tests
 * never load Electron or touch the real filesystem beyond a temp file.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

export interface ComposioKeySource {
  readonly source: 'stored' | 'env' | null
  readonly key: string | null
}

export interface ComposioKeyStoreOptions {
  /** Injectable so tests never touch Electron. */
  encrypt?: (plain: string) => string
  decrypt?: (cipher: string) => string
}

/** Shape of the on-disk file. `version` selects `cipher` or `plain`. */
interface StoredKeyRecord {
  version: number
  cipher?: string
  plain?: string
}

const FILE_VERSION_ENCRYPTED = 1
const FILE_VERSION_PLAIN = 0
const ENV_VARIABLES = ['KESTREL_COMPOSIO_API_KEY', 'COMPOSIO_API_KEY'] as const

const CONSUMER_KEY_MESSAGE =
  'That is your Composio consumer key (ck_...). Use your Platform project key ' +
  'instead: Settings → Project Settings → API Keys (it starts with ak_).'

/** A specific, actionable message when the key is the wrong kind. */
export function keyProblem(key: string): string | null {
  const trimmed = typeof key === 'string' ? key.trim() : ''
  if (trimmed.startsWith('ck_')) return CONSUMER_KEY_MESSAGE
  return null
}

export class ComposioKeyStore {
  private readonly filePath: string
  private readonly encrypt: (plain: string) => string
  private readonly decrypt: (cipher: string) => string
  /**
   * True when no encrypter was injected, so `save` may fall back to plain text
   * when the OS keychain is unavailable.
   */
  private readonly mayStorePlain: boolean

  constructor(filePath: string, options: ComposioKeyStoreOptions = {}) {
    this.filePath = filePath
    this.encrypt = options.encrypt ?? defaultEncrypt
    this.decrypt = options.decrypt ?? defaultDecrypt
    this.mayStorePlain = options.encrypt === undefined
  }

  /** Prefer the stored key, then the environment. */
  read(): ComposioKeySource {
    const stored = this.readStored()
    if (stored !== null) return { source: 'stored', key: stored }

    const fromEnv = envKey()
    if (fromEnv !== null) return { source: 'env', key: fromEnv }

    return { source: null, key: null }
  }

  /** Encrypt and persist `key`. */
  save(key: string): void {
    const trimmed = typeof key === 'string' ? key.trim() : ''
    if (!trimmed) throw new Error('Enter a Composio API key.')

    const problem = keyProblem(trimmed)
    if (problem !== null) throw new Error(problem)

    const record = this.buildRecord(trimmed)
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8')
  }

  /** Remove the stored key. A missing file is not an error. */
  clear(): void {
    rmSync(this.filePath, { force: true })
  }

  /** True when a readable key is stored on disk. */
  hasStored(): boolean {
    return this.readStored() !== null
  }

  private buildRecord(plain: string): StoredKeyRecord {
    if (this.mayStorePlain && !safeStorageAvailable()) {
      console.warn(
        '[composio] Electron safeStorage is unavailable; storing the ' +
          'Composio API key as plain text.'
      )
      return { version: FILE_VERSION_PLAIN, plain }
    }
    return { version: FILE_VERSION_ENCRYPTED, cipher: this.encrypt(plain) }
  }

  /**
   * Read and decode the stored key, or `null` when it is missing, malformed,
   * or cannot be decrypted. A corrupt file never throws: it warns and lets the
   * caller fall through to the environment.
   */
  private readStored(): string | null {
    let text: string
    try {
      text = readFileSync(this.filePath, 'utf8')
    } catch (error) {
      if (!isNotFound(error)) {
        console.warn(`[composio] could not read ${this.filePath}:`, error)
      }
      return null
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      console.warn(
        `[composio] ignoring unreadable Composio key file at ${this.filePath}.`
      )
      return null
    }
    if (!isRecord(data)) {
      console.warn(
        `[composio] ignoring unreadable Composio key file at ${this.filePath}.`
      )
      return null
    }

    if (data.version === FILE_VERSION_PLAIN && typeof data.plain === 'string') {
      return nonEmpty(data.plain)
    }
    if (
      data.version === FILE_VERSION_ENCRYPTED &&
      typeof data.cipher === 'string'
    ) {
      try {
        return nonEmpty(this.decrypt(data.cipher))
      } catch (error) {
        console.warn('[composio] could not decrypt the stored key:', error)
        return null
      }
    }

    console.warn(
      `[composio] ignoring unrecognized Composio key file at ${this.filePath}.`
    )
    return null
  }
}

/** First set key among the supported environment variables. */
function envKey(): string | null {
  for (const variable of ENV_VARIABLES) {
    const value = nonEmpty(process.env[variable])
    if (value !== null) return value
  }
  return null
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
}

/**
 * Load Electron's `safeStorage` lazily, via `createRequire`, so importing this
 * module in a unit test never loads Electron.
 */
function loadSafeStorage(): SafeStorageLike | null {
  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as { safeStorage?: SafeStorageLike }
    return electron.safeStorage ?? null
  } catch {
    return null
  }
}

function safeStorageAvailable(): boolean {
  const safeStorage = loadSafeStorage()
  return safeStorage !== null && safeStorage.isEncryptionAvailable()
}

/** Default encrypter: Electron `safeStorage`, base64-encoded. */
function defaultEncrypt(plain: string): string {
  const safeStorage = loadSafeStorage()
  if (safeStorage === null || !safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage is unavailable.')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

/** Default decrypter: reverse of `defaultEncrypt`. */
function defaultDecrypt(cipher: string): string {
  const safeStorage = loadSafeStorage()
  if (safeStorage === null) throw new Error('safeStorage is unavailable.')
  return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
