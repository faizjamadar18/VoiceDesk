import type { DatabaseSync } from 'node:sqlite'
import type { DeleteAccountResult } from '../../shared/types'
import type { AuthService } from '../auth/auth-service'
import { deleteLocalData } from './delete-local-data'

/** Same default as `syncUserToBackend`. */
export const DEFAULT_API_BASE_URL = 'http://localhost:3001'

export interface DeleteAccountDeps {
  userId: string
  /** The live AuthService instance; only sign-out is used here. */
  auth: Pick<AuthService, 'signOut'>
  /** Test seam; production callers leave it unset. */
  db?: DatabaseSync
  apiBaseUrl?: string
  fetch?: typeof fetch
}

/**
 * Deletes the user's backend record, then their local rows, then signs out.
 * The Supabase login account itself is never touched.
 *
 * Nothing local changes unless the API confirms the user is gone (204) or
 * already gone (404).
 */
export async function deleteAccount(deps: DeleteAccountDeps): Promise<DeleteAccountResult> {
  const fetchImpl = deps.fetch ?? fetch
  const baseUrl = resolveApiBaseUrl(deps.apiBaseUrl)

  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}/api/users/${encodeURIComponent(deps.userId)}`, {
      method: 'DELETE'
    })
  } catch {
    return { ok: false, error: 'Could not reach the server. Your data was not deleted.' }
  }

  if (response.status !== 204 && response.status !== 404) {
    return {
      ok: false,
      error: `The server could not delete your account (${response.status}). Your data was not deleted.`
    }
  }

  try {
    deleteLocalData(deps.userId, deps.db)
    await deps.auth.signOut()
  } catch {
    return { ok: false, error: 'Your local data could not be deleted. Please try again.' }
  }

  return { ok: true }
}

/** Mirrors how `syncUserToBackend` resolves the API host. */
export function resolveApiBaseUrl(explicit?: string): string {
  const base = explicit?.trim() || process.env.API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  return base.replace(/\/+$/, '')
}
