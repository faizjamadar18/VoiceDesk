export const DEFAULT_HOTKEY = 'Control+Space'
export const HOTKEY = DEFAULT_HOTKEY
export const TAP_THRESHOLD_MS = 300

export function hotkeyLabel(hotkey: string): string[] {
  return hotkey.split('+').map((key) => (key === 'Control' ? 'Ctrl' : key))
}

export const HOTKEY_LABEL = hotkeyLabel(HOTKEY)

export type AsrMode = 'nemo' | 'fake'

export interface KestrelSettings {
  hotkey: string
  asrMode: AsrMode
}

export const IPC = {
  getState: 'kestrel:get-state',
  retryHotkey: 'kestrel:retry-hotkey',
  hideWindow: 'kestrel:hide-window',
  quit: 'kestrel:quit',
  windowMinimize: 'kestrel:window-minimize',
  windowMaximizeToggle: 'kestrel:window-maximize-toggle',
  windowClose: 'kestrel:window-close',
  state: 'kestrel:state',
  summon: 'kestrel:summon',
  summonResult: 'kestrel:summon-result',
  getSettings: 'kestrel:get-settings',
  saveSettings: 'kestrel:save-settings',
  settingsChanged: 'kestrel:settings-changed',
  getDictationState: 'kestrel:get-dictation-state',
  dictationState: 'kestrel:dictation-state',
  dictationStart: 'kestrel:dictation-start',
  dictationStop: 'kestrel:dictation-stop',
  dictationCancel: 'kestrel:dictation-cancel',
  dictationAudio: 'kestrel:dictation-audio',
  dictationAudioError: 'kestrel:dictation-audio-error',
  dictationReady: 'kestrel:dictation-ready',
  notchShow: 'kestrel:notch-show',
  notchHide: 'kestrel:notch-hide',
  notchDismiss: 'kestrel:notch-dismiss',
  notchCancelActive: 'kestrel:notch-cancel-active',
  notchStart: 'kestrel:notch-start',
  notchStop: 'kestrel:notch-stop',
  notchCancel: 'kestrel:notch-cancel',
  notchState: 'kestrel:notch-state',
  notchPartial: 'kestrel:notch-partial',
  notchAudio: 'kestrel:notch-audio',
  notchAudioEnd: 'kestrel:notch-audio-end',
  notchAudioError: 'kestrel:notch-audio-error',
  notchSpeech: 'kestrel:notch-speech',
  notchReady: 'kestrel:notch-ready',
  notchActivity: 'kestrel:notch-activity',
  openNotchResult: 'kestrel:open-notch-result',
  dismissNotchResult: 'kestrel:dismiss-notch-result',
  notchRegion: 'kestrel:notch-region',
  notchDecide: 'kestrel:notch-decide',
  notchSubmitText: 'kestrel:notch-submit-text',
  notchSetFocusable: 'kestrel:notch-set-focusable',
  notchStartTyping: 'kestrel:notch-start-typing',
  copyToClipboard: 'kestrel:copy-to-clipboard',
  authGetState: 'kestrel:auth-get-state',
  authSignOut: 'kestrel:auth-sign-out',
  authOpenOAuthUrl: 'kestrel:auth-open-oauth-url',
  authSetSession: 'kestrel:auth-set-session',
  authStateChanged: 'kestrel:auth-state-changed',
  integrationsGetStatus: 'kestrel:integrations-get-status',
  integrationsSetKey: 'kestrel:integrations-set-key',
  integrationsClearKey: 'kestrel:integrations-clear-key',
  integrationsConnect: 'kestrel:integrations-connect',
  integrationsDisconnect: 'kestrel:integrations-disconnect',
  integrationsRefresh: 'kestrel:integrations-refresh',
  integrationsChanged: 'kestrel:integrations-changed',
  historyList: 'kestrel:history-list',
  historyDelete: 'kestrel:history-delete',
  historyChanged: 'kestrel:history-changed',
  sidebarRestoreHistory: 'kestrel:sidebar-restore-history',
  sidebarSetInteractive: 'kestrel:sidebar-set-interactive',
  sidebarTogglePin: 'kestrel:sidebar-toggle-pin',
  sidebarRegion: 'kestrel:sidebar-region',
  sidebarCollapse: 'kestrel:sidebar-collapse',
  sidebarPointer: 'kestrel:sidebar-pointer',
  notchRestoreHistory: 'kestrel:notch-restore-history',
  speechSynthesize: 'speech:synthesize',
  speechStreamStart: 'speech:stream-start',
  speechStreamCancel: 'speech:stream-cancel',
  speechChunk: 'speech:chunk',
  speechStreamDone: 'speech:stream-done',
  speechStreamError: 'speech:stream-error'
} as const

/** Dedicated channels for the transparent screen overlay renderer. */
export const SCREEN_OVERLAY_IPC = {
  start: 'kestrel:screen-overlay-start',
  point: 'kestrel:screen-overlay-point',
  finish: 'kestrel:screen-overlay-finish',
  finishAck: 'kestrel:screen-overlay-finish-ack',
  cancel: 'kestrel:screen-overlay-cancel',
  compose: 'kestrel:screen-overlay-compose',
  composed: 'kestrel:screen-overlay-composed',
  composeError: 'kestrel:screen-overlay-compose-error',
  ready: 'kestrel:screen-overlay-ready'
} as const

export interface KestrelRuntimeState {
  hotkey: string
  hotkeyLabel: string[]
  hotkeyRegistered: boolean
  hotkeyError: string | null
  triggerCount: number
  lastTriggeredAt: number | null
  windowFocused: boolean
  appVersion: string
  /** True when the low-level key hook is running and can drive push-to-talk. */
  hookRunning: boolean
  /** Startup failure for the low-level key hook, surfaced instead of crashing. */
  hookError: string | null
  settings: KestrelSettings
  asrMode: AsrMode
  asrReady: boolean
  asrError: string | null
  apiUrl: string
}

export interface SummonEvent {
  at: number
  count: number
}

export interface SummonResult {
  at: number
  focused: boolean
  verifiedAfterMs: number
}

export type DictationStatus = 'idle' | 'listening' | 'transcribing' | 'pasting' | 'error'

export interface DictationRuntimeState {
  status: DictationStatus
  lastTranscript: string | null
  provider: string | null
  latencyMs: number | null
  lastError: string | null
  lastCompletedAt: number | null
  updatedAt: number
}

export interface DictationAudioPayload {
  audio: ArrayBuffer
  mimeType: string
}

export interface DictationAudioErrorPayload {
  message: string
}

export type NotchPhase = 'listening' | 'processing' | 'acting' | 'result' | 'error'

export interface NotchWeatherCard {
  kind: 'weather'
  location: string
  temperature: string
  low: string
  high?: string
  condition: string
  icon: string
}

export type NotchCard =
  | NotchWeatherCard
  | NotchEmailListCard
  | NotchEmailComposeCard
  | NotchCalendarCard
  | Record<string, unknown>

/** One email row in {@link NotchEmailListCard}. Display-only. */
export interface NotchEmailListRow {
  /** Sender display name, e.g. "Product Hunt Daily". */
  title: string
  /** Subject line, or subject plus a short preview. */
  subtitle: string
  /** Short date such as "Nov 11". */
  trailing: string
}

/** The newest emails, newest first, under a titled heading. */
export interface NotchEmailListCard {
  kind: 'email_list'
  /** e.g. "Unread inbox: first 5" or "Latest inbox emails". */
  title: string
  rows: NotchEmailListRow[]
}

/** A composed email waiting on the user's choice. */
export interface NotchEmailComposeCard {
  kind: 'email_compose'
  mode: 'send' | 'reply' | 'draft'
  /** e.g. "New Message" or "Reply". */
  title: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  /** Messages in the thread, for "View thread (N)". Null when new. */
  threadCount: number | null
}

/** One calendar event shown on the timeline or in a preview list. */
export interface NotchCalendarEvent {
  id: string
  summary: string
  /** ISO 8601 string, e.g. "2026-11-14T19:00:00". */
  start: string
  /** ISO 8601 string, e.g. "2026-11-14T20:00:00", or null for open-ended. */
  end: string | null
  allDay?: boolean
  backgroundColor?: string
}

/** A Google Calendar event preview / confirmation card in the notch. */
export interface NotchCalendarCard {
  kind: 'calendar_event'
  mode: 'create' | 'patch' | 'delete'
  /** Event title / summary, e.g. "Meeting" or "Lunch with Sarah". */
  title: string
  /** ISO 8601 start time. */
  start: string
  /** ISO 8601 end time. */
  end: string
  /** Event length in minutes, e.g. 60. */
  durationMinutes: number
  /** Connected Google account / email, e.g. "faizj18.work@gmail.com". */
  account?: string
  /** Calendar name / display name, e.g. "Primary". */
  calendarName?: string
  location?: string
  description?: string
  attendees?: string[]
  existingEvents?: NotchCalendarEvent[]
  backgroundColor?: string
}

/**
 * A file row shown in the notch. Display-only: the absolute path never leaves
 * the main process; `id` is opaque to the renderer.
 */
export interface NotchFileResult {
  id: number
  name: string
  sizeBytes: number | null
  modified: string
}

export interface NotchOpenResult {
  ok: boolean
  message?: string
}

/** The results card rectangle in window CSS pixels. */
export interface NotchInteractiveRegion {
  left: number
  top: number
  width: number
  height: number
}

/** The active clickable contour rectangle for the sidebar in window CSS pixels. */
export type SidebarInteractiveRegion = NotchInteractiveRegion

export interface SidebarPointerPayload {
  atLeftEdge: boolean
  x: number
  y: number
}

/** Which card the user is looking at when a write needs a decision. */
export type NotchDecisionKind = 'confirm' | 'undo'

/** The only actions the renderer may send back for a decision card. */
export type NotchDecisionAction = 'confirm' | 'cancel' | 'undo'

/**
 * A write that is waiting on the user. `planId` is the only handle the renderer
 * holds; `target` is a display-only absolute path so the user can see exactly
 * what will be touched. The renderer never uses it to run anything.
 */
export interface NotchDecision {
  kind: NotchDecisionKind
  planId: string
  /** Absolute path shown on the card, or null when there is nothing to show. */
  target: string | null
  /** True while the user's choice is in flight to the backend. */
  busy: boolean
}

export interface NotchStatePayload {
  phase: NotchPhase
  status?: string | null
  transcript: string | null
  message: string | null
  spoken?: string | null
  card?: NotchCard | null
  /** Present only when the turn produced file-search results. */
  results?: NotchFileResult[] | null
  /** Plain-text card header, e.g. "2025 Tax Returns · 10 items". */
  resultsLabel?: string | null
  /** Present only when a write is waiting on the user's choice. */
  decision?: NotchDecision | null
  at: number
}

export interface NotchActivity {
  at: number
  phase: NotchPhase
  status?: string | null
  transcript: string | null
  message: string | null
  spoken?: string | null
  card?: NotchCard | null
  results?: NotchFileResult[] | null
  resultsLabel?: string | null
  decision?: NotchDecision | null
}

export interface NotchStartPayload {
  sessionId: number
}

export interface NotchAudioPayload {
  samples: Float32Array
  sampleRate: number
}

export interface NotchAudioErrorPayload {
  message: string
}

export interface ScreenOverlayPoint {
  x: number
  y: number
}

/** The display-relative DIP size of the monitor the hold was locked to. */
export interface ScreenOverlayStart {
  width: number
  height: number
  cursor?: ScreenOverlayPoint
  tagText?: string
}

export interface ScreenOverlayCompose {
  image: Uint8Array | string
  mimeType?: 'image/jpeg' | 'image/png'
}

/** The narrow surface exposed to the dedicated overlay preload. */
export interface KestrelOverlayApi {
  onStart: (callback: (payload: ScreenOverlayStart) => void) => () => void
  onPoint: (callback: (point: ScreenOverlayPoint) => void) => () => void
  onFinish: (callback: () => void) => () => void
  onCancel: (callback: () => void) => () => void
  onCompose: (callback: (payload: ScreenOverlayCompose) => void) => () => void
  notifyReady: () => void
  acknowledgeFinish: () => void
  sendComposed: (image: ArrayBuffer) => void
  sendComposeError: (message: string) => void
}

export interface SaveSettingsResult {
  state: KestrelRuntimeState
  settings: KestrelSettings
}

/** The apps Kestrel can drive through Composio. Ids match the App Store catalog. */
export const INTEGRATION_IDS = [
  'googlecalendar',
  'gmail',
  'googlesuper',
  'notion'
] as const

export type IntegrationId = (typeof INTEGRATION_IDS)[number]

/** True when `value` is one of the known integration ids. */
export function isIntegrationId(value: unknown): value is IntegrationId {
  return (
    typeof value === 'string' &&
    (INTEGRATION_IDS as readonly string[]).includes(value)
  )
}

export interface IntegrationStatus {
  id: IntegrationId
  label: string
  connected: boolean
  /** How many voice tools this provider contributed. */
  toolCount: number
  error: string | null
}

export interface IntegrationsStatus {
  /** True when a Composio API key is available (stored by the user, or from the environment). */
  hasKey: boolean
  keySource: 'stored' | 'env' | null
  sessionId: string | null
  providers: IntegrationStatus[]
  /** A problem with the key or the Composio session, shown verbatim to the user. */
  error: string | null
}

export interface IntegrationConnectResult {
  ok: boolean
  /** The Composio authorization link, when one was produced. */
  url: string | null
  /** A short line to show the user. */
  message: string
}

export interface IntegrationDisconnectResult {
  ok: boolean
  /** A short line to show the user. */
  message: string
}

export interface ActionResponse {
  status: 'ok' | 'unhandled' | 'error' | 'pending' | 'cancelled'
  action: string
  message: string
  text?: string | null
  dryRun?: boolean
  risk?: string | null
  requiresConfirmation?: boolean | null
  planId?: string | null
  results?: Array<Record<string, unknown>> | null
  canUndo?: boolean | null
  /** Display-only absolute path for a create/delete card. Never sent to a model. */
  target?: string | null
  card?: NotchCard | null
  spokenResponse?: string | null
}

export interface ScreenAnswerResponse {
  answer: string
  model?: string
  latencyMs?: number
}

export interface ScreenAskInput {
  question: string
  imageBase64: string
  marked: boolean
}

/**
 * One finished voice turn, saved locally on the user's machine.
 * Text only: no audio, screenshots, or other media are ever stored.
 */
export interface HistoryRecord {
  id: string
  /** ISO 8601 timestamp of when the turn finished. */
  createdAt: string
  /** What the user said (or asked about the screen). */
  prompt: string
  /** What the assistant said back. */
  reply: string
  /** The action/tool label that produced the reply, or null for a plain answer. */
  tool: string | null
}

/** The fields a caller supplies; the store adds `id` and `createdAt`. */
export interface NewHistoryRecord {
  prompt: string
  reply: string
  tool?: string | null
}

export interface HistoryRestorePayload {
  prompt: string
  reply: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: string
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
}

export type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating'; startedAt: number }
  | { status: 'authenticated'; user: AuthUser; tokens: AuthTokens }
  | { status: 'error'; message: string }

export interface SpeechChunkPayload {
  requestId: string
  index: number
  text: string
  audio: Uint8Array
}

export interface SpeechStreamDonePayload {
  requestId: string
}

export interface SpeechStreamErrorPayload {
  requestId: string
  message: string
}

export interface KestrelApi {
  getState: () => Promise<KestrelRuntimeState>
  retryHotkey: () => Promise<KestrelRuntimeState>
  getSettings: () => Promise<KestrelSettings>
  saveSettings: (settings: Partial<KestrelSettings>) => Promise<SaveSettingsResult>
  hideWindow: () => void
  quitApp: () => void
  minimizeWindow: () => void
  toggleMaximizeWindow: () => void
  closeWindow: () => void
  onState: (callback: (state: KestrelRuntimeState) => void) => () => void
  onSettingsChanged: (callback: (settings: KestrelSettings) => void) => () => void
  onNotchShow: (callback: () => void) => () => void
  onNotchHide: (callback: () => void) => () => void
  onNotchDismiss: (callback: () => void) => () => void
  onNotchStart: (callback: (payload: NotchStartPayload) => void) => () => void
  onNotchStop: (callback: () => void) => () => void
  onNotchCancel: (callback: () => void) => () => void
  onNotchState: (callback: (state: NotchStatePayload) => void) => () => void
  onNotchPartial: (callback: (text: string) => void) => () => void
  onNotchActivity: (callback: (activity: NotchActivity) => void) => () => void
  sendNotchAudio: (samples: Float32Array, sampleRate: number) => void
  sendNotchAudioEnd: () => void
  sendNotchAudioError: (message: string) => void
  notifyNotchSpeech: (speaking: boolean) => void
  notifyNotchReady: () => void
  openNotchResult: (id: number) => Promise<NotchOpenResult>
  dismissNotchResult: () => void
  cancelNotchActive: () => void
  decideNotch: (action: NotchDecisionAction) => void
  submitNotchText: (text: string) => void
  setNotchFocusable: (focusable: boolean) => void
  startNotchTyping: () => void
  copyToClipboard: (text: string) => void
  setNotchRegion: (region: NotchInteractiveRegion | null) => void
  getAuthState: () => Promise<AuthState>
  onAuthStateChanged: (callback: (state: AuthState) => void) => () => void
  signOut: () => Promise<void>
  openOAuthUrl: (url: string) => Promise<void>
  setAuthSession: (tokens: AuthTokens, user: AuthUser) => Promise<void>
  getIntegrationsStatus: () => Promise<IntegrationsStatus>
  setIntegrationsKey: (key: string) => Promise<IntegrationsStatus>
  clearIntegrationsKey: () => Promise<IntegrationsStatus>
  connectIntegration: (id: IntegrationId) => Promise<IntegrationConnectResult>
  disconnectIntegration: (id: IntegrationId) => Promise<IntegrationDisconnectResult>
  refreshIntegrations: () => Promise<IntegrationsStatus>
  onIntegrationsChanged: (callback: (status: IntegrationsStatus) => void) => () => void
  listHistory: () => Promise<HistoryRecord[]>
  deleteHistory: (id: string) => Promise<HistoryRecord[]>
  onHistoryChanged: (callback: () => void) => () => void
  restoreHistoryInNotch: (payload: HistoryRestorePayload) => void
  sidebarRestoreHistory: (prompt: string, reply: string) => void
  onNotchRestoreHistory: (callback: (payload: HistoryRestorePayload) => void) => () => void
  setSidebarInteractive: (interactive: boolean) => void
  setSidebarRegion: (region: SidebarInteractiveRegion | null) => void
  onSidebarCollapse: (callback: () => void) => () => void
  onSidebarPointer: (callback: (payload: SidebarPointerPayload) => void) => () => void
  synthesizeSpeech: (text: string) => Promise<Uint8Array | null>
  startSpeechStream: (requestId: string, text: string) => void
  cancelSpeechStream: (requestId: string) => void
  onSpeechChunk: (callback: (payload: SpeechChunkPayload) => void) => () => void
  onSpeechStreamDone: (callback: (payload: SpeechStreamDonePayload) => void) => () => void
  onSpeechStreamError: (callback: (payload: SpeechStreamErrorPayload) => void) => () => void
}
