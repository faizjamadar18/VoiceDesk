import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { JSX, ReactNode } from 'react'

export type Theme = 'system' | 'light' | 'dark'

export interface ThemeContextValue {
  theme: Theme
  systemTheme: 'light' | 'dark'
  isDarkMode: boolean
  setTheme: (theme: Theme) => void
}

export const THEME_STORAGE_KEY = 'voiceos_appearance_theme'

export function normalizeAppearanceTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveIsDarkMode(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === 'system' ? systemPrefersDark : theme === 'dark'
}

export function resolveEffectiveTheme(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  return resolveIsDarkMode(theme, systemPrefersDark) ? 'dark' : 'light'
}

export function applyThemeToDocument(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  } else {
    document.documentElement.classList.add('light')
    document.documentElement.classList.remove('dark')
  }
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({
  children,
  defaultTheme
}: ThemeProviderProps): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (defaultTheme) return defaultTheme
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY)
        if (stored) return normalizeAppearanceTheme(stored)
      } catch {
        // Ignore localStorage read errors
      }
    }
    return 'system'
  })

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getSystemPrefersDark)

  // Listen to system media query changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (e: MediaQueryListEvent | MediaQueryList): void => {
      setSystemPrefersDark(e.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }
    return undefined
  }, [])

  const isDarkMode = resolveIsDarkMode(theme, systemPrefersDark)
  const effectiveTheme = resolveEffectiveTheme(theme, systemPrefersDark)

  // Apply theme class to document.documentElement
  useEffect(() => {
    applyThemeToDocument(effectiveTheme)
  }, [effectiveTheme])

  const setTheme = useCallback((newTheme: Theme) => {
    const normalized = normalizeAppearanceTheme(newTheme)
    setThemeState(normalized)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, normalized)
      } catch {
        // Ignore localStorage write errors
      }
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      systemTheme: effectiveTheme,
      isDarkMode,
      setTheme
    }),
    [theme, effectiveTheme, isDarkMode, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export interface UseSystemThemeOptions {
  forceLight?: boolean
}

export function useSystemTheme(options: UseSystemThemeOptions = {}): ThemeContextValue {
  const context = useContext(ThemeContext)
  const { forceLight = false } = options

  if (!context) {
    const isDark = forceLight ? false : getSystemPrefersDark()
    return {
      theme: 'system',
      systemTheme: isDark ? 'dark' : 'light',
      isDarkMode: isDark,
      setTheme: () => {}
    }
  }

  if (forceLight) {
    return {
      ...context,
      systemTheme: 'light',
      isDarkMode: false
    }
  }

  return context
}
