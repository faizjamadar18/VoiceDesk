import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type KestrelApi, type KestrelRuntimeState } from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: KestrelApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<KestrelRuntimeState>,
  retryHotkey: () => ipcRenderer.invoke(IPC.retryHotkey) as Promise<KestrelRuntimeState>,
  hideWindow: () => ipcRenderer.send(IPC.hideWindow),
  quitApp: () => ipcRenderer.send(IPC.quit),
  onState: (callback) => subscribe(IPC.state, callback),
  onSummon: (callback) => subscribe(IPC.summon, callback),
  onSummonResult: (callback) => subscribe(IPC.summonResult, callback)
}

contextBridge.exposeInMainWorld('kestrel', api)
