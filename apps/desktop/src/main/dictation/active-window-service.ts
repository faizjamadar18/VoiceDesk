import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import * as readline from 'node:readline'
import type { WindowInfo } from './window-context'

export interface RawActiveWindow {
  appName?: string
  title?: string
  windowClassName?: string
  bundleId?: string
  processId?: number
  windowId?: number
  url?: string
  iconBase64?: string
  processPath?: string
  isFullScreen?: boolean
}

export type ActiveWindowSubscriber = (window: WindowInfo) => void

const IGNORED_APPS = new Set(['kestrel', 'electron', 'voiceos', 'voiceos dev'])
const MONITOR_RESTART_DELAY_MS = 1_000
const MONITOR_MAX_RESTART_DELAY_MS = 30_000

export function formatIconDataUrl(raw?: string | null): string | null {
  if (!raw) return null
  if (raw.startsWith('data:')) return raw
  return `data:image/png;base64,${raw}`
}

export function findActiveWindowListenerBinary(): string | null {
  if (process.platform !== 'win32') {
    return null
  }

  const candidates: Array<string | null> = [
    typeof process.resourcesPath === 'string'
      ? join(process.resourcesPath, 'binaries', 'active-window-listener.exe')
      : null,
    typeof app !== 'undefined' && typeof app.getAppPath === 'function'
      ? join(app.getAppPath(), 'resources', 'binaries', 'active-window-listener.exe')
      : null,
    join(__dirname, '../../resources/binaries/active-window-listener.exe'),
    join(__dirname, '../../../resources/binaries/active-window-listener.exe'),
    resolve(process.cwd(), 'apps/desktop/resources/binaries/active-window-listener.exe'),
    resolve(process.cwd(), 'resources/binaries/active-window-listener.exe')
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function getHostnameFromUrl(urlStr?: string): string | null {
  if (!urlStr) return null
  try {
    return new URL(urlStr).hostname
  } catch {
    return null
  }
}

export class ActiveWindowService {
  private childProcess: ChildProcess | null = null
  private readlineInterface: readline.Interface | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private restartDelayMs = MONITOR_RESTART_DELAY_MS
  private lastActiveWindow: WindowInfo | null = null
  private readonly appIconCache = new Map<string, string | null>()
  private readonly subscribers = new Set<ActiveWindowSubscriber>()
  private isRunning = false

  constructor() {}

  getActiveWindow(): WindowInfo | null {
    return this.lastActiveWindow
  }

  getCachedAppIcon(appName: string): string | null {
    return this.appIconCache.get(appName) ?? null
  }

  subscribe(callback: ActiveWindowSubscriber): () => void {
    this.subscribers.add(callback)
    if (this.lastActiveWindow) {
      try {
        callback(this.lastActiveWindow)
      } catch {
        // ignore subscriber errors
      }
    }
    return () => {
      this.subscribers.delete(callback)
    }
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.ensureProcess()
  }

  stop(): void {
    this.isRunning = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.readlineInterface) {
      this.readlineInterface.close()
      this.readlineInterface = null
    }
    if (this.childProcess) {
      try {
        this.childProcess.kill()
      } catch {
        // ignore kill errors
      }
      this.childProcess = null
    }
  }

  private isOwnWindow(raw: RawActiveWindow): boolean {
    if (raw.processId != null && raw.processId === process.pid) return true
    if (raw.appName && IGNORED_APPS.has(raw.appName.toLowerCase())) return true
    return false
  }

  handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    try {
      const raw = JSON.parse(trimmed) as RawActiveWindow
      const rawIcon = formatIconDataUrl(raw.iconBase64)

      if (raw.appName) {
        if (rawIcon) {
          this.appIconCache.set(raw.appName, rawIcon)
        } else if (!this.appIconCache.has(raw.appName)) {
          this.appIconCache.set(raw.appName, null)
        }
      }

      if (this.isOwnWindow(raw)) {
        return
      }

      const hostname = getHostnameFromUrl(raw.url)
      const effectiveAppName =
        hostname ||
        raw.appName ||
        (raw.processPath ? basename(raw.processPath, '.exe') : undefined)

      const cachedIcon =
        (raw.appName ? this.appIconCache.get(raw.appName) : null) ??
        rawIcon ??
        undefined

      const windowInfo: WindowInfo = {
        appName: effectiveAppName,
        processName:
          raw.appName || (raw.processPath ? basename(raw.processPath) : undefined),
        windowTitle: raw.title,
        url: raw.url,
        icon: cachedIcon
      }

      this.lastActiveWindow = windowInfo

      if (!cachedIcon && raw.processPath) {
        void this.extractFileIconFallback(raw.appName, raw.processPath)
      }

      for (const subscriber of this.subscribers) {
        try {
          subscriber(windowInfo)
        } catch {
          // ignore subscriber error
        }
      }
    } catch {
      // JSON parse error on partial line
    }
  }

  async extractFileIconFallback(
    appName?: string,
    processPath?: string,
    getFileIconFn?: (
      path: string,
      options: { size: 'normal' }
    ) => Promise<{ toDataURL: () => string }>
  ): Promise<string | null> {
    if (!processPath) return null

    try {
      const fn =
        getFileIconFn ??
        (typeof app !== 'undefined' && typeof app.getFileIcon === 'function'
          ? app.getFileIcon.bind(app)
          : null)

      if (fn) {
        const nativeImg = await fn(processPath, { size: 'normal' })
        const dataUrl = nativeImg.toDataURL()
        if (dataUrl && dataUrl !== 'data:image/png;base64,') {
          if (appName) {
            this.appIconCache.set(appName, dataUrl)
          }
          if (
            this.lastActiveWindow &&
            (!this.lastActiveWindow.icon ||
              (appName && this.lastActiveWindow.appName === appName))
          ) {
            this.lastActiveWindow = {
              ...this.lastActiveWindow,
              icon: dataUrl
            }
          }
          return dataUrl
        }
      }
    } catch {
      // ignore getFileIcon errors
    }

    return null
  }

  private ensureProcess(): void {
    if (!this.isRunning || this.childProcess || this.restartTimer) return

    const binary = findActiveWindowListenerBinary()
    if (!binary) return

    try {
      const child = spawn(binary, ['monitor'], { windowsHide: true })
      this.childProcess = child

      const reader = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity
      })
      this.readlineInterface = reader

      reader.on('line', (line) => {
        if (this.childProcess === child) {
          this.handleLine(line)
        }
      })

      const handleFailure = (canRetry = true): void => {
        if (this.childProcess !== child) return
        this.childProcess = null
        this.readlineInterface = null
        reader.close()

        if (canRetry && this.isRunning) {
          const delay = this.restartDelayMs
          this.restartDelayMs = Math.min(delay * 2, MONITOR_MAX_RESTART_DELAY_MS)
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null
            this.ensureProcess()
          }, delay)
        }
      }

      child.on('error', () => {
        handleFailure(true)
      })

      child.on('exit', (code) => {
        const missingRuntime = code === 3221225781
        handleFailure(!missingRuntime)
      })
    } catch {
      this.childProcess = null
    }
  }

  /** One-shot fallback query when monitor is not running */
  async queryActiveWindowOnce(timeoutMs = 500): Promise<WindowInfo | null> {
    if (this.lastActiveWindow) {
      return this.lastActiveWindow
    }

    const binary = findActiveWindowListenerBinary()
    if (!binary) {
      return this.lastActiveWindow
    }

    return new Promise((resolveResult) => {
      execFile(
        binary,
        { maxBuffer: 10 * 1024 * 1024, windowsHide: true, timeout: timeoutMs },
        (err, stdout) => {
          if (!err && stdout.trim()) {
            try {
              const raw = JSON.parse(stdout.trim()) as RawActiveWindow
              if (!this.isOwnWindow(raw)) {
                const icon = formatIconDataUrl(raw.iconBase64)
                const hostname = getHostnameFromUrl(raw.url)
                const windowInfo: WindowInfo = {
                  appName: hostname || raw.appName,
                  processName: raw.appName,
                  windowTitle: raw.title,
                  url: raw.url,
                  icon: icon ?? undefined
                }
                this.lastActiveWindow = windowInfo
                resolveResult(windowInfo)
                return
              }
            } catch {
              // ignore parse errors
            }
          }
          resolveResult(this.lastActiveWindow)
        }
      )
    })
  }
}

let activeWindowServiceInstance: ActiveWindowService | null = null

export function getActiveWindowService(): ActiveWindowService {
  if (!activeWindowServiceInstance) {
    activeWindowServiceInstance = new ActiveWindowService()
  }
  return activeWindowServiceInstance
}

export function setActiveWindowService(service: ActiveWindowService | null): void {
  activeWindowServiceInstance = service
}
