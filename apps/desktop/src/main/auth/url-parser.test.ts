import { describe, expect, it } from 'vitest'
import { parseAuthDeepLink } from './url-parser'

describe('parseAuthDeepLink', () => {
  it('parses hash fragment tokens from voicedesk://auth/callback', () => {
    const url =
      'voicedesk://auth/callback#access_token=test-access-token&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer'
    const result = parseAuthDeepLink(url)

    expect(result).toEqual({
      ok: true,
      kind: 'tokens',
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
        tokenType: 'bearer'
      }
    })
  })

  it('parses query params authorization code from voicedesk://auth/callback', () => {
    const url = 'voicedesk://auth/callback?code=test-auth-code'
    const result = parseAuthDeepLink(url)

    expect(result).toEqual({
      ok: true,
      kind: 'code',
      code: 'test-auth-code'
    })
  })

  it('parses tokens provided in query parameters instead of hash fragment', () => {
    const url =
      'voicedesk://auth/callback?access_token=query-access-token&refresh_token=query-refresh-token&expires_in=1800'
    const result = parseAuthDeepLink(url)

    expect(result).toEqual({
      ok: true,
      kind: 'tokens',
      tokens: {
        accessToken: 'query-access-token',
        refreshToken: 'query-refresh-token',
        expiresIn: 1800,
        tokenType: undefined
      }
    })
  })

  it('rejects URLs with an invalid or unexpected protocol scheme', () => {
    const url = 'https://voicedesk.com/auth/callback#access_token=abc'
    const result = parseAuthDeepLink(url)

    expect(result).toEqual({
      ok: false,
      code: 'UNSUPPORTED_SCHEME',
      error: 'Expected URL to start with voicedesk://'
    })
  })

  it('rejects URLs with the wrong host or path', () => {
    const wrongHost = 'voicedesk://other/callback#access_token=abc'
    expect(parseAuthDeepLink(wrongHost)).toEqual({
      ok: false,
      code: 'WRONG_PATH',
      error: 'Expected callback host and path to be auth/callback'
    })

    const wrongPath = 'voicedesk://auth/unknown#access_token=abc'
    expect(parseAuthDeepLink(wrongPath)).toEqual({
      ok: false,
      code: 'WRONG_PATH',
      error: 'Expected callback host and path to be auth/callback'
    })
  })

  it('parses OAuth error parameters and returns an AUTH_ERROR failure', () => {
    const errorUrl =
      'voicedesk://auth/callback?error=access_denied&error_description=User+denied+access'
    const result = parseAuthDeepLink(errorUrl)

    expect(result).toEqual({
      ok: false,
      code: 'AUTH_ERROR',
      error: 'User denied access'
    })
  })

  it('falls back to error code if error_description is omitted', () => {
    const errorUrl = 'voicedesk://auth/callback?error=server_error'
    const result = parseAuthDeepLink(errorUrl)

    expect(result).toEqual({
      ok: false,
      code: 'AUTH_ERROR',
      error: 'server_error'
    })
  })

  it('rejects malformed or empty URLs', () => {
    expect(parseAuthDeepLink('')).toEqual({
      ok: false,
      code: 'INVALID_URL',
      error: 'Invalid or empty URL'
    })

    expect(parseAuthDeepLink('not-a-valid-url')).toEqual({
      ok: false,
      code: 'INVALID_URL',
      error: 'Invalid or empty URL'
    })
  })

  it('rejects callback URLs that contain neither tokens nor code nor error', () => {
    const url = 'voicedesk://auth/callback'
    const result = parseAuthDeepLink(url)

    expect(result).toEqual({
      ok: false,
      code: 'MISSING_PAYLOAD',
      error: 'No tokens, auth code, or error found in callback URL'
    })
  })
})

