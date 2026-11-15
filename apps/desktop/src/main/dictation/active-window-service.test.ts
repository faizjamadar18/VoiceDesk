import { describe, expect, it, vi } from 'vitest'
import {
  ActiveWindowService,
  findActiveWindowListenerBinary,
  formatIconDataUrl
} from './active-window-service'

describe('ActiveWindowService', () => {
  it('finds the active-window-listener binary on disk', () => {
    const binaryPath = findActiveWindowListenerBinary()
    if (process.platform === 'win32') {
      expect(binaryPath).not.toBeNull()
      expect(binaryPath).toContain('active-window-listener.exe')
    }
  })

  it('formats icon data URLs cleanly', () => {
    expect(formatIconDataUrl(null)).toBeNull()
    expect(formatIconDataUrl(undefined)).toBeNull()
    expect(formatIconDataUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(formatIconDataUrl('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('maintains in-memory icon cache and ignores own windows', () => {
    const service = new ActiveWindowService()

    // Line from external app
    const line1 = JSON.stringify({
      appName: 'Slack',
      title: 'general | Slack',
      processId: 1234,
      iconBase64: 'base64icon'
    })
    service.handleLine(line1)

    const current = service.getActiveWindow()
    expect(current).not.toBeNull()
    expect(current?.appName).toBe('Slack')
    expect(current?.icon).toBe('data:image/png;base64,base64icon')
    expect(service.getCachedAppIcon('Slack')).toBe('data:image/png;base64,base64icon')

    // Line from own app (Kestrel) - should not overwrite last external window
    const ownLine = JSON.stringify({
      appName: 'Kestrel',
      title: 'Kestrel',
      processId: process.pid
    })
    service.handleLine(ownLine)

    const afterOwn = service.getActiveWindow()
    expect(afterOwn?.appName).toBe('Slack')
  })

  it('extracts hostname from URL for browser windows', () => {
    const service = new ActiveWindowService()
    const browserLine = JSON.stringify({
      appName: 'Google Chrome',
      title: 'GitHub - Pull Requests',
      url: 'https://github.com/my-org/repo/pulls',
      processId: 5678,
      iconBase64: 'chromeicon'
    })
    service.handleLine(browserLine)

    const active = service.getActiveWindow()
    expect(active?.appName).toBe('github.com')
    expect(active?.url).toBe('https://github.com/my-org/repo/pulls')
    expect(active?.icon).toBe('data:image/png;base64,chromeicon')
  })

  it('handles apps without icons as null icon in blank pill format', () => {
    const service = new ActiveWindowService()
    const line = JSON.stringify({
      appName: 'Antigravity',
      title: 'Project Antigravity',
      processId: 9999
    })
    service.handleLine(line)

    const active = service.getActiveWindow()
    expect(active?.appName).toBe('Antigravity')
    expect(active?.icon).toBeUndefined()
    expect(service.getCachedAppIcon('Antigravity')).toBeNull()
  })

  it('invokes fallback file icon extraction when icon is missing', async () => {
    const service = new ActiveWindowService()
    const mockGetFileIcon = vi.fn().mockResolvedValue({
      toDataURL: () => 'data:image/png;base64,fallback_icon'
    })

    const extracted = await service.extractFileIconFallback(
      'Notepad',
      'C:\\Windows\\notepad.exe',
      mockGetFileIcon
    )
    expect(mockGetFileIcon).toHaveBeenCalledWith('C:\\Windows\\notepad.exe', { size: 'normal' })
    expect(extracted).toBe('data:image/png;base64,fallback_icon')
    expect(service.getCachedAppIcon('Notepad')).toBe('data:image/png;base64,fallback_icon')
  })
})
