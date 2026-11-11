export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: string
}

export type AuthParseSuccess =
  | {
      ok: true
      kind: 'tokens'
      tokens: AuthTokens
    }
  | {
      ok: true
      kind: 'code'
      code: string
    }

export type AuthParseFailure = {
  ok: false
  code:
    | 'INVALID_URL'
    | 'UNSUPPORTED_SCHEME'
    | 'WRONG_PATH'
    | 'AUTH_ERROR'
    | 'MISSING_PAYLOAD'
  error: string
}

export type AuthParseResult = AuthParseSuccess | AuthParseFailure

const PROTOCOL_PREFIX = 'voicedesk://'
const EXPECTED_ROUTE = 'auth/callback'

/**
 * Parses a voicedesk://auth/callback URL from a custom protocol deep link,
 * extracting either direct OAuth tokens (from hash or query), an authorization
 * code, or returning structured error diagnostics.
 */
export function parseAuthDeepLink(rawUrl: string): AuthParseResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      ok: false,
      code: 'INVALID_URL',
      error: 'Invalid or empty URL'
    }
  }

  const trimmed = rawUrl.trim()
  if (!trimmed.startsWith(PROTOCOL_PREFIX)) {
    // Check if it's not even a URI with that protocol
    return {
      ok: false,
      code: trimmed.includes('://') ? 'UNSUPPORTED_SCHEME' : 'INVALID_URL',
      error: trimmed.includes('://')
        ? `Expected URL to start with ${PROTOCOL_PREFIX}`
        : 'Invalid or empty URL'
    }
  }

  // Strip prefix and parse path, search, and hash
  const remainder = trimmed.slice(PROTOCOL_PREFIX.length)
  const hashIndex = remainder.indexOf('#')
  const queryIndex = remainder.indexOf('?')

  let pathPart = remainder
  let queryPart = ''
  let hashPart = ''

  if (queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)) {
    pathPart = remainder.slice(0, queryIndex)
    if (hashIndex !== -1) {
      queryPart = remainder.slice(queryIndex + 1, hashIndex)
      hashPart = remainder.slice(hashIndex + 1)
    } else {
      queryPart = remainder.slice(queryIndex + 1)
    }
  } else if (hashIndex !== -1) {
    pathPart = remainder.slice(0, hashIndex)
    hashPart = remainder.slice(hashIndex + 1)
  }

  // Normalize path
  const normalizedPath = pathPart.replace(/\/+$/, '')
  if (normalizedPath !== EXPECTED_ROUTE) {
    return {
      ok: false,
      code: 'WRONG_PATH',
      error: `Expected callback host and path to be ${EXPECTED_ROUTE}`
    }
  }

  // Combine query and hash parameters for token/error lookup
  const queryParams = new URLSearchParams(queryPart)
  const hashParams = new URLSearchParams(hashPart)

  // 1. Check for OAuth errors
  const error = queryParams.get('error') || hashParams.get('error')
  if (error) {
    const errorDescription =
      queryParams.get('error_description') ||
      hashParams.get('error_description') ||
      error
    return {
      ok: false,
      code: 'AUTH_ERROR',
      error: errorDescription
    }
  }

  // 2. Check for tokens in hash (standard Supabase / implicit OAuth callback)
  const hashAccessToken = hashParams.get('access_token')
  if (hashAccessToken) {
    const expiresInRaw = hashParams.get('expires_in')
    return {
      ok: true,
      kind: 'tokens',
      tokens: {
        accessToken: hashAccessToken,
        refreshToken: hashParams.get('refresh_token') || undefined,
        expiresIn: expiresInRaw ? Number(expiresInRaw) : undefined,
        tokenType: hashParams.get('token_type') || undefined
      }
    }
  }

  // 3. Check for tokens in query params
  const queryAccessToken = queryParams.get('access_token')
  if (queryAccessToken) {
    const expiresInRaw = queryParams.get('expires_in')
    return {
      ok: true,
      kind: 'tokens',
      tokens: {
        accessToken: queryAccessToken,
        refreshToken: queryParams.get('refresh_token') || undefined,
        expiresIn: expiresInRaw ? Number(expiresInRaw) : undefined,
        tokenType: queryParams.get('token_type') || undefined
      }
    }
  }

  // 4. Check for authorization code (PKCE flow)
  const code = queryParams.get('code') || hashParams.get('code')
  if (code) {
    return {
      ok: true,
      kind: 'code',
      code
    }
  }

  return {
    ok: false,
    code: 'MISSING_PAYLOAD',
    error: 'No tokens, auth code, or error found in callback URL'
  }
}

