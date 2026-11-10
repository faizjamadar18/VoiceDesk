import { useState } from 'react'
import type { JSX } from 'react'
import { PolishingSection } from './PolishingSection'
import { WritingStyleSection } from './WritingStyleSection'
import { SpellingSection } from './SpellingSection'
import { ReplacementsSection } from './ReplacementsSection'
import { DEFAULT_DICTATION_SETTINGS } from './dummy-data'
import type {
  DictationPageProps,
  DictationSettings,
  PolishStyle,
  ReplacementEntry,
  SpellingEntry,
  WritingContextType,
  WritingStylePresetId
} from './types'

export function DictationPage({
  initialSettings,
  onSaveSettings,
  onAddSpelling,
  onDeleteSpelling,
  onAddReplacement,
  onDeleteReplacement,
  onPinApp,
  onUnpinApp
}: DictationPageProps): JSX.Element {
  const [settings, setSettings] = useState<DictationSettings>({
    ...DEFAULT_DICTATION_SETTINGS,
    ...initialSettings,
    selectedPresets: {
      ...DEFAULT_DICTATION_SETTINGS.selectedPresets,
      ...initialSettings?.selectedPresets
    }
  })

  const updateSettings = (updater: (prev: DictationSettings) => DictationSettings): void => {
    setSettings((prev) => {
      const next = updater(prev)
      onSaveSettings?.(next)
      return next
    })
  }

  const handleSelectPolishStyle = (polishStyle: PolishStyle): void => {
    updateSettings((prev) => ({
      ...prev,
      polishStyle
    }))
  }

  const handleSelectContext = (activeContextType: WritingContextType): void => {
    updateSettings((prev) => ({
      ...prev,
      activeContextType
    }))
  }

  const handleSelectPreset = (presetId: WritingStylePresetId): void => {
    updateSettings((prev) => ({
      ...prev,
      selectedPresets: {
        ...prev.selectedPresets,
        [prev.activeContextType]: presetId
      }
    }))
  }

  const handleAddSpelling = (entry: SpellingEntry): void => {
    updateSettings((prev) => ({
      ...prev,
      spellingEntries: [...prev.spellingEntries, entry]
    }))
    onAddSpelling?.(entry)
  }

  const handleDeleteSpelling = (id: string): void => {
    updateSettings((prev) => ({
      ...prev,
      spellingEntries: prev.spellingEntries.filter((e) => e.id !== id)
    }))
    onDeleteSpelling?.(id)
  }

  const handleDismissSpellingExamples = (): void => {
    updateSettings((prev) => ({
      ...prev,
      showSpellingExamples: false
    }))
  }

  const handleAddReplacement = (entry: ReplacementEntry): void => {
    updateSettings((prev) => ({
      ...prev,
      replacementEntries: [...prev.replacementEntries, entry]
    }))
    onAddReplacement?.(entry)
  }

  const handleDeleteReplacement = (id: string): void => {
    updateSettings((prev) => ({
      ...prev,
      replacementEntries: prev.replacementEntries.filter((e) => e.id !== id)
    }))
    onDeleteReplacement?.(id)
  }

  const handleDismissReplacementExamples = (): void => {
    updateSettings((prev) => ({
      ...prev,
      showReplacementExamples: false
    }))
  }

  const handlePinApp = (appName: string): void => {
    updateSettings((prev) => ({
      ...prev,
      writingContexts: prev.writingContexts.map((ctx) => {
        if (ctx.type === prev.activeContextType && !ctx.assignedApps.includes(appName)) {
          return { ...ctx, assignedApps: [...ctx.assignedApps, appName] }
        }
        return ctx
      })
    }))
    onPinApp?.(settings.activeContextType, appName)
  }

  const handleUnpinApp = (appName: string): void => {
    updateSettings((prev) => ({
      ...prev,
      writingContexts: prev.writingContexts.map((ctx) => {
        if (ctx.type === prev.activeContextType) {
          return {
            ...ctx,
            assignedApps: ctx.assignedApps.filter((a) => a !== appName)
          }
        }
        return ctx
      })
    }))
    onUnpinApp?.(appName)
  }

  const activeContextConfig = settings.writingContexts.find(
    (c) => c.type === settings.activeContextType
  )

  return (
    <div className="dictation-page">
      <h1 className="dictation-title">Dictation</h1>

      <PolishingSection
        selectedStyle={settings.polishStyle}
        onSelectStyle={handleSelectPolishStyle}
      />

      <WritingStyleSection
        activeContext={settings.activeContextType}
        selectedPreset={settings.selectedPresets[settings.activeContextType]}
        onSelectContext={handleSelectContext}
        onSelectPreset={handleSelectPreset}
        pinnedApps={activeContextConfig?.assignedApps ?? []}
        onPinApp={handlePinApp}
        onUnpinApp={handleUnpinApp}
      />

      <SpellingSection
        entries={settings.spellingEntries}
        showExamples={settings.showSpellingExamples}
        onAddEntry={handleAddSpelling}
        onDeleteEntry={handleDeleteSpelling}
        onDismissExamples={handleDismissSpellingExamples}
      />

      <ReplacementsSection
        entries={settings.replacementEntries}
        showExamples={settings.showReplacementExamples}
        onAddEntry={handleAddReplacement}
        onDeleteEntry={handleDeleteReplacement}
        onDismissExamples={handleDismissReplacementExamples}
      />
    </div>
  )
}
export default DictationPage
