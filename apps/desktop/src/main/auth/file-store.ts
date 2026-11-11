import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AuthStore, AuthTokens, AuthUser } from './auth-service'

export class FileAuthStore implements AuthStore {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  save(session: { tokens: AuthTokens; user: AuthUser }): void {
    try {
      const data = JSON.stringify(session, null, 2)
      writeFileSync(this.filePath, data, 'utf8')
    } catch (error) {
      console.error('[auth] failed to persist auth session', error)
    }
  }

  load(): { tokens: AuthTokens; user: AuthUser } | null {
    try {
      if (!existsSync(this.filePath)) return null
      const data = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(data) as { tokens: AuthTokens; user: AuthUser }
      if (parsed && parsed.tokens && parsed.user) {
        return parsed
      }
      return null
    } catch (error) {
      console.error('[auth] failed to load persisted auth session', error)
      return null
    }
  }

  clear(): void {
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath)
      }
    } catch (error) {
      console.error('[auth] failed to clear persisted auth session', error)
    }
  }
}

