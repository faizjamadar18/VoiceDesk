import type {
  DictationSettings,
  PolishStyle,
  ReplacementEntry,
  SpellingEntry,
  WritingContext,
  WritingContextType,
  WritingStylePreset,
  WritingStylePresetId
} from './types'

export interface PolishOption {
  id: PolishStyle
  label: string
  tag: string
  desc: string[]
  example: string
  annotated?: string
}

export const POLISH_OPTIONS: PolishOption[] = [
  {
    id: 'none',
    label: 'None',
    tag: 'Instant',
    desc: ['Keeps your original wording', 'Basic cleanup only'],
    example:
      'Um so the meeting got moved to thursday no wait friday so so we should uh prep the deck before that.',
    annotated: ''
  },
  {
    id: 'light',
    label: 'Light',
    tag: 'Fast',
    desc: ['Removes self-corrections', 'Fixes formatting'],
    example:
      'So the meeting got moved to Friday, so we should prep the deck before that.',
    annotated:
      '~~Um~~ ==So== the meeting got moved to ~~thursday no wait~~ ==Friday,== ~~so~~ so we should ~~uh~~ prep the deck before that.'
  },
  {
    id: 'polished',
    label: 'Polished',
    tag: 'Smart',
    desc: ['Everything in Light', 'Smooths phrasing for clarity'],
    example:
      'The meeting got moved to Friday, so we should prep the deck beforehand.',
    annotated:
      '~~Um so~~ ==The== meeting got moved to ~~thursday no wait~~ ==Friday,== ~~so~~ so we should ~~uh~~ prep the deck ~~before that~~ ==beforehand==.'
  }
]

export const WRITING_CONTEXT_TABS: Array<{ id: WritingContextType; label: string }> = [
  { id: 'personal_chat', label: 'Personal Chat' },
  { id: 'work_chat', label: 'Work Chat' },
  { id: 'email', label: 'Email' },
  { id: 'other', label: 'Other' }
]

export const PERSONAL_CHAT_PRESETS: WritingStylePreset[] = [
  {
    id: 'formal',
    label: 'Formal',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    }
  },
  {
    id: 'casual',
    label: 'Casual',
    structure: {
      capitalization: 'auto',
      sentenceEndings: 'light',
      exclamation: 'off',
      greeting: 'newline'
    }
  },
  {
    id: 'veryCasual',
    label: 'Very Casual',
    structure: {
      capitalization: 'never',
      sentenceEndings: 'none',
      exclamation: 'off',
      greeting: 'inline'
    }
  },
  {
    id: 'excited',
    label: 'Excited',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'on',
      greeting: 'newline'
    }
  }
]

export const STANDARD_PRESETS: WritingStylePreset[] = [
  {
    id: 'formal',
    label: 'Formal',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    }
  },
  {
    id: 'casual',
    label: 'Casual',
    structure: {
      capitalization: 'auto',
      sentenceEndings: 'light',
      exclamation: 'off',
      greeting: 'newline'
    }
  },
  {
    id: 'excited',
    label: 'Excited',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'on',
      greeting: 'newline'
    }
  }
]

export function getPresetsForContext(contextType: WritingContextType): WritingStylePreset[] {
  return contextType === 'personal_chat' ? PERSONAL_CHAT_PRESETS : STANDARD_PRESETS
}

export function getPreviewText(
  contextType: WritingContextType,
  presetId: WritingStylePresetId
): string {
  if (contextType === 'personal_chat') {
    switch (presetId) {
      case 'formal':
        return "Hey, are you free for coffee tomorrow? Let's meet at 2 if that works for you."
      case 'casual':
        return "Hey are you free for coffee tomorrow? Let's meet at 2 if that works for you"
      case 'veryCasual':
        return "hey are you free for coffee tomorrow? let's meet at 2 if that works for you"
      case 'excited':
        return "Hey, are you free for coffee tomorrow? Let's meet at 2 if that works for you!"
    }
  }

  if (contextType === 'work_chat') {
    switch (presetId) {
      case 'formal':
        return "Hey, if you have time, let's talk about the project updates."
      case 'casual':
        return "Hey, if you have time let's talk about the project updates"
      case 'excited':
        return "Hey, if you have time, let's talk about the project updates!"
      case 'veryCasual':
        return "hey if you have time let's talk about the project updates"
    }
  }

  if (contextType === 'email') {
    switch (presetId) {
      case 'formal':
        return 'Hi Sarah,\n\nIt was great meeting with you today.\nLooking forward to our next conversation.\n\nBest,\nFaiz'
      case 'casual':
        return 'Hi Sarah, it was great meeting with you today.\nLooking forward to our next conversation.\n\nBest,\nFaiz'
      case 'excited':
        return 'Hi Sarah,\n\nIt was great meeting with you today!\nLooking forward to our next conversation.\n\nBest,\nFaiz'
      case 'veryCasual':
        return 'hi sarah,\n\nit was great meeting with you today,\nlooking forward to our next conversation.\n\nfaiz'
    }
  }

  // Other
  switch (presetId) {
    case 'formal':
      return 'The new coffee shop downtown is really good, and the pastries are great too.'
    case 'casual':
      return 'The new coffee shop downtown is really good and the pastries are great too.'
    case 'excited':
      return 'The new coffee shop downtown is really good, and the pastries are great too!'
    case 'veryCasual':
      return 'the new coffee shop downtown is really good and the pastries are great too'
  }
}

export const DICTIONARY_EXAMPLES: Array<{ text: string; description?: string }> = [
  { text: 'VoiceOS', description: 'Product name' },
  { text: 'Claude', description: 'AI assistant' },
  { text: 'lmk', description: 'Let me know' },
  { text: 'GTM', description: 'Go to market' },
  { text: 'tmr', description: 'Tomorrow' }
]

export const REPLACEMENT_EXAMPLES: Array<{ title: string; content: string }> = [
  {
    title: 'my calendar link',
    content: 'https://cal.com/jonah-dalan-y3igxi/15min'
  },
  {
    title: 'patent rewrite',
    content: 'Rewrite this to be concise, warm, and clear. Keep my tone.'
  }
]

export const DEFAULT_WRITING_CONTEXTS: WritingContext[] = [
  {
    type: 'personal_chat',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    },
    assignedApps: ['Messages', 'WhatsApp', 'Telegram']
  },
  {
    type: 'work_chat',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    },
    assignedApps: ['Slack', 'Teams']
  },
  {
    type: 'email',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    },
    assignedApps: ['Mail', 'Outlook', 'Gmail']
  },
  {
    type: 'other',
    structure: {
      capitalization: 'always',
      sentenceEndings: 'proper',
      exclamation: 'off',
      greeting: 'newline'
    },
    assignedApps: []
  }
]

export const DEFAULT_SPELLING_ENTRIES: SpellingEntry[] = []

export const DEFAULT_REPLACEMENT_ENTRIES: ReplacementEntry[] = []

export const DEFAULT_DICTATION_SETTINGS: DictationSettings = {
  polishStyle: 'light',
  activeContextType: 'personal_chat',
  writingContexts: DEFAULT_WRITING_CONTEXTS,
  selectedPresets: {
    personal_chat: 'formal',
    work_chat: 'formal',
    email: 'formal',
    other: 'formal'
  },
  spellingEntries: DEFAULT_SPELLING_ENTRIES,
  replacementEntries: DEFAULT_REPLACEMENT_ENTRIES,
  showSpellingExamples: true,
  showReplacementExamples: true
}
