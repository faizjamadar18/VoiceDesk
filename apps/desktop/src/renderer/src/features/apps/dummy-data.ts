import type { AppItem } from './types'
import notionIcon from './assets/notion-D2S2HET5.webp'
import manusIcon from './assets/manus-CljnQL4A.png'
import claudeCodeIcon from './assets/claude-code-Dw3-grMH.webp'
import spotifyIcon from './assets/spotify-BFgRiOrv.webp'
import slackIcon from './assets/slack-Bj1CmN7u.webp'
import gmailIcon from './assets/gmail-BUTd6bEJ.webp'
import googleCalendarIcon from './assets/google-calendar-CKPlrU38.png'
import outlookIcon from './assets/outlook-BSRmcVCt.webp'
import googleDriveIcon from './assets/googledrive-DIPm4m7m.webp'
import linearIcon from './assets/linear-DztaJEkQ.webp'
import jiraIcon from './assets/jira-DpFHaLoP.svg'
import codexIcon from './assets/codex-D9jbUyKb.webp'
import obsidianIcon from './assets/obsidian-BjtW_doA.webp'
import canvasIcon from './assets/canvas-BoTJMpxX.webp'
import twitterIcon from './assets/x-Bn5IjkS-.webp'

export const INITIAL_APPS: AppItem[] = [
  {
    id: 'notion',
    slug: 'notion',
    name: 'Notion',
    description: 'Manage pages and databases',
    iconUrl: notionIcon,
    connected: false,
    category: 'noteTaking',
    official: true
  },
  {
    id: 'manus',
    slug: 'manus',
    name: 'Manus',
    description: 'Have Manus do tasks for you by voice.',
    iconUrl: manusIcon,
    connected: false,
    category: 'productivity',
    official: true
  },
  {
    id: 'claude-code',
    slug: 'claude-code',
    name: 'Claude Code',
    description: 'Give Claude Code tasks by voice.',
    iconUrl: claudeCodeIcon,
    connected: false,
    category: 'developer',
    official: true
  },
  {
    id: 'spotify',
    slug: 'spotify',
    name: 'Spotify',
    description: 'Play your playlists and liked songs, save music, and control playback',
    iconUrl: spotifyIcon,
    connected: false,
    beta: true,
    category: 'media',
    official: true
  },
  {
    id: 'slack',
    slug: 'slack',
    name: 'Slack',
    description: 'Read and send messages',
    iconUrl: slackIcon,
    connected: false,
    beta: true,
    category: 'messages',
    official: true
  },
  {
    id: 'gmail',
    slug: 'gmail',
    name: 'Gmail',
    description: 'Send, read, and manage emails',
    iconUrl: gmailIcon,
    connected: false,
    category: 'email',
    official: true
  },
  {
    id: 'googlecalendar',
    slug: 'googlecalendar',
    name: 'Google Calendar',
    description: 'View and create calendar events',
    iconUrl: googleCalendarIcon,
    connected: false,
    category: 'calendar',
    official: true
  },
  {
    id: 'outlook',
    slug: 'outlook',
    name: 'Outlook',
    description: 'Email, calendar, and contacts in Microsoft 365',
    iconUrl: outlookIcon,
    connected: false,
    category: 'email',
    official: true
  },
  {
    id: 'googlesuper',
    slug: 'googlesuper',
    name: 'Google Drive',
    description: 'Manage files, Sheets, and Docs',
    iconUrl: googleDriveIcon,
    connected: false,
    category: 'productivity',
    official: true
  },
  {
    id: 'linear',
    slug: 'linear',
    name: 'Linear',
    description: 'Create, manage, and track issues',
    iconUrl: linearIcon,
    connected: false,
    category: 'productivity',
    official: true
  },
  {
    id: 'jira',
    slug: 'jira',
    name: 'Jira',
    description: 'Create, update, search, and manage Jira issues and projects',
    iconUrl: jiraIcon,
    connected: false,
    category: 'productivity',
    official: true
  },
  {
    id: 'codex',
    slug: 'codex',
    name: 'Codex',
    description: 'Run coding tasks with the Codex app or CLI on your computer',
    iconUrl: codexIcon,
    connected: false,
    beta: true,
    category: 'developer',
    official: true
  },
  {
    id: 'obsidian',
    slug: 'obsidian',
    name: 'Obsidian',
    description: 'Read, create, and append vault notes',
    iconUrl: obsidianIcon,
    connected: false,
    beta: true,
    category: 'noteTaking',
    official: true
  },
  {
    id: 'canvas',
    slug: 'canvas',
    name: 'Canvas',
    description: 'View courses and assignments',
    iconUrl: canvasIcon,
    connected: false,
    category: 'productivity',
    official: true
  },
  {
    id: 'twitter',
    slug: 'twitter',
    name: 'X (Twitter)',
    description: 'Post, search, and engage on X',
    iconUrl: twitterIcon,
    connected: false,
    beta: true,
    category: 'social',
    official: true
  }
]

