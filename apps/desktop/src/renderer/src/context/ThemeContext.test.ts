import { describe, expect, it } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  normalizeAppearanceTheme,
  resolveEffectiveTheme,
  resolveIsDarkMode
} from './ThemeContext'

describe('ThemeContext & useSystemTheme', () => {
  it('uses the exact voiceos storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('voiceos_appearance_theme')
  })

  it('normalizes appearance themes accurately', () => {
    expect(normalizeAppearanceTheme('light')).toBe('light')
    expect(normalizeAppearanceTheme('dark')).toBe('dark')
    expect(normalizeAppearanceTheme('system')).toBe('system')
    expect(normalizeAppearanceTheme('invalid')).toBe('system')
    expect(normalizeAppearanceTheme(null)).toBe('system')
    expect(normalizeAppearanceTheme(undefined)).toBe('system')
  })

  it('resolves dark mode correctly for system, dark, and light options', () => {
    // When theme is 'dark'
    expect(resolveIsDarkMode('dark', false)).toBe(true)
    expect(resolveIsDarkMode('dark', true)).toBe(true)
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')

    // When theme is 'light'
    expect(resolveIsDarkMode('light', false)).toBe(false)
    expect(resolveIsDarkMode('light', true)).toBe(false)
    expect(resolveEffectiveTheme('light', true)).toBe('light')

    // When theme is 'system'
    expect(resolveIsDarkMode('system', false)).toBe(false)
    expect(resolveIsDarkMode('system', true)).toBe(true)
    expect(resolveEffectiveTheme('system', false)).toBe('light')
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
  })

  it('applies dark and light classes to document.documentElement correctly', () => {
    const classList = new Set<string>()
    const mockDocument = {
      documentElement: {
        classList: {
          add: (cls: string) => classList.add(cls),
          remove: (cls: string) => classList.delete(cls),
          contains: (cls: string) => classList.has(cls)
        }
      }
    }

    const originalDocument = globalThis.document
    ;(globalThis as any).document = mockDocument

    try {
      applyThemeToDocument('dark')
      expect(classList.has('dark')).toBe(true)
      expect(classList.has('light')).toBe(false)

      applyThemeToDocument('light')
      expect(classList.has('light')).toBe(true)
      expect(classList.has('dark')).toBe(false)
    } finally {
      ;(globalThis as any).document = originalDocument
    }
  })
})
