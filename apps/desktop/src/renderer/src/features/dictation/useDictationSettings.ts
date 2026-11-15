import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_DICTATION_SETTINGS, normalizeDictationSettings } from '@shared/dictation'
import type { DictationSettings } from '@shared/dictation'

const SAVE_DELAY_MS = 250

function getKestrel(): Window['kestrel'] | undefined {
  return typeof window === 'undefined' ? undefined : window.kestrel
}

export interface UseDictationSettingsResult {
  settings: DictationSettings
  update: (recipe: (prev: DictationSettings) => DictationSettings) => void
  isLoaded: boolean
}

/**
 * Loads the dictation settings from the main process once, then writes the
 * whole object back (debounced) after every change.
 */
export function useDictationSettings(): UseDictationSettingsResult {
  const [settings, setSettings] = useState<DictationSettings>(DEFAULT_DICTATION_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  const settingsRef = useRef(settings)
  const hasLocalChange = useRef(false)
  const pendingSave = useRef<DictationSettings | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback((): void => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }

    const pending = pendingSave.current
    pendingSave.current = null
    if (!pending) return

    const kestrel = getKestrel()
    if (!kestrel?.saveSettings) return

    void kestrel.saveSettings({ dictation: pending }).catch((error: unknown) => {
      console.error('Failed to save dictation settings', error)
    })
  }, [])

  useEffect(() => {
    let isCancelled = false
    const kestrel = getKestrel()

    if (!kestrel?.getSettings) {
      setIsLoaded(true)
      return
    }

    void kestrel
      .getSettings()
      .then((result) => {
        if (isCancelled) return
        if (!hasLocalChange.current) {
          const normalized = normalizeDictationSettings(result?.dictation)
          settingsRef.current = normalized
          setSettings(normalized)
        }
        setIsLoaded(true)
      })
      .catch((error: unknown) => {
        console.error('Failed to load dictation settings', error)
        if (!isCancelled) setIsLoaded(true)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => flush, [flush])

  const update = useCallback(
    (recipe: (prev: DictationSettings) => DictationSettings): void => {
      const next = recipe(settingsRef.current)
      if (next === settingsRef.current) return

      hasLocalChange.current = true
      settingsRef.current = next
      setSettings(next)

      pendingSave.current = next
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        flush()
      }, SAVE_DELAY_MS)
    },
    [flush]
  )

  return { settings, update, isLoaded }
}
