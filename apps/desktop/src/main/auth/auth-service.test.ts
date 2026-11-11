import { describe, expect, it, vi } from 'vitest'
import {
  AuthService,
  syncUserToBackend,
  type AuthStore,
  type AuthTokens,
  type AuthUser
} from './auth-service'

class MemoryAuthStore implements AuthStore {
  private data: { tokens: AuthTokens; user: AuthUser } | null = null

  constructor(initial?: { tokens: AuthTokens; user: AuthUser }) {
    this.data = initial ?? null
  }

  save(session: { tokens: AuthTokens; user: AuthUser }): void {
    this.data = session
  }

  load(): { tokens: AuthTokens; user: AuthUser } | null {
    return this.data
  }

  clear(): void {
    this.data = null
  }
}

describe('AuthService', () => {
  it('initializes to unauthenticated state when store is empty', () => {
    const store = new MemoryAuthStore()
    const service = new AuthService({ store })

    expect(service.getState()).toEqual({ status: 'unauthenticated' })
  })

  it('restores stored session on initialization if present', () => {
    const user: AuthUser = { id: 'u1', email: 'test@voiceos.com', name: 'Faiz' }
    const tokens: AuthTokens = { accessToken: 'token-123' }
    const store = new MemoryAuthStore({ user, tokens })

    const service = new AuthService({ store })
    expect(service.getState()).toEqual({
      status: 'authenticated',
      user,
      tokens
    })
  })

  it('transitions to authenticating when startLogin is called', () => {
    const store = new MemoryAuthStore()
    const onStateChanged = vi.fn()
    const service = new AuthService({ store, onStateChanged })

    service.startLogin()

    const state = service.getState()
    expect(state.status).toBe('authenticating')
    expect(onStateChanged).toHaveBeenCalledWith(state)
  })

  it('handles valid token deep link, updates state to authenticated, saves to store, and emits', async () => {
    const store = new MemoryAuthStore()
    const onStateChanged = vi.fn()
    const dummyUser: AuthUser = {
      id: 'usr_abc',
      email: 'user@example.com',
      name: 'Test User'
    }
    const tokenVerifier = vi.fn().mockResolvedValue(dummyUser)

    const service = new AuthService({
      store,
      onStateChanged,
      tokenVerifier
    })

    const callbackUrl =
      'voicedesk://auth/callback#access_token=xyz987&refresh_token=ref123&expires_in=3600'
    const success = await service.handleDeepLink(callbackUrl)

    expect(success).toBe(true)
    expect(service.getState()).toEqual({
      status: 'authenticated',
      user: dummyUser,
      tokens: {
        accessToken: 'xyz987',
        refreshToken: 'ref123',
        expiresIn: 3600,
        tokenType: undefined
      }
    })
    expect(store.load()).toEqual({
      tokens: {
        accessToken: 'xyz987',
        refreshToken: 'ref123',
        expiresIn: 3600,
        tokenType: undefined
      },
      user: dummyUser
    })
    expect(onStateChanged).toHaveBeenCalledWith(service.getState())
  })

  it('handles auth error deep link, updates state to error, and does not save to store', async () => {
    const store = new MemoryAuthStore()
    const onStateChanged = vi.fn()

    const service = new AuthService({ store, onStateChanged })

    const errorUrl =
      'voicedesk://auth/callback?error=access_denied&error_description=Access+denied'
    const success = await service.handleDeepLink(errorUrl)

    expect(success).toBe(false)
    expect(service.getState()).toEqual({
      status: 'error',
      message: 'Access denied'
    })
    expect(store.load()).toBeNull()
    expect(onStateChanged).toHaveBeenCalledWith({
      status: 'error',
      message: 'Access denied'
    })
  })

  it('signOut clears store, sets status to unauthenticated, and notifies listener', async () => {
    const user: AuthUser = { id: 'u1', email: 'test@voiceos.com' }
    const tokens: AuthTokens = { accessToken: 'token-123' }
    const store = new MemoryAuthStore({ user, tokens })
    const onStateChanged = vi.fn()

    const service = new AuthService({ store, onStateChanged })
    expect(service.getState().status).toBe('authenticated')

    await service.signOut()

    expect(service.getState()).toEqual({ status: 'unauthenticated' })
    expect(store.load()).toBeNull()
    expect(onStateChanged).toHaveBeenCalledWith({ status: 'unauthenticated' })
  })

  it('allows manual setSession to update authenticated state and persist', async () => {
    const store = new MemoryAuthStore()
    const onStateChanged = vi.fn()
    const service = new AuthService({ store, onStateChanged })

    const user: AuthUser = { id: 'u2', email: 'alex@example.com', name: 'Alex' }
    const tokens: AuthTokens = { accessToken: 'tok-abc' }

    await service.setSession(tokens, user)

    expect(service.getState()).toEqual({
      status: 'authenticated',
      user,
      tokens
    })
    expect(store.load()).toEqual({ tokens, user })
    expect(onStateChanged).toHaveBeenCalledWith({
      status: 'authenticated',
      user,
      tokens
    })
  })

  it('dispatches userSyncCallback when authentication succeeds via setSession', async () => {
    const store = new MemoryAuthStore()
    const userSyncCallback = vi.fn()
    const service = new AuthService({ store, userSyncCallback })

    const user: AuthUser = { id: 'usr_sync_1', email: 'sync@example.com', name: 'Sync User' }
    const tokens: AuthTokens = { accessToken: 'token-abc' }

    await service.setSession(tokens, user)

    expect(userSyncCallback).toHaveBeenCalledTimes(1)
    expect(userSyncCallback).toHaveBeenCalledWith(user)
  })

  it('dispatches userSyncCallback when authentication succeeds via deep link', async () => {
    const store = new MemoryAuthStore()
    const userSyncCallback = vi.fn()
    const dummyUser: AuthUser = {
      id: 'usr_sync_2',
      email: 'deep@example.com',
      name: 'Deep User'
    }
    const tokenVerifier = vi.fn().mockResolvedValue(dummyUser)
    const service = new AuthService({ store, tokenVerifier, userSyncCallback })

    const callbackUrl =
      'voicedesk://auth/callback#access_token=xyz987&refresh_token=ref123&expires_in=3600'
    const success = await service.handleDeepLink(callbackUrl)

    expect(success).toBe(true)
    expect(userSyncCallback).toHaveBeenCalledTimes(1)
    expect(userSyncCallback).toHaveBeenCalledWith(dummyUser)
  })

  it('syncUserToBackend sends a POST request with the user payload and returns true on success', async () => {
    const user: AuthUser = {
      id: 'usr_backend_1',
      email: 'backend@example.com',
      name: 'Backend User',
      avatarUrl: 'https://example.com/pic.png'
    }

    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const result = await syncUserToBackend(user, 'http://test-server:3001')

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('http://test-server:3001/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: 'usr_backend_1',
        email: 'backend@example.com',
        name: 'Backend User',
        avatarUrl: 'https://example.com/pic.png'
      })
    })

    vi.unstubAllGlobals()
  })
})

