import { describe, expect, it } from 'vitest'
import {
  DictationCoordinator,
  type AudioCaptureProvider,
  type DictationCoordinatorOptions,
  type DictationTranscriptMeta
} from './coordinator'
import { FakePasteService } from './paste'
import type { TranscriptionClient } from './transcription'
import type { WindowInfo } from './window-context'
import {
  normalizeDictationSettings,
  type DictationSettings
} from '../../shared/dictation'

const CASUAL = {
  capitalization: 'auto' as const,
  sentenceEndings: 'light' as const,
  exclamation: 'off' as const,
  greeting: 'inline' as const
}

function fakeAudioCapture(): AudioCaptureProvider {
  return {
    start: () => {},
    stop: async () => ({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/wav' }),
    cancel: () => {}
  }
}

function fakeTranscription(text: string): TranscriptionClient {
  return {
    transcribe: async () => ({ text, latencyMs: 12 })
  }
}

interface Harness {
  coordinator: DictationCoordinator
  paste: FakePasteService
  meta: () => DictationTranscriptMeta | null
  run: () => Promise<string | null>
}

function createHarness(
  settings: DictationSettings | (() => DictationSettings),
  window: WindowInfo | null,
  options: Partial<DictationCoordinatorOptions> = {},
  transcript = 'um so my calendar link for cal dot com is ready'
): Harness {
  const paste = new FakePasteService()
  let captured: DictationTranscriptMeta | null = null

  const coordinator = new DictationCoordinator({
    audioCapture: fakeAudioCapture(),
    transcriptionClient: fakeTranscription(transcript),
    pasteService: paste,
    resolveWindowContext: () => window,
    getDictationSettings: typeof settings === 'function' ? settings : () => settings,
    onTranscript: (_raw, _polished, meta) => {
      captured = meta
    },
    ...options
  })

  return {
    coordinator,
    paste,
    meta: () => captured,
    run: async () => {
      await coordinator.start()
      // Let the background window resolver settle.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return coordinator.stop()
    }
  }
}

function baseSettings(overrides: Partial<DictationSettings> = {}): DictationSettings {
  return normalizeDictationSettings({
    polishStyle: 'polished',
    writingContexts: [{ type: 'work_chat', structure: CASUAL, assignedApps: [] }],
    spellingEntries: [{ text: 'Cal.com', description: 'cal dot com' }],
    replacementEntries: [{ title: 'my calendar link', content: 'https://cal.com/me' }],
    ...overrides
  })
}

describe('DictationCoordinator dictation settings', () => {
  it('applies the live settings to the pasted transcript', async () => {
    const harness = createHarness(baseSettings(), {
      processName: 'slack.exe',
      windowTitle: 'Slack'
    })

    const polished = await harness.run()

    expect(polished).toBe('So https://cal.com/me for Cal.com is ready')
    expect(harness.paste.pasted).toEqual(['So https://cal.com/me for Cal.com is ready'])
    expect(harness.meta()).toEqual({
      contextType: 'work_chat',
      style: 'polished',
      polishedBy: 'rules'
    })
  })

  it('lets the settings structure win over polishOptions.structure', async () => {
    const harness = createHarness(
      baseSettings(),
      { processName: 'slack.exe', windowTitle: 'Slack' },
      {
        polishOptions: { structure: { capitalization: 'never', sentenceEndings: 'proper' } }
      }
    )

    const polished = await harness.run()

    // Settings say capitalization "auto" and "light" endings, so no trailing period.
    expect(polished).toBe('So https://cal.com/me for Cal.com is ready')
  })

  it('reads the settings at transcript time, not at construction time', async () => {
    let current = baseSettings({ polishStyle: 'light' })
    const harness = createHarness(() => current, {
      processName: 'slack.exe',
      windowTitle: 'Slack'
    })

    await harness.coordinator.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    current = baseSettings({ polishStyle: 'polished' })
    const polished = await harness.coordinator.stop()

    expect(harness.meta()?.style).toBe('polished')
    // "polished" removes the leading filler.
    expect(polished).toBe('So https://cal.com/me for Cal.com is ready')
  })

  it('lets a pinned app override the heuristic context', async () => {
    const settings = normalizeDictationSettings({
      polishStyle: 'light',
      writingContexts: [{ type: 'email', assignedApps: ['Slack'] }]
    })
    const harness = createHarness(
      settings,
      { processName: 'slack.exe', windowTitle: 'Slack' },
      {},
      'this is a short message'
    )

    await harness.run()

    expect(harness.meta()?.contextType).toBe('email')
  })

  it('keeps the standalone behaviour without settings', async () => {
    const paste = new FakePasteService()
    const coordinator = new DictationCoordinator({
      audioCapture: fakeAudioCapture(),
      transcriptionClient: fakeTranscription('hello there'),
      pasteService: paste,
      resolveWindowContext: () => ({ processName: 'slack.exe', windowTitle: 'Slack' }),
      polishStyle: 'light'
    })

    await coordinator.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const polished = await coordinator.stop()

    expect(polished).toBe('Hello there')
    expect(paste.pasted).toEqual(['Hello there'])
  })
})
