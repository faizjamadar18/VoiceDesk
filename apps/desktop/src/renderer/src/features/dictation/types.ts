export type PolishStyle = 'none' | 'light' | 'polished'

export type WritingContextType = 'personal_chat' | 'work_chat' | 'email' | 'other'

export type WritingStylePresetId = 'formal' | 'casual' | 'veryCasual' | 'excited'

export type CapitalizationSetting = 'always' | 'auto' | 'never'
export type SentenceEndingsSetting = 'proper' | 'light' | 'none'
export type ExclamationSetting = 'on' | 'off'
export type GreetingSetting = 'newline' | 'inline'

export interface WritingContextStructure {
  capitalization: CapitalizationSetting
  sentenceEndings: SentenceEndingsSetting
  exclamation: ExclamationSetting
  greeting: GreetingSetting
}

export interface WritingContext {
  type: WritingContextType
  structure: WritingContextStructure
  assignedApps: string[]
}

export interface WritingStylePreset {
  id: WritingStylePresetId
  label: string
  structure: WritingContextStructure
}

export interface SpellingEntry {
  id: string
  text: string
  description?: string
  auto_added?: boolean
}

export interface ReplacementEntry {
  id: string
  title: string
  content: string
}

export interface DictationSettings {
  polishStyle: PolishStyle
  activeContextType: WritingContextType
  writingContexts: WritingContext[]
  selectedPresets: Record<WritingContextType, WritingStylePresetId>
  spellingEntries: SpellingEntry[]
  replacementEntries: ReplacementEntry[]
  showSpellingExamples: boolean
  showReplacementExamples: boolean
}

export interface DictationPageProps {
  initialSettings?: Partial<DictationSettings>
  onSaveSettings?: (settings: DictationSettings) => void
  onAddSpelling?: (entry: SpellingEntry) => void
  onDeleteSpelling?: (id: string) => void
  onAddReplacement?: (entry: ReplacementEntry) => void
  onDeleteReplacement?: (id: string) => void
  onPinApp?: (contextType: WritingContextType, appName: string) => void
  onUnpinApp?: (appName: string) => void
}
