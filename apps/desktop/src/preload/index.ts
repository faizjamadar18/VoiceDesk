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
  type AuthState,
  type AuthTokens,
  type AuthUser
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
  decideNotch: (action) => ipcRenderer.send(IPC.notchDecide, action),
  setNotchRegion: (region) => ipcRenderer.send(IPC.notchRegion, region),
  getAuthState: () => ipcRenderer.invoke(IPC.authGetState) as Promise<AuthState>,
  onAuthStateChanged: (callback) => subscribe<AuthState>(IPC.authStateChanged, callback),
  signOut: () => ipcRenderer.invoke(IPC.authSignOut) as Promise<void>,
  openOAuthUrl: (url) => ipcRenderer.invoke(IPC.authOpenOAuthUrl, url) as Promise<void>,
  setAuthSession: (tokens: AuthTokens, user: AuthUser) =>
    ipcRenderer.invoke(IPC.authSetSession, tokens, user) as Promise<void>
}

contextBridge.exposeInMainWorld('kestrel', api)
