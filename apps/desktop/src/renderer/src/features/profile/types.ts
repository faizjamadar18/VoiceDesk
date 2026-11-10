export type SettingsTabId = 'general' | 'appearance' | 'subscription' | 'account' | 'team'

export interface KeyCapItem {
  main: string
  sub?: string
}

export interface ShortcutCardData {
  id: string
  title: string
  description: string
  keys?: KeyCapItem[]
  changeable?: boolean
  hasDoubleTap?: boolean
  doubleTapSubtitle?: string
  doubleTapKeys?: KeyCapItem[]
  doubleTapEnabled?: boolean
  hasPressOnce?: boolean
  pressOnceKeys?: KeyCapItem[]
}

export interface UserProfileData {
  firstName: string
  lastName: string
  email: string
  avatarInitial: string
}

export interface HelpCenterItem {
  id: string
  title: string
  description: string
  actionType: 'live_chat' | 'discord' | 'twitter' | 'email'
  badgeBg?: string
  badgeColor?: string
  url?: string
  email?: string
}

