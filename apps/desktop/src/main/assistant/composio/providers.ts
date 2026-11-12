/**
 * The Composio providers Kestrel can drive by voice.
 *
 * Each entry names a Composio toolkit and the exact tool slugs Kestrel is
 * allowed to expose from it. Adding a provider means appending one entry to
 * `COMPOSIO_PROVIDERS` below and nothing else: Google Drive and Notion get
 * added later by appending entries here, nothing else.
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
  },
  {
    id: 'gmail',
    label: 'Gmail',
    toolkit: 'gmail',
    tools: [
      'GMAIL_FETCH_EMAILS',
      'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
      'GMAIL_SEND_EMAIL',
      'GMAIL_REPLY_TO_THREAD',
      'GMAIL_CREATE_EMAIL_DRAFT'
    ],
    connectHint:
      'Connect Gmail to read, send, reply to, and draft emails by voice.'
  }
]

/** Look up a provider spec by id, or `null` when Kestrel does not know it. */
export function providerById(
  id: ComposioProviderId
): ComposioProviderSpec | null {
  return COMPOSIO_PROVIDERS.find((provider) => provider.id === id) ?? null
}
