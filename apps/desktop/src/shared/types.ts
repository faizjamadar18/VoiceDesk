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
  notchDecide: 'kestrel:notch-decide'
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

export type NotchCard = NotchWeatherCard | Record<string, unknown>

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
}

export interface ScreenOverlayCompose {
  image: Uint8Array
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

export interface KestrelApi {
  getState: () => Promise<KestrelRuntimeState>
  retryHotkey: () => Promise<KestrelRuntimeState>
  getSettings: () => Promise<KestrelSettings>
  saveSettings: (settings: Partial<KestrelSettings>) => Promise<SaveSettingsResult>
  hideWindow: () => void
  quitApp: () => void
  onState: (callback: (state: KestrelRuntimeState) => void) => () => void
  onSettingsChanged: (callback: (settings: KestrelSettings) => void) => () => void
  onNotchShow: (callback: () => void) => () => void
  onNotchHide: (callback: () => void) => () => void
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
  decideNotch: (action: NotchDecisionAction) => void
  setNotchRegion: (region: NotchInteractiveRegion | null) => void
}
