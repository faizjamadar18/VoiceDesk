import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppDetailModal } from './AppDetailModal'
import { getAppActions } from './app-actions-catalog'
import type { AppItem } from './types'

const MOCK_SLACK_APP: AppItem = {
  id: 'slack',
  slug: 'slack',
  name: 'Slack',
  description: 'Read and send messages',
  iconUrl: 'slack.webp',
  connected: true,
  category: 'messages',
  official: true
}

const MOCK_GMAIL_APP: AppItem = {
  id: 'gmail',
  slug: 'gmail',
  name: 'Gmail',
  description: 'Send, read, and manage emails',
  iconUrl: 'gmail.webp',
  connected: true,
  category: 'email',
  official: true
}

const MOCK_CLAUDE_APP: AppItem = {
  id: 'claude-code',
  slug: 'claude-code',
  name: 'Claude Code',
  description: 'Give Claude Code tasks by voice.',
  iconUrl: 'claude.webp',
  connected: false,
  category: 'developer',
  official: true
}

describe('App Actions Catalog - VoiceOS confirmable vs safe read actions', () => {
  it('correctly marks Slack mutating actions as confirmable and safe queries as non-confirmable', () => {
    const actions = getAppActions('slack')
    const confirmableIds = actions.filter((a) => a.confirmable).map((a) => a.id)
    const nonConfirmableIds = actions.filter((a) => !a.confirmable).map((a) => a.id)

    expect(confirmableIds).toEqual(['send', 'schedule', 'reaction', 'reminder', 'upload'])
    expect(nonConfirmableIds).toEqual(['read', 'search', 'directory', 'dm'])
  })

  it('correctly marks Gmail mutating actions as confirmable and safe queries as non-confirmable', () => {
    const actions = getAppActions('gmail')
    const confirmableIds = actions.filter((a) => a.confirmable).map((a) => a.id)
    const nonConfirmableIds = actions.filter((a) => !a.confirmable).map((a) => a.id)

    expect(confirmableIds).toEqual(['send', 'reply', 'labels', 'trash', 'delete'])
    expect(nonConfirmableIds).toEqual(['read', 'contacts'])
  })

  it('correctly marks Google Calendar mutating actions as confirmable and safe queries as non-confirmable', () => {
    const actions = getAppActions('googlecalendar')
    const confirmableIds = actions.filter((a) => a.confirmable).map((a) => a.id)
    const nonConfirmableIds = actions.filter((a) => !a.confirmable).map((a) => a.id)

    expect(confirmableIds).toEqual(['create', 'quick-add', 'update', 'delete'])
    expect(nonConfirmableIds).toEqual(['read', 'free-slots', 'calendars'])
  })

  it('correctly marks Spotify mutating actions as confirmable and playback/reading as non-confirmable', () => {
    const actions = getAppActions('spotify')
    const confirmableIds = actions.filter((a) => a.confirmable).map((a) => a.id)
    const nonConfirmableIds = actions.filter((a) => !a.confirmable).map((a) => a.id)

    expect(confirmableIds).toEqual(['like', 'unlike', 'create', 'edit'])
    expect(nonConfirmableIds).toEqual([
      'playlists',
      'liked',
      'search',
      'playing',
      'play',
      'queue',
      'shuffle',
      'volume',
      'devices'
    ])
  })

  it('marks coding agents (Claude Code, Codex) actions as non-confirmable', () => {
    const claudeActions = getAppActions('claude-code')
    expect(claudeActions.every((a) => !a.confirmable)).toBe(true)

    const codexActions = getAppActions('codex')
    expect(codexActions.every((a) => !a.confirmable)).toBe(true)
  })
})

describe('AppDetailModal UI - Permission pills rendering', () => {
  it('renders permission pills ONLY for confirmable actions in Slack modal', () => {
    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: MOCK_SLACK_APP,
        onClose: () => {},
        portal: false
      })
    )

    // Count occurrences of app-action-pill in the rendered output
    const pillMatches = html.match(/class="[^"]*app-action-pill[^"]*"/g) || []
    expect(pillMatches.length).toBe(5)

    // Confirm that confirmable actions show permission label
    expect(html).toContain('Send a message')
    expect(html).toContain('Schedule a message')

    // Confirm that safe read actions exist but have NO pill attached
    expect(html).toContain('Read conversations')
    expect(html).toContain('Search messages')
    expect(html).toContain('Find channels and people')
    expect(html).toContain('Open a DM')
  })

  it('renders permission pills ONLY for confirmable actions in Gmail modal', () => {
    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: MOCK_GMAIL_APP,
        onClose: () => {},
        portal: false
      })
    )

    const pillMatches = html.match(/class="[^"]*app-action-pill[^"]*"/g) || []
    expect(pillMatches.length).toBe(5)
  })

  it('renders zero permission pills for Claude Code modal', () => {
    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: MOCK_CLAUDE_APP,
        onClose: () => {},
        portal: false
      })
    )

    const pillMatches = html.match(/class="[^"]*app-action-pill[^"]*"/g) || []
    expect(pillMatches.length).toBe(0)
  })
})
