export type AppCategory =
  | 'productivity'
  | 'noteTaking'
  | 'media'
  | 'messages'
  | 'email'
  | 'calendar'
  | 'developer'
  | 'social'

export interface AppItem {
  id: string
  slug: string
  name: string
  description: string
  iconUrl: string
  connected: boolean
  beta?: boolean
  category?: AppCategory
  official?: boolean
}

export interface AppActionItem {
  id: string
  name: string
  description: string
  asksFirst: boolean
}

export type AppsTabMode = 'official' | 'custom'

export interface AppsPageProps {
  initialApps?: AppItem[]
  onToggleApp?: (id: string, connected: boolean) => void
  onOpenDocs?: () => void
  onOpenFeedback?: () => void
}

