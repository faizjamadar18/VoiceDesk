import type { HelpCenterItem, SettingsTabId, ShortcutCardData, UserProfileData } from './types'

export const INITIAL_USER_PROFILE: UserProfileData = {
  firstName: 'Faiz',
  lastName: '',
  email: 'faiz@voiceos.com',
  avatarInitial: 'F'
}

export const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'account', label: 'Account' },
  { id: 'team', label: 'Team' }
]

export const SHORTCUTS_DATA: ShortcutCardData[] = [
  {
    id: 'agent-mode',
    title: 'Agent Mode',
    description: 'Ask AI to do things in Slack, Gmail, and more',
    keys: [
      { main: 'Alt', sub: 'alt' },
      { main: 'Ctrl', sub: 'control' }
    ],
    changeable: true
  },
  {
    id: 'dictation-mode',
    title: 'Dictation Mode',
    description: 'Hold to dictate',
    keys: [
      { main: 'Ctrl', sub: 'control' },
      { main: '⇧', sub: 'shift' }
    ],
    changeable: true
  },
  {
    id: 'hands-free-dictation',
    title: 'Hands-Free Dictation',
    description: 'Use either option to start and stop without holding a key',
    hasDoubleTap: true,
    doubleTapSubtitle: 'Uses your Dictation shortcut',
    doubleTapKeys: [
      { main: 'Ctrl', sub: 'control' },
      { main: '⇧', sub: 'shift' }
    ],
    doubleTapEnabled: false,
    hasPressOnce: true,
    pressOnceKeys: [
      { main: 'Ctrl', sub: 'control' },
      { main: '⇧', sub: 'shift' },
      { main: 'space', sub: 'space' }
    ],
    changeable: true
  },
  {
    id: 'hands-free-agent',
    title: 'Hands-Free Agent',
    description: 'Double-tap your Agent shortcut to speak without holding a key',
    hasDoubleTap: true,
    doubleTapSubtitle: 'Uses your Agent shortcut',
    doubleTapKeys: [
      { main: 'Alt', sub: 'alt' },
      { main: 'Ctrl', sub: 'control' }
    ],
    doubleTapEnabled: false
  }
]

export const HELP_CENTER_ITEMS: HelpCenterItem[] = [
  {
    id: 'live-chat',
    title: 'Live Chat',
    description: 'Chat with our support team',
    actionType: 'live_chat'
  },
  {
    id: 'discord',
    title: 'Discord Community',
    description: 'Join our community for help and updates',
    actionType: 'discord',
    url: 'https://discord.gg/voiceos'
  },
  {
    id: 'twitter',
    title: 'Follow on X',
    description: 'Get the latest news from the founder',
    actionType: 'twitter',
    url: 'https://x.com/kai_brokering'
  },
  {
    id: 'email',
    title: 'Email Support',
    description: 'support@voiceos.com',
    actionType: 'email',
    email: 'support@voiceos.com'
  }
]

