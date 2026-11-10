import { contextBridge, ipcRenderer } from 'electron'
import type {
  KestrelOverlayApi,
  ScreenOverlayCompose,
  ScreenOverlayPoint,
  ScreenOverlayStart
} from '../shared/types'

/**
 * Sandboxed preloads cannot require relative chunks. Keeping the channel
 * strings local makes this preload a single file; the type annotation checks
 * every name and value against the shared contract at compile time.
 */
type OverlayChannels = typeof import('../shared/types').SCREEN_OVERLAY_IPC
const OVERLAY_IPC: OverlayChannels = {
  start: 'kestrel:screen-overlay-start',
  point: 'kestrel:screen-overlay-point',
  finish: 'kestrel:screen-overlay-finish',
  finishAck: 'kestrel:screen-overlay-finish-ack',
  cancel: 'kestrel:screen-overlay-cancel',
  compose: 'kestrel:screen-overlay-compose',
  composed: 'kestrel:screen-overlay-composed',
  composeError: 'kestrel:screen-overlay-compose-error',
  ready: 'kestrel:screen-overlay-ready'
}

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

const api: KestrelOverlayApi = {
  onStart: (callback) => subscribe<ScreenOverlayStart>(OVERLAY_IPC.start, callback),
  onPoint: (callback) => subscribe<ScreenOverlayPoint>(OVERLAY_IPC.point, callback),
  onFinish: (callback) => subscribeEvent(OVERLAY_IPC.finish, callback),
  onCancel: (callback) => subscribeEvent(OVERLAY_IPC.cancel, callback),
  onCompose: (callback) => subscribe<ScreenOverlayCompose>(OVERLAY_IPC.compose, callback),
  notifyReady: () => ipcRenderer.send(OVERLAY_IPC.ready),
  acknowledgeFinish: () => ipcRenderer.send(OVERLAY_IPC.finishAck),
  sendComposed: (image) => ipcRenderer.send(OVERLAY_IPC.composed, image),
  sendComposeError: (message) => ipcRenderer.send(OVERLAY_IPC.composeError, { message })
}

contextBridge.exposeInMainWorld('kestrelOverlay', api)
