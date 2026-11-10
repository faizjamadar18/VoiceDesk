import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { APP_ACTIONS_CATALOG, getAppActions } from './app-actions-catalog'
import { AppDetailModal } from './AppDetailModal'
import { AppRow } from './AppRow'
import { AppsPage } from './AppsPage'
import { INITIAL_APPS } from './dummy-data'
import type { AppItem } from './types'

describe('Apps Tab (App Store) Configuration & Data', () => {
  it('defines exactly 15 authentic VoiceOS integrations matching the reference specification', () => {
    expect(INITIAL_APPS).toHaveLength(15)

    const names = INITIAL_APPS.map((a) => a.name)
    expect(names).toEqual([
      'Notion',
      'Manus',
      'Claude Code',
      'Spotify',
      'Slack',
      'Gmail',
      'Google Calendar',
      'Outlook',
      'Google Drive',
      'Linear',
      'Jira',
      'Codex',
      'Obsidian',
      'Canvas',
      'X (Twitter)'
    ])
  })

  it('initializes with Notion connected and all other 14 apps available', () => {
    const connected = INITIAL_APPS.filter((a) => a.connected)
    const available = INITIAL_APPS.filter((a) => !a.connected)

    expect(connected).toHaveLength(1)
    expect(connected[0].name).toBe('Notion')
    expect(connected[0].description).toBe('Manage pages and databases')

    expect(available).toHaveLength(14)
  })

  it('marks beta status on Spotify, Slack, Codex, Obsidian, and X (Twitter)', () => {
    const betaApps = INITIAL_APPS.filter((a) => a.beta).map((a) => a.name)
    expect(betaApps).toEqual(['Spotify', 'Slack', 'Codex', 'Obsidian', 'X (Twitter)'])
  })

  it('provides non-empty descriptions and valid icon assets for all apps', () => {
    for (const app of INITIAL_APPS) {
      expect(app.id).toBeTruthy()
      expect(app.slug).toBeTruthy()
      expect(app.name).toBeTruthy()
      expect(app.description).toBeTruthy()
      expect(app.iconUrl).toBeTruthy()
      expect(app.official).toBe(true)
    }
  })

  it('defines expected descriptions for core integrations matching VoiceOS bundle', () => {
    const manus = INITIAL_APPS.find((a) => a.id === 'manus')
    expect(manus?.description).toBe('Have Manus do tasks for you by voice.')

    const claudeCode = INITIAL_APPS.find((a) => a.id === 'claude-code')
    expect(claudeCode?.description).toBe('Give Claude Code tasks by voice.')

    const gmail = INITIAL_APPS.find((a) => a.id === 'gmail')
    expect(gmail?.description).toBe('Send, read, and manage emails')

    const gcal = INITIAL_APPS.find((a) => a.id === 'googlecalendar')
    expect(gcal?.description).toBe('View and create calendar events')

    const gdrive = INITIAL_APPS.find((a) => a.id === 'googlesuper')
    expect(gdrive?.description).toBe('Manage files, Sheets, and Docs')
  })
})

describe('Apps Tab State Transitions', () => {
  it('toggles an app connection state reactively without affecting others', () => {
    let apps: AppItem[] = [...INITIAL_APPS]

    const toggleApp = (id: string, connected: boolean): void => {
      apps = apps.map((a) => (a.id === id ? { ...a, connected } : a))
    }

    // Connect Spotify
    toggleApp('spotify', true)
    expect(apps.find((a) => a.id === 'spotify')?.connected).toBe(true)
    expect(apps.filter((a) => a.connected)).toHaveLength(2)

    // Disconnect Notion
    toggleApp('notion', false)
    expect(apps.find((a) => a.id === 'notion')?.connected).toBe(false)
    expect(apps.filter((a) => a.connected)).toHaveLength(1)
    expect(apps.filter((a) => a.connected)[0].name).toBe('Spotify')

    // Re-connect Notion
    toggleApp('notion', true)
    expect(apps.find((a) => a.id === 'notion')?.connected).toBe(true)
    expect(apps.filter((a) => a.connected)).toHaveLength(2)
  })
})

describe('App Actions Catalog & Mapping', () => {
  it('contains actions for all 15 authentic VoiceOS apps with exact action counts', () => {
    const expectedCounts: Record<string, number> = {
      gmail: 7,
      googlecalendar: 7,
      spotify: 13,
      slack: 9,
      outlook: 11,
      googlesuper: 17,
      linear: 10,
      jira: 11,
      notion: 9,
      canvas: 13,
      twitter: 9,
      obsidian: 4,
      codex: 8,
      'claude-code': 5,
      manus: 6
    }

    const catalogKeys = Object.keys(APP_ACTIONS_CATALOG)
    expect(catalogKeys).toEqual(Object.keys(expectedCounts))

    for (const [appId, count] of Object.entries(expectedCounts)) {
      const actions = getAppActions(appId)
      expect(actions).toHaveLength(count)
      for (const action of actions) {
        expect(action.id).toBeTruthy()
        expect(action.name).toBeTruthy()
        expect(action.description).toBeTruthy()
        expect(typeof action.asksFirst).toBe('boolean')
      }
    }
  })

  it('supports case-insensitive lookup and whitespace trimming in getAppActions', () => {
    expect(getAppActions('  Gmail  ')).toHaveLength(7)
    expect(getAppActions('GOOGLECALENDAR')).toHaveLength(7)
    expect(getAppActions('CLAUDE-CODE')).toHaveLength(5)
    expect(getAppActions('non-existent-app')).toEqual([])
  })

  it('defines actions with asksFirst=false for designated safe actions', () => {
    const claudeActions = getAppActions('claude-code')
    const openAction = claudeActions.find((a) => a.id === 'open')
    expect(openAction?.asksFirst).toBe(false)

    const manusActions = getAppActions('manus')
    const statusAction = manusActions.find((a) => a.id === 'status')
    const creationsAction = manusActions.find((a) => a.id === 'creations')
    const skillsAction = manusActions.find((a) => a.id === 'skills')
    const creditsAction = manusActions.find((a) => a.id === 'credits')

    expect(statusAction?.asksFirst).toBe(false)
    expect(creationsAction?.asksFirst).toBe(false)
    expect(skillsAction?.asksFirst).toBe(false)
    expect(creditsAction?.asksFirst).toBe(false)
  })

  it('defines actions with asksFirst=true for sensitive actions', () => {
    const gmailActions = getAppActions('gmail')
    const send = gmailActions.find((a) => a.id === 'send')
    const deleteAction = gmailActions.find((a) => a.id === 'delete')
    expect(send?.asksFirst).toBe(true)
    expect(deleteAction?.asksFirst).toBe(true)
  })
})

describe('AppDetailModal Component & Behavior', () => {
  it('returns empty HTML when app is null', () => {
    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: null,
        onClose: () => {}
      })
    )
    expect(html).toBe('')
  })

  it('renders a full modal structure for a selected app matching VoiceOS specifications', () => {
    const gmailApp = INITIAL_APPS.find((a) => a.id === 'gmail')!
    const onClose = vi.fn()
    const onToggleConnect = vi.fn()

    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: gmailApp,
        onClose,
        onToggleConnect,
        isDarkMode: true
      })
    )

    // Modal role and backdrop
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Gmail"')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('title="Close"')
    expect(html).toContain('modal-backdrop app-detail-backdrop')
    expect(html).toContain('app-detail-modal')

    // Hero section
    expect(html).toContain('Gmail')
    expect(html).toContain('Send, read, and manage emails')
    expect(html).toContain('Connect')

    // Info Strip cells
    expect(html).toContain('VERSION')
    expect(html).toContain('1.0.0')
    expect(html).toContain('Built-in')
    expect(html).toContain('DEVELOPER')
    expect(html).toContain('VoiceOS')
    expect(html).toContain('ACTIONS')
    expect(html).toContain('7')
    expect(html).toContain('actions')

    // Actions section
    expect(html).toContain('Actions')
    expect(html).toContain('What Agent Mode can do with this app.')
    expect(html).toContain('Send an email')
    expect(html).toContain('Reply to a thread')
    expect(html).toContain('Read and search mail')
    expect(html).toContain('Delete permanently')
    expect(html).toContain('Ask permission')
  })

  it('renders connected state switch when app is connected', () => {
    const notionApp = INITIAL_APPS.find((a) => a.id === 'notion')!
    expect(notionApp.connected).toBe(true)

    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: notionApp,
        onClose: () => {},
        isDarkMode: true
      })
    )

    // Should contain the switch and NOT the connect button
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Notion: Disconnect')
    expect(html).not.toContain('>Connect<')
  })

  it('renders beta badge on apps with beta status', () => {
    const spotifyApp = INITIAL_APPS.find((a) => a.id === 'spotify')!
    expect(spotifyApp.beta).toBe(true)

    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: spotifyApp,
        onClose: () => {},
        isDarkMode: true
      })
    )

    expect(html).toContain('BETA')
  })

  it('renders both Ask permission and Don\'t ask buttons according to action defaults', () => {
    const claudeApp = INITIAL_APPS.find((a) => a.id === 'claude-code')!

    const html = renderToStaticMarkup(
      createElement(AppDetailModal, {
        app: claudeApp,
        onClose: () => {},
        isDarkMode: true
      })
    )

    expect(html).toContain('Ask permission')
    expect(html).toContain('Don&#x27;t ask')
  })
})

describe('AppRow & AppsPage Interaction', () => {
  it('renders AppRow with cursor-pointer and onSelect binding', () => {
    const notionApp = INITIAL_APPS.find((a) => a.id === 'notion')!
    const onSelect = vi.fn()
    const onToggle = vi.fn()

    const html = renderToStaticMarkup(
      createElement(AppRow, {
        app: notionApp,
        onToggle,
        onSelect
      })
    )

    expect(html).toContain('app-row-item')
    expect(html).toContain('cursor-pointer')
    expect(html).toContain('Notion')
    expect(html).toContain('role="button"')
  })

  it('renders AppStore tabs and sections in AppsPage properly', () => {
    const html = renderToStaticMarkup(createElement(AppsPage, {}))
    expect(html).toContain('App Store')
    expect(html).toContain('Connect apps to use with Agent Mode')
    expect(html).toContain('Official')
    expect(html).toContain('Custom')
    expect(html).toContain('Connected')
    expect(html).toContain('Available')
  })
})
