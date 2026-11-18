import type { JSX } from 'react'
import { PolishingSection } from './PolishingSection'
import { WritingStyleSection } from './WritingStyleSection'
import { SpellingSection } from './SpellingSection'
import { ReplacementsSection } from './ReplacementsSection'
import { applyDictationAction } from './dictation-actions'
import type { DictationAction } from './dictation-actions'
import type { DictationPageProps, ReplacementEntry, SpellingEntry } from './types'
import { useDictationSettings } from './useDictationSettings'

export function DictationPage({ userName, userEmail }: DictationPageProps): JSX.Element {
  const { settings, update } = useDictationSettings()
  const dispatch = (action: DictationAction): void =>
    update((prev) => applyDictationAction(prev, action))

  const handleAddSpelling = (entry: SpellingEntry): void => {
    dispatch({ type: 'addSpelling', entry })
  }

  const handleDeleteSpelling = (id: string): void => {
    dispatch({ type: 'deleteSpelling', id })
  }

  const handleAddReplacement = (entry: ReplacementEntry): void => {
    dispatch({ type: 'addReplacement', entry })
  }

  const handleDeleteReplacement = (id: string): void => {
    dispatch({ type: 'deleteReplacement', id })
  }

  const handlePinApp = (appName: string): void => {
    dispatch({ type: 'pinApp', contextType: settings.activeContextType, appName })
  }

  const handleUnpinApp = (appName: string): void => {
    dispatch({ type: 'unpinApp', contextType: settings.activeContextType, appName })
  }

  const activeContextConfig = settings.writingContexts.find(
    (c) => c.type === settings.activeContextType
  )

  return (
    <div className="dictation-page @container w-full min-w-0">
      <h1 className="dictation-title">Dictation</h1>

      <PolishingSection
        selectedStyle={settings.polishStyle}
        onSelectStyle={(style) => dispatch({ type: 'selectPolishStyle', style })}
      />

      <WritingStyleSection
        activeContext={settings.activeContextType}
        selectedPreset={settings.selectedPresets[settings.activeContextType]}
        onSelectContext={(contextType) => dispatch({ type: 'selectContext', contextType })}
        onSelectPreset={(presetId) => dispatch({ type: 'selectPreset', presetId })}
        pinnedApps={activeContextConfig?.assignedApps ?? []}
        onPinApp={handlePinApp}
        onUnpinApp={handleUnpinApp}
        polishStyle={settings.polishStyle}
        userName={userName}
        userEmail={userEmail}
      />

      <SpellingSection
        entries={settings.spellingEntries}
        showExamples={settings.showSpellingExamples}
        onAddEntry={handleAddSpelling}
        onDeleteEntry={handleDeleteSpelling}
        onDismissExamples={() => dispatch({ type: 'dismissSpellingExamples' })}
      />

      <ReplacementsSection
        entries={settings.replacementEntries}
        showExamples={settings.showReplacementExamples}
        onAddEntry={handleAddReplacement}
        onDeleteEntry={handleDeleteReplacement}
        onDismissExamples={() => dispatch({ type: 'dismissReplacementExamples' })}
      />
    </div>
  )
}
export default DictationPage
