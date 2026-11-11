import { parseAuthDeepLink, type AuthTokens } from './url-parser'

export { type AuthTokens }

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
}

export type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating'; startedAt: number }
  | { status: 'authenticated'; user: AuthUser; tokens: AuthTokens }
  | { status: 'error'; message: string }

export interface AuthStore {
  save(session: { tokens: AuthTokens; user: AuthUser }): Promise<void> | void
  load():
    | Promise<{ tokens: AuthTokens; user: AuthUser } | null>
    | { tokens: AuthTokens; user: AuthUser }
    | null
  clear(): Promise<void> | void
}

export interface AuthServiceOptions {
  store?: AuthStore
  onStateChanged?: (state: AuthState) => void
  tokenVerifier?: (tokens: AuthTokens) => Promise<AuthUser>
}

/**
 * Parses claims from an unverified JWT access token payload (for client-side display).
 */
function decodeJwtUser(token: string): AuthUser | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(
      Buffer.from(payloadBase64, 'base64').toString('utf8')
    ) as Record<string, unknown>

    const sub = typeof decoded.sub === 'string' ? decoded.sub : ''
    const email = typeof decoded.email === 'string' ? decoded.email : ''
    const metadata =
      typeof decoded.user_metadata === 'object' && decoded.user_metadata !== null
        ? (decoded.user_metadata as Record<string, unknown>)
        : {}

    const name =
      typeof metadata.full_name === 'string'
        ? metadata.full_name
        : typeof metadata.name === 'string'
          ? metadata.name
          : undefined
    const avatarUrl =
      typeof metadata.avatar_url === 'string'
        ? metadata.avatar_url
        : typeof metadata.picture === 'string'
          ? metadata.picture
          : undefined

    if (!sub && !email) return null
    return {
      id: sub || 'user',
      email: email || 'user@voiceos.com',
      name,
      avatarUrl
    }
  } catch {
    return null
  }
}

export class AuthService {
  private state: AuthState = { status: 'unauthenticated' }
  private readonly store?: AuthStore
  private readonly onStateChanged?: (state: AuthState) => void
  private readonly tokenVerifier?: (tokens: AuthTokens) => Promise<AuthUser>

  constructor(options: AuthServiceOptions = {}) {
    this.store = options.store
    this.onStateChanged = options.onStateChanged
    this.tokenVerifier = options.tokenVerifier

    if (this.store) {
      const stored = this.store.load()
      if (stored && 'then' in stored) {
        // Promise
        void stored.then((data) => {
          if (data && data.tokens && data.user) {
            this.setState({
              status: 'authenticated',
              user: data.user,
              tokens: data.tokens
            })
          }
        })
      } else if (stored && stored.tokens && stored.user) {
        this.state = {
          status: 'authenticated',
          user: stored.user,
          tokens: stored.tokens
        }
      }
    }
  }

  private setState(next: AuthState): void {
    this.state = next
    this.onStateChanged?.(next)
  }

  getState(): AuthState {
    return this.state
  }

  startLogin(): void {
    this.setState({
      status: 'authenticating',
      startedAt: Date.now()
    })
  }

  async handleDeepLink(url: string): Promise<boolean> {
    const parsed = parseAuthDeepLink(url)

    if (!parsed.ok) {
      this.setState({
        status: 'error',
        message: parsed.error
      })
      return false
    }

    if (parsed.kind === 'tokens') {
      const tokens = parsed.tokens
      let user: AuthUser | null = null

      if (this.tokenVerifier) {
        try {
          user = await this.tokenVerifier(tokens)
        } catch (error) {
          this.setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Authentication verification failed'
          })
          return false
        }
      } else {
        user = decodeJwtUser(tokens.accessToken) ?? {
          id: 'user',
          email: 'user@voiceos.com'
        }
      }

      await this.setSession(tokens, user)
      return true
    }

    // Code flow (PKCE)
    if (parsed.kind === 'code') {
      // Code will be exchanged via renderer/Supabase client
      return true
    }

    return false
  }

  async setSession(tokens: AuthTokens, user: AuthUser): Promise<void> {
    const nextState: AuthState = {
      status: 'authenticated',
      user,
      tokens
    }
    if (this.store) {
      await this.store.save({ tokens, user })
    }
    this.setState(nextState)
  }

  async signOut(): Promise<void> {
    if (this.store) {
      await this.store.clear()
    }
    this.setState({ status: 'unauthenticated' })
  }
}

