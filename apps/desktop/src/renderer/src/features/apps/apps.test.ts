import { describe, expect, it } from 'vitest'
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

