/**
 * The Composio providers Kestrel can drive by voice.
 *
 * Each entry names a Composio toolkit and the exact tool slugs Kestrel is
 * allowed to expose from it. Adding a provider means appending one entry to
 * `COMPOSIO_PROVIDERS` below and nothing else: Gmail, Google Drive, and Notion
 * get added later by appending entries here, nothing else.
 */

import type { ComposioProviderId, ComposioProviderSpec } from './types'

export const COMPOSIO_PROVIDERS: readonly ComposioProviderSpec[] = [
  {
    id: 'googlecalendar',
    label: 'Google Calendar',
    toolkit: 'googlecalendar',
    tools: [
      'GOOGLECALENDAR_EVENTS_LIST',
      'GOOGLECALENDAR_CREATE_EVENT',
      'GOOGLECALENDAR_PATCH_EVENT',
      'GOOGLECALENDAR_DELETE_EVENT'
    ],
    connectHint:
      'Connect Google Calendar to schedule, move, and cancel meetings by voice.'
  }
]

/** Look up a provider spec by id, or `null` when Kestrel does not know it. */
export function providerById(
  id: ComposioProviderId
): ComposioProviderSpec | null {
  return COMPOSIO_PROVIDERS.find((provider) => provider.id === id) ?? null
}
