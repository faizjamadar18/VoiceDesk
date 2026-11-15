import { DICTATION_LIMITS, getStructureForPreset } from '@shared/dictation'
import type {
  DictationSettings,
  PolishStyle,
  ReplacementEntry,
  SpellingEntry,
  WritingContextType,
  WritingStylePresetId
} from '@shared/dictation'

export type DictationAction =
  | { type: 'selectPolishStyle'; style: PolishStyle }
  | { type: 'selectContext'; contextType: WritingContextType }
  | { type: 'selectPreset'; presetId: WritingStylePresetId }
  | { type: 'addSpelling'; entry: SpellingEntry }
  | { type: 'deleteSpelling'; id: string }
  | { type: 'dismissSpellingExamples' }
  | { type: 'addReplacement'; entry: ReplacementEntry }
  | { type: 'deleteReplacement'; id: string }
  | { type: 'dismissReplacementExamples' }
  | { type: 'pinApp'; contextType: WritingContextType; appName: string }
  | { type: 'unpinApp'; contextType: WritingContextType; appName: string }

function normalizeSpellingEntry(entry: SpellingEntry): SpellingEntry | null {
  const text = entry.text.trim()
  if (!text) return null

  const description = entry.description
    ? entry.description
        .trim()
        .slice(0, DICTATION_LIMITS.spellingDescriptionChars)
        .trim() || undefined
    : undefined

  return {
    ...entry,
    text,
    description
  }
}

/** Adds a spelling entry unless the word is already known (case-insensitive). */
function addSpellingEntry(settings: DictationSettings, entry: SpellingEntry): DictationSettings {
  const normalized = normalizeSpellingEntry(entry)
  if (!normalized) return settings

  const key = normalized.text.toLowerCase()
  if (settings.spellingEntries.some((existing) => existing.text.toLowerCase() === key)) {
    return settings
  }

  return {
    ...settings,
    spellingEntries: [...settings.spellingEntries, normalized].slice(
      0,
      DICTATION_LIMITS.spellingEntries
    )
  }
}

function addReplacementEntry(
  settings: DictationSettings,
  entry: ReplacementEntry
): DictationSettings {
  const title = entry.title.trim().slice(0, DICTATION_LIMITS.replacementTitleChars)
  const content = entry.content.trim().slice(0, DICTATION_LIMITS.replacementContentChars)
  if (!title || !content) return settings

  return {
    ...settings,
    replacementEntries: [
      ...settings.replacementEntries,
      { ...entry, title, content }
    ].slice(0, DICTATION_LIMITS.replacementEntries)
  }
}

/** An app lives in one context, so pinning moves it out of every other context. */
function pinApp(
  settings: DictationSettings,
  contextType: WritingContextType,
  appName: string
): DictationSettings {
  const trimmed = appName.trim()
  if (!trimmed) return settings

  const key = trimmed.toLowerCase()

  return {
    ...settings,
    writingContexts: settings.writingContexts.map((context) => {
      const assignedApps = context.assignedApps.filter((app) => app.toLowerCase() !== key)

      if (context.type !== contextType) {
        return { ...context, assignedApps }
      }

      return {
        ...context,
        assignedApps: [...assignedApps, trimmed].slice(0, DICTATION_LIMITS.assignedAppsPerContext)
      }
    })
  }
}

function unpinApp(
  settings: DictationSettings,
  contextType: WritingContextType,
  appName: string
): DictationSettings {
  const trimmed = appName.trim()
  if (!trimmed) return settings

  const key = trimmed.toLowerCase()

  return {
    ...settings,
    writingContexts: settings.writingContexts.map((context) =>
      context.type === contextType
        ? {
            ...context,
            assignedApps: context.assignedApps.filter((app) => app.toLowerCase() !== key)
          }
        : context
    )
  }
}

export function applyDictationAction(
  settings: DictationSettings,
  action: DictationAction
): DictationSettings {
  switch (action.type) {
    case 'selectPolishStyle':
      return { ...settings, polishStyle: action.style }

    case 'selectContext':
      return { ...settings, activeContextType: action.contextType }

    case 'selectPreset': {
      const structure = getStructureForPreset(action.presetId)

      return {
        ...settings,
        writingContexts: settings.writingContexts.map((context) =>
          context.type === settings.activeContextType ? { ...context, structure } : context
        ),
        selectedPresets: {
          ...settings.selectedPresets,
          [settings.activeContextType]: action.presetId
        }
      }
    }

    case 'addSpelling':
      return addSpellingEntry(settings, action.entry)

    case 'deleteSpelling':
      return {
        ...settings,
        spellingEntries: settings.spellingEntries.filter((entry) => entry.id !== action.id)
      }

    case 'dismissSpellingExamples':
      return { ...settings, showSpellingExamples: false }

    case 'addReplacement':
      return addReplacementEntry(settings, action.entry)

    case 'deleteReplacement':
      return {
        ...settings,
        replacementEntries: settings.replacementEntries.filter((entry) => entry.id !== action.id)
      }

    case 'dismissReplacementExamples':
      return { ...settings, showReplacementExamples: false }

    case 'pinApp':
      return pinApp(settings, action.contextType, action.appName)

    case 'unpinApp':
      return unpinApp(settings, action.contextType, action.appName)
  }
}
