/**
 * The Composio providers Kestrel can drive by voice.
 *
 * Each entry names a Composio toolkit and the exact tool slugs Kestrel is
 * allowed to expose from it. A provider is added by appending one entry to
 * `COMPOSIO_PROVIDERS` below, so the rest of the integration keeps working
 * from this list alone.
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
  },
  {
    id: 'googlesuper',
    label: 'Google Drive',
    toolkit: 'googlesuper',
    tools: [
      'GOOGLESUPER_FIND_FILE',
      'GOOGLESUPER_CREATE_FILE_FROM_TEXT',
      'GOOGLESUPER_CREATE_PERMISSION',
      'GOOGLESUPER_GOOGLE_DRIVE_DELETE_FOLDER_OR_FILE_ACTION'
    ],
    connectHint:
      'Connect Google Drive to find, create, share, and delete files by voice.'
  },
  {
    id: 'notion',
    label: 'Notion',
    toolkit: 'notion',
    tools: [
      'NOTION_SEARCH_NOTION_PAGE',
      'NOTION_FETCH_BLOCK_CONTENTS',
      'NOTION_QUERY_DATABASE',
      'NOTION_CREATE_NOTION_PAGE'
    ],
    connectHint: 'Connect Notion to find, read, and create pages by voice.'
  }
]

/** Look up a provider spec by id, or `null` when Kestrel does not know it. */
export function providerById(
  id: ComposioProviderId
): ComposioProviderSpec | null {
  return COMPOSIO_PROVIDERS.find((provider) => provider.id === id) ?? null
}
