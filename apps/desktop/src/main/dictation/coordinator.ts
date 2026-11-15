import { DictationSession, type DictationState } from './session'
import type { PasteService } from './paste'
import type { TranscriptionClient } from './transcription'
import { polishTranscript, type PolishOptions, type PolishStyle } from './polish'
import type { TranscriptPolisher } from './llm-polish'
import {
  classifyWindowContext,
  getActiveWindowInfo,
  getActiveWindowInfoSync,
  resolveWritingContextForSettings,
  type WindowInfo,
  type WritingContextType
} from './window-context'
import type { DictationSettings, ReplacementEntry } from '../../shared/dictation'
import { encodePcm16, encodeWav } from '../pcm'
import type { PillWindowController } from './pill-window'

const DEFAULT_TARGET_APP_NAME = 'Active App'
const AUDIO_MIME_TYPE = 'audio/wav'

function targetAppName(context: WindowInfo | null): string {
  return (
    context?.appName ||
    context?.windowTitle ||
    context?.processName ||
    DEFAULT_TARGET_APP_NAME
  )
}

/** Personal replacements reach the rule layer as spoken-title shortcuts. */
function shortcutsFor(entries: ReplacementEntry[]): Record<string, string> {
  const shortcuts: Record<string, string> = {}
  for (const entry of entries) {
    const title = entry.title.trim()
    if (!title) continue
    shortcuts[title] = entry.content
  }
  return shortcuts
}

/**
 * Whether text contains at least one Unicode letter or digit. Speech models can
 * return bare punctuation (e.g. ".") for a silent hold, which must never be
 * pasted. Undefined, empty, whitespace-only and punctuation-only text all count
 * as having no speakable content.
 */
export function hasSpeakableContent(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false
  return /\p{L}|\p{N}/u.test(text)
}

export interface AudioCaptureProvider {
  start(): Promise<void> | void
  stop(): Promise<{ audio: Uint8Array; mimeType: string }>
  cancel(): Promise<void> | void
}

export class NotchAudioCaptureProvider implements AudioCaptureProvider {
  private chunks: Float32Array[] = []
  private capturing = false
  private sampleRate = 16_000

  constructor(
    private readonly onStartCapture?: () => void,
    private readonly onStopCapture?: () => void
  ) {}

  start(): void {
    this.chunks = []
    this.capturing = true
    this.onStartCapture?.()
  }

  push(samples: Float32Array, sampleRate = 16_000): void {
    if (!this.capturing) return
    this.sampleRate = sampleRate
    this.chunks.push(new Float32Array(samples))
  }

  async stop(): Promise<{ audio: Uint8Array; mimeType: string }> {
    this.capturing = false
    this.onStopCapture?.()
    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    const pcm16 = encodePcm16(merged)
    return {
      audio: encodeWav(pcm16, this.sampleRate),
      mimeType: AUDIO_MIME_TYPE
    }
  }

  cancel(): void {
    this.capturing = false
    this.chunks = []
    this.onStopCapture?.()
  }

  get isCapturing(): boolean {
    return this.capturing
  }
}


export interface DictationTranscriptMeta {
  contextType: WritingContextType
  style: PolishStyle
  polishedBy: 'llm' | 'rules'
}

export interface DictationCoordinatorOptions {
  session?: DictationSession
  audioCapture: AudioCaptureProvider
  transcriptionClient: TranscriptionClient
  pasteService: PasteService
  resolveWindowContext?: () => Promise<WindowInfo | null> | WindowInfo | null
  customMappings?: Record<string, WritingContextType>
  polishOptions?: PolishOptions
  polishLlm?: TranscriptPolisher
  polishStyle?: PolishStyle
  /** Read on every transcript so settings changes apply without a restart. */
  getDictationSettings?: () => DictationSettings
  onStateChange?: (state: DictationState) => void
  onTranscript?: (raw: string, polished: string, meta: DictationTranscriptMeta) => void
  onError?: (error: Error) => void
  pillController?: PillWindowController
}

export class DictationCoordinator {
  private readonly session: DictationSession
  private readonly audioCapture: AudioCaptureProvider
  private readonly transcriptionClient: TranscriptionClient
  private readonly pasteService: PasteService
  private readonly resolveWindowContext: () => Promise<WindowInfo | null> | WindowInfo | null
  private readonly customMappings?: Record<string, WritingContextType>
  private readonly polishOptions?: PolishOptions
  private readonly polishLlm?: TranscriptPolisher
  private readonly polishStyle?: PolishStyle
  private readonly getDictationSettings?: () => DictationSettings
  private readonly onStateChange?: (state: DictationState) => void
  private readonly onTranscript?: (raw: string, polished: string, meta: DictationTranscriptMeta) => void
  private readonly onError?: (error: Error) => void
  private readonly pillController?: PillWindowController
  private capturedWindowContext: WindowInfo | null = null
  private windowContextConsumed = false
  private contextToken = 0

  constructor(options: DictationCoordinatorOptions) {
    this.session = options.session ?? new DictationSession()
    this.audioCapture = options.audioCapture
    this.transcriptionClient = options.transcriptionClient
    this.pasteService = options.pasteService
    this.resolveWindowContext = options.resolveWindowContext ?? getActiveWindowInfo
    this.customMappings = options.customMappings
    this.polishOptions = options.polishOptions
    this.polishLlm = options.polishLlm
    this.polishStyle = options.polishStyle
    this.getDictationSettings = options.getDictationSettings
    this.onStateChange = options.onStateChange
    this.onTranscript = options.onTranscript
    this.onError = options.onError
    this.pillController = options.pillController
  }

  getPillController(): PillWindowController | undefined {
    return this.pillController
  }

  getState(): DictationState {
    return this.session.state
  }

  pushAudio(samples: Float32Array, sampleRate = 16_000): void {
    if (this.audioCapture instanceof NotchAudioCaptureProvider && this.audioCapture.isCapturing) {
      this.audioCapture.push(samples, sampleRate)
    }
    if (this.pillController && this.session.state === 'recording') {
      let sumSq = 0
      for (let i = 0; i < samples.length; i++) {
        sumSq += samples[i] * samples[i]
      }
      const rms = Math.sqrt(sumSq / (samples.length || 1))
      this.pillController.setAudioLevel(Math.min(1, rms * 5))
    }
  }

  async start(): Promise<void> {
    if (this.session.state !== 'idle') return

    const token = (this.contextToken += 1)
    this.capturedWindowContext = null
    this.windowContextConsumed = false

    // Check if immediate synchronous context is available from cache or synchronous resolver
    let initialContext: WindowInfo | null = null
    try {
      const immediate = this.resolveWindowContext()
      if (immediate && !(immediate instanceof Promise)) {
        initialContext = immediate
      } else {
        initialContext = getActiveWindowInfoSync()
      }
    } catch {
      initialContext = null
    }

    if (initialContext) {
      this.capturedWindowContext = initialContext
    }

    const name = initialContext ? targetAppName(initialContext) : DEFAULT_TARGET_APP_NAME
    const icon = initialContext?.icon
    this.pillController?.startRecording({ targetApp: { name, icon } })
    this.session.dispatch({ type: 'start' })
    this.onStateChange?.(this.session.state)

    void this.resolveWindowContextInBackground(token)

    try {
      await this.audioCapture.start()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.releaseFailure(error)
      this.onError?.(error)
      throw error
    }
  }

  /** Resolve the foreground window without blocking the session; may finish late. */
  private async resolveWindowContextInBackground(token: number): Promise<void> {
    let context: WindowInfo | null = null
    try {
      context = await this.resolveWindowContext()
    } catch {
      context = null
    }

    // A newer session or an already classified one must not be relabelled.
    if (token !== this.contextToken || this.windowContextConsumed) return

    this.capturedWindowContext = context
    if (context && (this.session.state === 'recording' || this.session.state === 'transcribing')) {
      this.pillController?.updateTargetApp({
        name: targetAppName(context),
        icon: context.icon
      })
    }
  }

  /**
   * Show the failure on the pill (which auto-hides it) and release the session
   * back to idle so the next hold is not dead.
   */
  private releaseFailure(error: Error): void {
    this.windowContextConsumed = true
    this.pillController?.showError(error.message)
    this.session.dispatch({ type: 'failure', error: error.message })
    this.onStateChange?.(this.session.state)
    this.session.dispatch({ type: 'reset' })
    this.onStateChange?.(this.session.state)
  }

  async stop(): Promise<string | null> {
    if (this.session.state !== 'recording') return null

    this.session.dispatch({ type: 'stop' })
    this.onStateChange?.(this.session.state)
    this.pillController?.startTranscribing()

    let audioData: { audio: Uint8Array; mimeType: string }
    try {
      audioData = await this.audioCapture.stop()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.releaseFailure(error)
      this.onError?.(error)
      throw error
    }

    if (!audioData.audio || audioData.audio.length === 0) {
      this.releaseFailure(new Error('No audio detected'))
      return null
    }

    this.session.dispatch({
      type: 'audio-ready',
      audio: audioData.audio,
      mimeType: audioData.mimeType
    })

    let transcriptResult: { text: string }
    try {
      transcriptResult = await this.transcriptionClient.transcribe({
        audio: audioData.audio,
        mimeType: audioData.mimeType
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.releaseFailure(error)
      this.onError?.(error)
      throw error
    }

    // Whatever context arrived by now is final; a later resolver must not
    // retroactively change this session's classification.
    this.windowContextConsumed = true

    // Read the store per transcript, like VoiceOS: edits made while the pill
    // was showing still apply to this dictation.
    const settings = this.getDictationSettings?.()
    const resolvedContext = settings
      ? resolveWritingContextForSettings(
          this.capturedWindowContext,
          settings,
          this.customMappings
        )
      : null

    const contextType: WritingContextType = resolvedContext
      ? resolvedContext.type
      : this.capturedWindowContext
        ? classifyWindowContext(this.capturedWindowContext, this.customMappings)
        : 'other'

    const style = settings?.polishStyle ?? this.polishStyle ?? 'light'
    const structure = resolvedContext?.structure
    const dictionary = settings?.spellingEntries
    const shortcuts = settings ? shortcutsFor(settings.replacementEntries) : undefined

    let draft = transcriptResult.text
    let polishedBy: 'llm' | 'rules' = 'rules'

    // The LLM cleans the spoken language (fillers, self-corrections); the rule
    // layer below then applies deterministic per-app formatting. A failed or
    // unusable polish must never block the paste, so every error keeps `draft`.
    if (this.polishLlm && style !== 'none') {
      try {
        const candidate = await this.polishLlm.polish({
          text: transcriptResult.text,
          contextType,
          style,
          ...(structure ? { structure } : {}),
          ...(dictionary ? { dictionary } : {}),
          ...(settings ? { replacements: settings.replacementEntries } : {})
        })
        if (candidate && candidate.trim()) {
          draft = candidate
          polishedBy = 'llm'
        }
      } catch {
        // Keep the raw transcript; the rule layer still runs.
      }
    }

    const ruleOptions: PolishOptions = {
      ...this.polishOptions,
      style,
      contextType
    }
    if (structure) ruleOptions.structure = structure
    if (dictionary) ruleOptions.dictionary = dictionary
    if (shortcuts) {
      ruleOptions.shortcuts = { ...this.polishOptions?.shortcuts, ...shortcuts }
    }

    const polished = polishTranscript(draft, ruleOptions)

    // A silent hold can make the model return bare punctuation (e.g. ".").
    // Guard the final text so nothing unspoken reaches the paste service.
    if (!hasSpeakableContent(polished)) {
      this.releaseFailure(new Error('No speech detected'))
      return null
    }

    this.session.dispatch({ type: 'transcript', text: polished })
    this.onStateChange?.(this.session.state)
    this.onTranscript?.(transcriptResult.text, polished, { contextType, style, polishedBy })

    try {
      if (polished) {
        await this.pasteService.paste(polished)
      }
      this.session.dispatch({ type: 'paste-success' })
      this.onStateChange?.(this.session.state)
      this.pillController?.showSuccess()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.releaseFailure(error)
      this.onError?.(error)
      throw error
    }

    return polished
  }

  async cancel(): Promise<void> {
    if (this.session.state === 'idle') return

    try {
      await this.audioCapture.cancel()
    } catch {
      // Ignore cancellation errors
    }

    this.windowContextConsumed = true
    this.pillController?.cancel()
    this.session.dispatch({ type: 'cancel' })
    // `cancel` only leaves the recording state; reset any other phase.
    this.session.dispatch({ type: 'reset' })
    this.onStateChange?.(this.session.state)
  }

  reset(): void {
    this.windowContextConsumed = true
    this.pillController?.cancel()
    this.session.dispatch({ type: 'reset' })
    this.onStateChange?.(this.session.state)
  }
}
