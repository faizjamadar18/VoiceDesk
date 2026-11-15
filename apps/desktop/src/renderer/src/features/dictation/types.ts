export type {
  PolishStyle,
  WritingContextType,
  WritingStylePresetId,
  CapitalizationSetting,
  SentenceEndingsSetting,
  ExclamationSetting,
  GreetingSetting,
  WritingContextStructure,
  WritingStructure,
  WritingContext,
  SpellingEntry,
  ReplacementEntry,
  DictationSettings
} from '@shared/dictation'

import type { WritingContextStructure, WritingStylePresetId } from '@shared/dictation'

export interface WritingStylePreset {
  id: WritingStylePresetId
  label: string
  structure: WritingContextStructure
}

export interface DictationPageProps {
  userName?: string
  userEmail?: string
}
