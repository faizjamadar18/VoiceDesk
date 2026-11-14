import { describe, expect, it, vi } from 'vitest'
import type { IntegrationsStatus, KestrelApi } from '../../../../shared/types'
import { runIntegrationToggle } from './AppsPage'

const STATUS: IntegrationsStatus = {
  hasKey: true,
  keySource: 'stored',
  sessionId: 'sess-1',
  providers: [],
  error: null
}

type ToggleApi = Pick<
  KestrelApi,
  'connectIntegration' | 'disconnectIntegration' | 'refreshIntegrations'
>

function api(overrides: Partial<ToggleApi> = {}): ToggleApi {
  return {
    connectIntegration: async () => ({ ok: true, url: null, message: '' }),
    disconnectIntegration: async () => ({ ok: true, message: '' }),
    refreshIntegrations: async () => STATUS,
    ...overrides
  }
}

describe('runIntegrationToggle', () => {
  it('disconnects the app when the toggle is turned off', async () => {
    const disconnectIntegration = vi.fn(async () => ({
      ok: true,
      message: 'Google Drive disconnected. You can connect a different account now.'
    }))

    const outcome = await runIntegrationToggle(
      'googlesuper',
      false,
      STATUS,
      api({ disconnectIntegration })
    )

    expect(disconnectIntegration).toHaveBeenCalledWith('googlesuper')
    expect(outcome).toEqual({
      message:
        'Google Drive disconnected. You can connect a different account now.',
      refresh: true
    })
  })

  it('reports a failed disconnect without refreshing', async () => {
    const outcome = await runIntegrationToggle(
      'googlesuper',
      false,
      STATUS,
      api({
        disconnectIntegration: async () => ({
          ok: false,
          message: 'Composio request failed (HTTP 500).'
        })
      })
    )

    expect(outcome).toEqual({
      message: 'Composio request failed (HTTP 500).',
      refresh: false
    })
  })

  it('returns the thrown error message', async () => {
    const outcome = await runIntegrationToggle(
      'googlesuper',
      false,
      STATUS,
      api({
        disconnectIntegration: async () => {
          throw new Error('offline')
        }
      })
    )

    expect(outcome).toEqual({ message: 'offline', refresh: false })
  })

  it('asks the user to try again when disconnect is unavailable', async () => {
    const outcome = await runIntegrationToggle(
      'googlesuper',
      false,
      STATUS,
      undefined
    )

    expect(outcome).toEqual({
      message: 'Could not disconnect the app. Please try again.',
      refresh: false
    })
  })

  it('still connects when the toggle is turned on', async () => {
    const connectIntegration = vi.fn(async () => ({
      ok: true,
      url: 'https://composio.dev/connect/abc',
      message: 'Approve access in your browser, then come back here.'
    }))

    const outcome = await runIntegrationToggle(
      'googlesuper',
      true,
      STATUS,
      api({ connectIntegration })
    )

    expect(connectIntegration).toHaveBeenCalledWith('googlesuper')
    expect(outcome).toEqual({
      message: 'Approve access in your browser, then come back here.',
      refresh: true
    })
  })
})
