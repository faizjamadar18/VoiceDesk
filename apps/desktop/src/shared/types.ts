export const HOTKEY = 'Control+Alt+Space'
export const HOTKEY_LABEL = HOTKEY.split('+').map((key) =>
  key === 'Control' ? 'Ctrl' : key
)

export const IPC = {
  getState: 'kestrel:get-state',
  retryHotkey: 'kestrel:retry-hotkey',
  hideWindow: 'kestrel:hide-window',
  quit: 'kestrel:quit',
  state: 'kestrel:state',
  summon: 'kestrel:summon',
  summonResult: 'kestrel:summon-result'
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

export interface KestrelApi {
  getState: () => Promise<KestrelRuntimeState>
  retryHotkey: () => Promise<KestrelRuntimeState>
  hideWindow: () => void
  quitApp: () => void
  onState: (callback: (state: KestrelRuntimeState) => void) => () => void
  onSummon: (callback: (event: SummonEvent) => void) => () => void
  onSummonResult: (callback: (result: SummonResult) => void) => () => void
}
