import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileAuthStore } from './file-store'

describe('FileAuthStore', () => {
  const testFile = join(tmpdir(), `test-auth-session-${Date.now()}.json`)

  afterEach(() => {
    if (existsSync(testFile)) {
      try {
        unlinkSync(testFile)
      } catch {
        // ignore
      }
    }
  })

  it('saves, loads, and clears session data', () => {
    const store = new FileAuthStore(testFile)
    expect(store.load()).toBeNull()

    const session = {
      tokens: { accessToken: 'token-xyz', refreshToken: 'ref-123' },
      user: { id: 'usr-1', email: 'test@voiceos.com', name: 'Faiz' }
    }

    store.save(session)
    expect(store.load()).toEqual(session)

    store.clear()
    expect(store.load()).toBeNull()
  })
})

