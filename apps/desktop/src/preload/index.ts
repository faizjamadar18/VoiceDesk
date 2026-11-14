import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type KestrelApi,
  type KestrelRuntimeState,
  type KestrelSettings,
  type NotchActivity,
  type NotchAudioPayload,
  type NotchOpenResult,
  type NotchStartPayload,
  type NotchStatePayload,
  type SaveSettingsResult,
  type SpeechChunkPayload,
  type SpeechStreamDonePayload,
  type SpeechStreamErrorPayload,
  type AuthState,
  type AuthTokens,
  type AuthUser,
  type HistoryRecord,
  type HistoryRestorePayload,
  type IntegrationConnectResult,
  type IntegrationDisconnectResult,
  type IntegrationId,
  type IntegrationsStatus,
  type SidebarPointerPayload
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

function subscribeEvent(channel: string, callback: () => void): () => void {
  const listener = (): void => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: KestrelApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<KestrelRuntimeState>,
  retryHotkey: () => ipcRenderer.invoke(IPC.retryHotkey) as Promise<KestrelRuntimeState>,
  getSettings: () => ipcRenderer.invoke(IPC.getSettings) as Promise<KestrelSettings>,
  saveSettings: (settings) =>
    ipcRenderer.invoke(IPC.saveSettings, settings) as Promise<SaveSettingsResult>,
  hideWindow: () => ipcRenderer.send(IPC.hideWindow),
  quitApp: () => ipcRenderer.send(IPC.quit),
  minimizeWindow: () => ipcRenderer.send(IPC.windowMinimize),
  toggleMaximizeWindow: () => ipcRenderer.send(IPC.windowMaximizeToggle),
  closeWindow: () => ipcRenderer.send(IPC.windowClose),
  onState: (callback) => subscribe(IPC.state, callback),
  onSettingsChanged: (callback) => subscribe(IPC.settingsChanged, callback),
  onNotchShow: (callback) => subscribeEvent(IPC.notchShow, callback),
  onNotchHide: (callback) => subscribeEvent(IPC.notchHide, callback),
  onNotchDismiss: (callback) => subscribeEvent(IPC.notchDismiss, callback),
  onNotchStart: (callback) => subscribe<NotchStartPayload>(IPC.notchStart, callback),
  onNotchStop: (callback) => subscribeEvent(IPC.notchStop, callback),
  onNotchCancel: (callback) => subscribeEvent(IPC.notchCancel, callback),
  onNotchState: (callback) => subscribe<NotchStatePayload>(IPC.notchState, callback),
  onNotchPartial: (callback) => subscribe<string>(IPC.notchPartial, callback),
  onNotchActivity: (callback) => subscribe<NotchActivity>(IPC.notchActivity, callback),
  sendNotchAudio: (samples, sampleRate) => {
    const payload: NotchAudioPayload = { samples, sampleRate }
    ipcRenderer.send(IPC.notchAudio, payload)
  },
  sendNotchAudioEnd: () => ipcRenderer.send(IPC.notchAudioEnd),
  sendNotchAudioError: (message) => ipcRenderer.send(IPC.notchAudioError, { message }),
  notifyNotchSpeech: (speaking) => ipcRenderer.send(IPC.notchSpeech, speaking),
  notifyNotchReady: () => ipcRenderer.send(IPC.notchReady),
  openNotchResult: (id) =>
    ipcRenderer.invoke(IPC.openNotchResult, id) as Promise<NotchOpenResult>,
  dismissNotchResult: () => ipcRenderer.send(IPC.dismissNotchResult),
  cancelNotchActive: () => ipcRenderer.send(IPC.notchCancelActive),
  decideNotch: (action, edits) => ipcRenderer.send(IPC.notchDecide, { action, edits }),
  submitNotchText: (text) => ipcRenderer.send(IPC.notchSubmitText, text),
  setNotchFocusable: (focusable) => ipcRenderer.send(IPC.notchSetFocusable, focusable),
  startNotchTyping: () => ipcRenderer.send(IPC.notchStartTyping),
  copyToClipboard: (text) => ipcRenderer.send(IPC.copyToClipboard, text),
  setNotchRegion: (region) => ipcRenderer.send(IPC.notchRegion, region),
  getAuthState: () => ipcRenderer.invoke(IPC.authGetState) as Promise<AuthState>,
  onAuthStateChanged: (callback) => subscribe<AuthState>(IPC.authStateChanged, callback),
  signOut: () => ipcRenderer.invoke(IPC.authSignOut) as Promise<void>,
  openOAuthUrl: (url) => ipcRenderer.invoke(IPC.authOpenOAuthUrl, url) as Promise<void>,
  setAuthSession: (tokens: AuthTokens, user: AuthUser) =>
    ipcRenderer.invoke(IPC.authSetSession, tokens, user) as Promise<void>,
  getIntegrationsStatus: () =>
    ipcRenderer.invoke(IPC.integrationsGetStatus) as Promise<IntegrationsStatus>,
  setIntegrationsKey: (key) =>
    ipcRenderer.invoke(IPC.integrationsSetKey, key) as Promise<IntegrationsStatus>,
  clearIntegrationsKey: () =>
    ipcRenderer.invoke(IPC.integrationsClearKey) as Promise<IntegrationsStatus>,
  connectIntegration: (id: IntegrationId) =>
    ipcRenderer.invoke(IPC.integrationsConnect, id) as Promise<IntegrationConnectResult>,
  disconnectIntegration: (id: IntegrationId) =>
    ipcRenderer.invoke(IPC.integrationsDisconnect, id) as Promise<IntegrationDisconnectResult>,
  refreshIntegrations: () =>
    ipcRenderer.invoke(IPC.integrationsRefresh) as Promise<IntegrationsStatus>,
  onIntegrationsChanged: (callback) =>
    subscribe<IntegrationsStatus>(IPC.integrationsChanged, callback),
  listHistory: () => ipcRenderer.invoke(IPC.historyList) as Promise<HistoryRecord[]>,
  deleteHistory: (id) => ipcRenderer.invoke(IPC.historyDelete, id) as Promise<HistoryRecord[]>,
  onHistoryChanged: (callback) => subscribeEvent(IPC.historyChanged, callback),
  restoreHistoryInNotch: (payload) => ipcRenderer.send(IPC.sidebarRestoreHistory, payload),
  sidebarRestoreHistory: (prompt: string, reply: string) =>
    ipcRenderer.send(IPC.sidebarRestoreHistory, { prompt, reply }),
  onNotchRestoreHistory: (callback) =>
    subscribe<HistoryRestorePayload>(IPC.notchRestoreHistory, callback),
  setSidebarInteractive: (interactive) =>
    ipcRenderer.send(IPC.sidebarSetInteractive, interactive),
  setSidebarRegion: (region) => ipcRenderer.send(IPC.sidebarRegion, region),
  onSidebarCollapse: (callback) => subscribeEvent(IPC.sidebarCollapse, callback),
  onSidebarPointer: (callback) =>
    subscribe<SidebarPointerPayload>(IPC.sidebarPointer, callback),
  synthesizeSpeech: (text: string) =>
    ipcRenderer.invoke(IPC.speechSynthesize, text) as Promise<Uint8Array | null>,
  startSpeechStream: (requestId, text) =>
    ipcRenderer.send(IPC.speechStreamStart, { requestId, text }),
  cancelSpeechStream: (requestId) => ipcRenderer.send(IPC.speechStreamCancel, requestId),
  onSpeechChunk: (callback) => subscribe<SpeechChunkPayload>(IPC.speechChunk, callback),
  onSpeechStreamDone: (callback) =>
    subscribe<SpeechStreamDonePayload>(IPC.speechStreamDone, callback),
  onSpeechStreamError: (callback) =>
    subscribe<SpeechStreamErrorPayload>(IPC.speechStreamError, callback)
}

contextBridge.exposeInMainWorld('kestrel', api)
contextBridge.exposeInMainWorld('api', {
  synthesizeSpeech: api.synthesizeSpeech,
  startSpeechStream: api.startSpeechStream,
  cancelSpeechStream: api.cancelSpeechStream,
  onSpeechChunk: api.onSpeechChunk,
  onSpeechStreamDone: api.onSpeechStreamDone,
  onSpeechStreamError: api.onSpeechStreamError
})
