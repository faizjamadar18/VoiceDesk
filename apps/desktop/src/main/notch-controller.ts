import { basename, dirname, extname, isAbsolute } from 'node:path'
import type {
  ActionResponse,
  NotchActivity,
  NotchCard,
  NotchDecision,
  NotchDecisionAction,
  NotchFileResult,
  NotchOpenResult,
  NotchPhase,
  NotchStatePayload,
  ScreenAskInput
} from '../shared/types'
import type { ActionClient } from './action-client'
import type { PasteService } from './dictation/paste'
import { normalizeTranscript, type LiveTranscriber, type LiveTurn } from './live-asr'
import { isScreenQuestion } from './screen-intent'
import type { ScreenFrame, ScreenService, ScreenTurn } from './screen-service'

export interface NotchPresenter {
  show(): void
  hide(): void
  startSession(sessionId: number): void
  stopSession(): void
  cancelSession(): void
  update(state: NotchStatePayload): void
  partial(text: string): void
  setSpeechActive?(active: boolean): void
  dismissWithAnimation?(): void
  reposition?(targetDisplay?: unknown): void
}

/**
 * Main-process only: existence checks and the actual open/reveal calls. The
 * renderer never sees paths; it only sends row ids through the controller.
 */
export interface NotchFileService {
  isRegularFile(path: string): boolean
  open(path: string): Promise<NotchOpenResult>
  reveal(path: string): Promise<NotchOpenResult>
}

/** Extensions that can execute or script something, so we reveal instead. */
export const RISKY_FILE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.lnk',
  '.msi',
  '.vbs',
  '.js',
  '.jar'
])

export function isRiskyFile(path: string): boolean {
  return RISKY_FILE_EXTENSIONS.has(extname(path).toLowerCase())
}

export interface NotchControllerOptions {
  presenter: NotchPresenter
  getTranscriber: () => LiveTranscriber | null
  actionClient: ActionClient
  paste: PasteService
  fileService: NotchFileService
  screen?: ScreenService
  onActivity?: (activity: NotchActivity) => void
  onTurnComplete?: () => void
  endFallbackMs?: number
  resultVisibleMs?: number
  errorVisibleMs?: number
  fileResultsVisibleMs?: number
  screenResultVisibleMs?: number
  now?: () => number
}

interface FileCandidate {
  name: string
  path: string
  sizeBytes: number | null
  modified: string
}

interface StateExtras {
  spoken?: string | null
  card?: NotchCard | null
  results?: NotchFileResult[] | null
  resultsLabel?: string | null
  decision?: NotchDecision | null
}

/** A write the user still has to decide on. Kept in the main process only. */
interface PendingDecision {
  kind: 'confirm' | 'undo'
  planId: string
  target: string | null
  message: string
}

interface ActiveSession {
  id: number
  turn: LiveTurn | null
  sampleRate: number
  totalSamples: number
  lastTranscript: string
  stopping: boolean
  finalizing: boolean
  endTimer: NodeJS.Timeout | null
  turnError: Error | null
  screenTurn: Promise<ScreenTurn> | null
}

const MAX_SESSION_SECONDS = 120
const FILE_RESULTS_SAFETY_MS = 120_000
const DEFAULT_SCREEN_QUESTION = 'What is this?'
const DEFAULT_SCREEN_RESULT_VISIBLE_MS = 8_000
/** A short beat after the voice ends before the notch leaves. */
const SPEECH_END_GRACE_MS = 1_200
/** Safety cap if the renderer never reports the end of speech. */
const SPEECH_SAFETY_MS = 120_000
/** Safety deadline if the renderer does not complete its dismiss animation. */
const ESCAPE_DISMISS_FALLBACK_MS = 260

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeFileCandidate(value: unknown): FileCandidate | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const { name, path, sizeBytes, modified } = record
  if (typeof name !== 'string' || !name.trim()) return null
  if (typeof path !== 'string' || !isAbsolute(path)) return null

  return {
    name: name.trim(),
    path,
    sizeBytes:
      typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) && sizeBytes >= 0
        ? sizeBytes
        : null,
    modified: typeof modified === 'string' ? modified : ''
  }
}

function resultLabel(paths: string[]): string {
  const count = paths.length
  const noun = count === 1 ? 'item' : 'items'
  if (count === 0) return 'Files · 0 items'

  const parents = new Set(paths.map((path) => dirname(path)))
  if (parents.size === 1) {
    const folder = basename([...parents][0])
    if (folder) return `${folder} · ${count} ${noun}`
  }
  return `Files · ${count} ${noun}`
}

/**
 * Orchestrates one push-to-talk turn: notch visibility, streaming partials, the
 * final local transcription, and the backend action. Audio is pushed straight
 * to the local engine and dropped when the turn ends.
 */
export class NotchController {
  private readonly options: NotchControllerOptions
  private session: ActiveSession | null = null
  private nextSessionId = 1
  private visible = false
  private hideTimer: NodeJS.Timeout | null = null
  private escapeHideTimer: NodeJS.Timeout | null = null
  private pendingHide: (() => void) | null = null
  private speechActive = false
  private hideWhenSpeechEnds = false
  private speechSafetyTimer: NodeJS.Timeout | null = null
  private readonly resultPaths = new Map<number, string>()
  private fileResultsShown = false
  private decision: PendingDecision | null = null
  private lastTranscript = ''
  private submissionGeneration = 0
  private acting = false
  private disposed = false

  constructor(options: NotchControllerOptions) {
    this.options = options
  }

  get active(): boolean {
    return this.session !== null
  }

  isActing(): boolean {
    return this.acting
  }

  isBusy(): boolean {
    return this.hasActiveWork() || this.isActing() || this.hideWhenSpeechEnds
  }

  hasActiveWork(): boolean {
    return (
      this.session !== null ||
      this.acting ||
      this.decision !== null ||
      this.fileResultsShown ||
      this.speechActive ||
      this.hideWhenSpeechEnds ||
      this.hideTimer !== null
    )
  }

  start(): void {
    if (this.disposed) return
    if (this.session !== null) return

    this.clearEscapeHideTimer()
    this.clearHideTimer()
    this.resetSpeechState()
    this.clearFileResults()
    this.decision = null
    this.acting = false
    const session: ActiveSession = {
      id: this.nextSessionId++,
      turn: null,
      sampleRate: 48_000,
      totalSamples: 0,
      lastTranscript: '',
      stopping: false,
      finalizing: false,
      endTimer: null,
      turnError: null,
      screenTurn: null
    }
    this.session = session

    this.showPresenter()
    this.options.presenter.startSession(session.id)
    this.emit('listening', null, null)
    this.beginScreen()

    const transcriber = this.options.getTranscriber()
    if (transcriber) {
      try {
        session.turn = transcriber.startTurn({
          onPartial: (text) => this.handlePartial(session, text)
        })
      } catch (error) {
        session.turnError = error instanceof Error ? error : new Error(String(error))
        console.error('[notch] could not start the speech stream', session.turnError)
      }
    }

    console.log(`[notch] start session=${session.id}`)
  }

  pushAudio(samples: Float32Array, sampleRate: number): void {
    const session = this.session
    if (!session || session.finalizing) return
    if (!(samples instanceof Float32Array) || samples.length === 0) return
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) return
    if (session.totalSamples > 0 && session.sampleRate !== sampleRate) return
    session.sampleRate = sampleRate

    const limit = MAX_SESSION_SECONDS * session.sampleRate
    if (session.totalSamples + samples.length > limit) return

    session.totalSamples += samples.length
    try {
      session.turn?.push(samples, session.sampleRate)
    } catch (error) {
      session.turnError = error instanceof Error ? error : new Error(String(error))
    }
  }

  stop(): void {
    const session = this.session
    if (!session || session.stopping || session.finalizing) return

    session.stopping = true
    this.options.presenter.stopSession()
    this.emit('processing', session.lastTranscript || null, 'Transcribing locally…')
    this.finishScreen(session)
    console.log(`[notch] stop samples=${session.totalSamples} rate=${session.sampleRate}`)

    // The renderer flushes its final buffer and sends an explicit end event.
    // This timer is a fallback in case that event never arrives.
    session.endTimer = setTimeout(() => {
      session.endTimer = null
      void this.finalize(session)
    }, this.options.endFallbackMs ?? 700)
  }

  audioEnded(): void {
    const session = this.session
    if (!session || !session.stopping || session.finalizing) return
    if (session.endTimer) clearTimeout(session.endTimer)
    session.endTimer = null
    void this.finalize(session)
  }

  audioError(message: string): void {
    const session = this.session
    if (!session) {
      this.clearEscapeHideTimer()
      this.clearFileResults()
      this.showPresenter()
      this.emit('error', null, message, undefined, { spoken: message })
      this.scheduleHide(this.options.errorVisibleMs ?? 3_500)
      this.options.onTurnComplete?.()
      return
    }
    void this.fail(session, message, session.lastTranscript || null)
  }

  /**
   * The renderer reports when its speech queue starts and finishes. Hiding is
   * deferred until the whole answer has been spoken, so a long screen answer is
   * never cut off by the visibility timer.
   */
  setSpeechActive(active: boolean): void {
    if (this.disposed) return
    if (active && this.escapeHideTimer !== null) return
    this.speechActive = active
    this.options.presenter.setSpeechActive?.(active)

    if (active) {
      this.clearSpeechSafety()
      this.speechSafetyTimer = setTimeout(() => {
        this.speechSafetyTimer = null
        this.speechActive = false
        this.options.presenter.setSpeechActive?.(false)
        if (this.hideWhenSpeechEnds) {
          this.hideWhenSpeechEnds = false
          this.hideIfSpeechDone()
        }
      }, SPEECH_SAFETY_MS)
      return
    }

    this.clearSpeechSafety()
    if (!this.hideWhenSpeechEnds) return
    this.hideWhenSpeechEnds = false
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.hideIfSpeechDone()
    }, SPEECH_END_GRACE_MS)
  }

  /**
   * Cancels any active turn, speech, or pending state without calling
   * `presenter.hide()`, letting the renderer finish its collapse animation first.
   */
  cancelActiveWork(): void {
    this.clearActiveState({ cancelPresenterSession: false, logLabel: 'cancel-active' })
    this.options.onTurnComplete?.()
  }

  /** Global Escape handler: animates dismissal when visible or active, no-op when idle. */
  requestEscapeDismiss(): void {
    if (this.disposed) return
    if (!this.visible && !this.hasActiveWork()) return
    if (this.escapeHideTimer !== null) return

    this.cancelActiveWork()
    if (this.options.presenter.dismissWithAnimation) {
      this.options.presenter.dismissWithAnimation()
      this.escapeHideTimer = setTimeout(() => {
        this.escapeHideTimer = null
        this.hidePresenter()
      }, ESCAPE_DISMISS_FALLBACK_MS)
    } else {
      this.hidePresenter()
    }
  }

  startTyping(): void {
    if (this.disposed) return
    this.clearEscapeHideTimer()
    this.clearHideTimer()
    this.resetSpeechState()
    this.acting = false
    if (this.session !== null) {
      const session = this.session
      this.session = null
      this.clearSessionTimers(session)
      session.turn?.cancel()
      this.cancelScreen()
      this.options.presenter.stopSession()
      this.options.onTurnComplete?.()
      console.log(`[notch] startTyping session=${session.id}`)
    }
  }

  async submitText(text: string): Promise<void> {
    if (this.disposed) return

    const trimmed = text.trim()
    if (!trimmed) return

    this.submissionGeneration += 1
    const generation = this.submissionGeneration

    this.clearEscapeHideTimer()
    this.clearHideTimer()
    this.resetSpeechState()
    this.clearFileResults()
    this.decision = null

    if (this.session !== null) {
      const session = this.session
      this.session = null
      this.clearSessionTimers(session)
      session.turn?.cancel()
      this.cancelScreen()
      this.options.presenter.stopSession()
      this.options.onTurnComplete?.()
    }

    this.showPresenter()
    this.lastTranscript = trimmed
    this.acting = true
    this.emit('acting', trimmed, 'Working on it…')

    try {
      const response: ActionResponse = await this.options.actionClient.act(trimmed)
      if (this.disposed || generation !== this.submissionGeneration) return

      console.log(
        `[notch] action (submitted text) status=${response.status} action=${response.action} dryRun=${response.dryRun ?? false}`
      )

      if (response.text && response.action === 'type') {
        await this.options.paste.paste(response.text)
        if (this.disposed || generation !== this.submissionGeneration) return
      }

      if (response.status === 'error') {
        this.clearFileResults()
        this.decision = null
        this.cancelScreen()
        const errorMsg = response.message
        const spoken = response.spokenResponse || errorMsg
        this.emit('error', trimmed, errorMsg, 'error', { spoken })
        console.log(`[notch] error phase=error chars=${errorMsg.length}`)
        this.scheduleHide(this.options.errorVisibleMs ?? 3_500)
        this.options.onTurnComplete?.()
        return
      }

      const fileResults = Array.isArray(response.results)
        ? this.buildFileResults(response.results)
        : null
      const decision = this.pendingDecision(response)

      this.lastTranscript = trimmed
      this.decision = decision
      this.emit('result', trimmed, response.message, response.status, {
        spoken: response.spokenResponse || response.message,
        card: response.card ?? null,
        results: fileResults?.results ?? null,
        resultsLabel: fileResults?.label ?? null,
        decision: decision ? this.decisionPayload(decision, false) : null
      })
      console.log(
        `[notch] result phase=result status=${response.status} results=${fileResults?.results.length ?? 0} decision=${decision?.kind ?? 'none'}`
      )
      this.options.onTurnComplete?.()

      if (decision) {
        return
      }

      if (fileResults) {
        this.scheduleHide(this.options.fileResultsVisibleMs ?? FILE_RESULTS_SAFETY_MS, () =>
          this.clearFileResults()
        )
      } else if (response.card) {
        const kind =
          typeof response.card['kind'] === 'string' ? response.card['kind'] : ''
        this.scheduleHide(
          kind === 'email_list'
            ? this.options.fileResultsVisibleMs ?? FILE_RESULTS_SAFETY_MS
            : this.options.resultVisibleMs ?? 6_000
        )
      } else {
        this.scheduleHide(this.options.resultVisibleMs ?? 2_000)
      }
    } catch (error) {
      if (this.disposed || generation !== this.submissionGeneration) return
      this.clearFileResults()
      this.decision = null
      this.cancelScreen()
      const errorMsg = `That didn't work: ${errorMessage(error)}`
      this.emit('error', trimmed, errorMsg, 'error', { spoken: errorMsg })
      console.log(`[notch] error phase=error chars=${errorMsg.length}`)
      this.scheduleHide(this.options.errorVisibleMs ?? 3_500)
      this.options.onTurnComplete?.()
    } finally {
      if (generation === this.submissionGeneration) {
        this.acting = false
      }
    }
  }

  restoreHistory(prompt: string, reply: string): void {
    if (this.disposed) return
    this.clearEscapeHideTimer()
    this.clearActiveState({ cancelPresenterSession: false, logLabel: 'restoreHistory' })
    this.showPresenter()
    this.lastTranscript = prompt
    this.emit('result', prompt, reply, 'ok', { spoken: null })
  }

  cancel(): void {
    this.clearActiveState({ cancelPresenterSession: true, logLabel: 'cancel' })
    this.hidePresenter()
    this.options.onTurnComplete?.()
  }

  dispose(): void {
    this.disposed = true
    this.clearActiveState({ cancelPresenterSession: false })
    this.hidePresenter()
  }

  /**
   * Open a row from the current set. The id is resolved through the main-only
   * allowlist, re-checked against the filesystem, and never trusted as a path.
   */
  async openResult(id: number): Promise<NotchOpenResult> {
    const path = this.fileResultsShown ? this.resultPaths.get(id) : undefined
    if (!path) return { ok: false, message: 'That file is no longer available.' }

    const name = basename(path)
    try {
      if (!this.options.fileService.isRegularFile(path)) {
        return {
          ok: false,
          message: `Couldn't find "${name}". It may have moved or been deleted.`
        }
      }

      const result = isRiskyFile(path)
        ? await this.options.fileService.reveal(path)
        : await this.options.fileService.open(path)

      if (!result.ok) {
        return { ok: false, message: result.message?.trim() || `Couldn't open "${name}".` }
      }

      this.dismissResults()
      return { ok: true }
    } catch (error) {
      return { ok: false, message: `Couldn't open "${name}": ${errorMessage(error)}` }
    }
  }

  /** The X button: drop the allowlist and leave the screen immediately. */
  dismissResults(): void {
    this.clearEscapeHideTimer()
    if (this.hasActiveWork()) {
      this.cancelActiveWork()
    }
    this.hidePresenter()
  }

  /**
   * Apply the user's choice on a write card. Only the plan id crosses back to
   * the backend; the card's path is display-only. A bad choice for the card is
   * ignored rather than guessed.
   */
  async decide(
    action: NotchDecisionAction,
    edits?: Record<string, unknown>
  ): Promise<void> {
    const decision = this.decision
    if (!decision) return
    if (decision.kind === 'confirm' && action === 'undo') return
    if (decision.kind === 'undo' && action !== 'undo') return

    this.clearHideTimer()
    this.emit('result', this.lastTranscript || null, decision.message, 'pending', {
      decision: this.decisionPayload(decision, true)
    })

    try {
      const response =
        action === 'undo'
          ? await this.options.actionClient.undo(decision.planId)
          : await this.options.actionClient.confirm(
              decision.planId,
              action === 'confirm',
              action === 'confirm' ? edits : undefined
            )

      this.decision = null
      const spoken = response.spokenResponse || response.message
      if (response.status === 'error') {
        this.emit('error', this.lastTranscript || null, response.message, 'error', {
          spoken
        })
        this.scheduleHide(this.options.errorVisibleMs ?? 3_500)
        return
      }
      // Speak the confirmation once the choice is applied. Falling back to the
      // message keeps a cancel ("Cancelled.") audible too.
      this.emit('result', this.lastTranscript || null, response.message, response.status, {
        spoken
      })
      this.scheduleHide(this.options.resultVisibleMs ?? 2_000)
    } catch (error) {
      // The card stays put so the user can try again; the plan is unchanged.
      const errorMsg = `That didn't work: ${errorMessage(error)}`
      this.emit('error', this.lastTranscript || null, errorMsg, 'error', {
        decision: this.decisionPayload(decision, false),
        spoken: errorMsg
      })
    }
    console.log(`[notch] decide action=${action} plan=${decision.planId}`)
  }

  private decisionPayload(decision: PendingDecision, busy: boolean): NotchDecision {
    return {
      kind: decision.kind,
      planId: decision.planId,
      target: decision.target,
      busy
    }
  }

  private pendingDecision(response: {
    status: string
    planId?: string | null
    target?: string | null
    canUndo?: boolean | null
    requiresConfirmation?: boolean | null
    message: string
  }): PendingDecision | null {
    const planId = response.planId
    if (typeof planId !== 'string' || !planId) return null
    const target = typeof response.target === 'string' && response.target ? response.target : null

    if (response.status === 'pending' && response.requiresConfirmation) {
      return { kind: 'confirm', planId, target, message: response.message }
    }
    if (response.status === 'ok' && response.canUndo) {
      return { kind: 'undo', planId, target, message: response.message }
    }
    return null
  }

  private handlePartial(session: ActiveSession, text: string): void {
    if (this.session !== session || session.stopping || session.finalizing) return
    const clean = normalizeTranscript(text)
    if (!clean || clean === session.lastTranscript) return

    session.lastTranscript = clean
    this.options.presenter.partial(clean)
    this.touch('listening', clean, null)
    console.log(`[notch] partial chars=${clean.length}`)
  }

  private async finalize(session: ActiveSession): Promise<void> {
    if (this.session !== session || session.finalizing) return
    session.finalizing = true
    session.stopping = true
    if (session.endTimer) clearTimeout(session.endTimer)
    session.endTimer = null

    const turn = session.turn
    let transcription: Promise<string> | null = null
    if (turn && session.totalSamples > 0 && !session.turnError) {
      // Kick off local transcription before waiting for the screen turn so the
      // ASR finish and the screenshot/composite pass overlap instead of adding
      // their latencies. The catch keeps an abandoned session from surfacing an
      // unhandled rejection; awaiting the promise below still observes it.
      transcription = Promise.resolve()
        .then(() => turn.finish())
        .then((result) => normalizeTranscript(result.text))
      void transcription.catch(() => undefined)
    }

    // The overlay finish already started on release, so capture/compositing
    // overlaps the local transcription finish instead of adding a serial delay.
    const screenTurn = await this.awaitScreenTurn(session)
    if (this.session !== session) return

    const marked = screenTurn?.marked === true

    if (!marked) {
      if (session.turnError) {
        await this.fail(session, `Transcription failed: ${errorMessage(session.turnError)}`)
        return
      }
      if (!turn) {
        await this.fail(
          session,
          'Speech recognition is not ready yet.',
          session.lastTranscript || null
        )
        return
      }
      if (session.totalSamples === 0) {
        await this.fail(session, "I didn't hear anything. Hold the shortcut and speak.")
        return
      }
    }

    // A marked turn with no usable transcript still closes the ASR socket.
    if (!transcription) turn?.cancel()

    let transcript = ''
    if (transcription) {
      try {
        transcript = await transcription
        if (this.session !== session) return
      } catch (error) {
        if (!marked) {
          await this.fail(session, `Transcription failed: ${errorMessage(error)}`)
          return
        }
        // A drawn circle is a complete request even when the mic or ASR failed.
        console.log('[notch] continuing with the screen after a transcription failure')
      }
    }

    if (this.session !== session) return
    if (!transcript && !marked) {
      await this.fail(session, "I didn't catch that. Try again a little closer to the mic.")
      return
    }

    session.lastTranscript = transcript
    console.log(`[notch] final chars=${transcript.length}`)

    if (marked) {
      await this.finishMarkedScreen(session, transcript, screenTurn)
      return
    }

    if (this.options.screen && isScreenQuestion(transcript)) {
      await this.captureAndAskScreen(session, transcript)
      return
    }

    this.acting = true
    this.emit('acting', transcript, 'Working on it…')

    try {
      const response: ActionResponse = await this.options.actionClient.act(transcript)
      if (this.session !== session) return
      console.log(
        `[notch] action status=${response.status} action=${response.action} dryRun=${response.dryRun ?? false}`
      )

      if (response.text && response.action === 'type') {
        await this.options.paste.paste(response.text)
        if (this.session !== session) return
      }

      if (response.status === 'error') {
        await this.fail(
          session,
          response.message,
          transcript,
          response.spokenResponse || null
        )
        return
      }

      if (response.action === 'look_at_screen') {
        await this.captureAndAskScreen(session, transcript)
        return
      }

      const fileResults = Array.isArray(response.results)
        ? this.buildFileResults(response.results)
        : null
      const decision = this.pendingDecision(response)

      this.session = null
      this.lastTranscript = transcript
      this.decision = decision
      this.emit('result', transcript, response.message, response.status, {
        spoken: response.spokenResponse || response.message,
        card: response.card ?? null,
        results: fileResults?.results ?? null,
        resultsLabel: fileResults?.label ?? null,
        decision: decision ? this.decisionPayload(decision, false) : null
      })
      console.log(
        `[notch] result phase=result status=${response.status} results=${fileResults?.results.length ?? 0} decision=${decision?.kind ?? 'none'}`
      )
      this.options.onTurnComplete?.()

      if (decision) {
        // A write card waits for the user to choose, dismiss, or start a new turn.
        return
      }

      if (fileResults) {
        // File results stay until a click, dismiss, new turn, cancel, or the
        // long safety timeout. Two seconds is far too short to choose a row.
        this.scheduleHide(this.options.fileResultsVisibleMs ?? FILE_RESULTS_SAFETY_MS, () =>
          this.clearFileResults()
        )
      } else if (response.card) {
        // A rich card stays long enough to read. An email list is row-based
        // like file results, so it gets the same long safety timeout instead of
        // the short one used by self-contained cards such as the weather card.
        const kind =
          typeof response.card['kind'] === 'string' ? response.card['kind'] : ''
        this.scheduleHide(
          kind === 'email_list'
            ? this.options.fileResultsVisibleMs ?? FILE_RESULTS_SAFETY_MS
            : this.options.resultVisibleMs ?? 6_000
        )
      } else {
        this.scheduleHide(this.options.resultVisibleMs ?? 2_000)
      }
    } catch (error) {
      await this.fail(session, `That didn't work: ${errorMessage(error)}`, transcript)
    } finally {
      this.acting = false
    }
  }

  private async awaitScreenTurn(session: ActiveSession): Promise<ScreenTurn | null> {
    if (!session.screenTurn) return null
    try {
      return await session.screenTurn
    } catch (error) {
      return { marked: false, frame: null, error: errorMessage(error) }
    }
  }

  private async finishMarkedScreen(
    session: ActiveSession,
    transcript: string,
    screenTurn: ScreenTurn | null
  ): Promise<void> {
    const frame = screenTurn?.frame
    if (!frame) {
      const detail = screenTurn?.error
        ? `Couldn't read your screen: ${screenTurn.error}`
        : "Couldn't read your screen. Try again."
      await this.fail(session, detail, transcript || null)
      return
    }

    const question = transcript.trim() || DEFAULT_SCREEN_QUESTION
    await this.askScreen(session, question, {
      question,
      imageBase64: frame.imageBase64,
      marked: true
    })
  }

  private async captureAndAskScreen(
    session: ActiveSession,
    transcript: string
  ): Promise<void> {
    const screen = this.options.screen
    if (!screen) {
      await this.fail(session, 'Screen reading is not available.', transcript)
      return
    }

    let frame: ScreenFrame
    try {
      frame = await screen.capture()
    } catch (error) {
      await this.fail(
        session,
        `Couldn't read your screen: ${errorMessage(error)}`,
        transcript
      )
      return
    }
    if (this.session !== session) return

    const question = transcript.trim() || DEFAULT_SCREEN_QUESTION
    await this.askScreen(session, question, {
      question,
      imageBase64: frame.imageBase64,
      marked: false
    })
  }

  private async askScreen(
    session: ActiveSession,
    displayTranscript: string | null,
    input: ScreenAskInput
  ): Promise<void> {
    if (this.session !== session) return
    this.acting = true
    this.emit('acting', displayTranscript, 'Reading your screen…')

    try {
      const response = await this.options.actionClient.askScreen(input)
      if (this.session !== session) return

      const answer = typeof response.answer === 'string' ? response.answer.trim() : ''
      if (!answer) {
        await this.fail(
          session,
          'The screen answer came back empty. Try again.',
          displayTranscript
        )
        return
      }

      this.session = null
      this.lastTranscript = displayTranscript ?? ''
      this.decision = null
      this.emit('result', displayTranscript, answer, 'ok', { spoken: answer })
      console.log(`[notch] result phase=result screen=true chars=${answer.length}`)
      this.options.onTurnComplete?.()
      this.scheduleHide(
        this.options.screenResultVisibleMs ?? DEFAULT_SCREEN_RESULT_VISIBLE_MS
      )
    } catch (error) {
      await this.fail(session, errorMessage(error), displayTranscript)
    } finally {
      this.acting = false
    }
  }

  private beginScreen(): void {
    try {
      this.options.screen?.begin()
    } catch (error) {
      console.error('[notch] could not start the screen overlay', error)
    }
  }

  private finishScreen(session: ActiveSession): void {
    const screen = this.options.screen
    if (!screen) return
    try {
      // The controller may abandon this session (Escape, mic error) before
      // finalize awaits the turn, so always attach a resolver here.
      session.screenTurn = screen.finish().catch((error: unknown) => ({
        marked: false,
        frame: null,
        error: errorMessage(error)
      }))
    } catch (error) {
      session.screenTurn = Promise.resolve({
        marked: false,
        frame: null,
        error: errorMessage(error)
      })
    }
  }

  private cancelScreen(): void {
    try {
      this.options.screen?.cancel()
    } catch (error) {
      console.error('[notch] could not cancel the screen overlay', error)
    }
  }

  private buildFileResults(raw: unknown[]): {
    results: NotchFileResult[]
    label: string
  } {
    this.clearFileResults()
    this.fileResultsShown = true

    const valid: FileCandidate[] = []
    for (const item of raw) {
      const candidate = normalizeFileCandidate(item)
      if (!candidate) continue
      if (!this.options.fileService.isRegularFile(candidate.path)) continue
      valid.push(candidate)
    }

    const results = valid.map((candidate, index): NotchFileResult => {
      const id = index + 1
      this.resultPaths.set(id, candidate.path)
      return {
        id,
        name: candidate.name,
        sizeBytes: candidate.sizeBytes,
        modified: candidate.modified
      }
    })

    return { results, label: resultLabel(valid.map((candidate) => candidate.path)) }
  }

  private clearFileResults(): void {
    this.resultPaths.clear()
    this.fileResultsShown = false
  }

  private async fail(
    session: ActiveSession,
    message: string,
    transcript: string | null = null,
    spoken: string | null = null
  ): Promise<void> {
    if (this.session !== session) return
    this.session = null
    this.acting = false
    session.turn?.cancel()
    this.clearSessionTimers(session)
    this.clearFileResults()
    this.decision = null
    this.cancelScreen()
    // Errors are spoken too, so a failure is never silent. The caller may pass
    // a friendlier spoken line; otherwise the message itself is read aloud.
    this.emit('error', transcript, message, 'error', { spoken: spoken || message })
    console.log(`[notch] error phase=error chars=${message.length}`)
    this.scheduleHide(this.options.errorVisibleMs ?? 3_500)
    this.options.onTurnComplete?.()
  }

  private emit(
    phase: NotchPhase,
    transcript: string | null,
    message: string | null,
    status?: string | null,
    extras?: StateExtras
  ): void {
    const state: NotchStatePayload = {
      phase,
      status: status ?? null,
      transcript,
      message,
      spoken: extras?.spoken ?? null,
      card: extras?.card ?? null,
      results: extras?.results ?? null,
      resultsLabel: extras?.resultsLabel ?? null,
      decision: extras?.decision ?? null,
      at: this.options.now?.() ?? Date.now()
    }
    this.options.presenter.update(state)
    this.options.onActivity?.({ ...state })
  }

  /** Refresh the activity log without re-sending a full state transition. */
  private touch(
    phase: NotchPhase,
    transcript: string | null,
    message: string | null,
    status?: string | null
  ): void {
    this.options.onActivity?.({
      phase,
      status: status ?? null,
      transcript,
      message,
      at: this.options.now?.() ?? Date.now()
    })
  }

  private showPresenter(): void {
    this.visible = true
    this.options.presenter.show()
  }

  private hidePresenter(): void {
    this.clearEscapeHideTimer()
    this.visible = false
    this.options.presenter.hide()
  }

  private clearActiveState(options: { cancelPresenterSession: boolean; logLabel?: string }): void {
    this.submissionGeneration += 1
    this.acting = false
    const session = this.session
    this.session = null
    this.clearHideTimer()
    this.resetSpeechState()
    this.clearFileResults()
    this.decision = null
    this.cancelScreen()
    if (session) {
      this.clearSessionTimers(session)
      session.turn?.cancel()
      if (options.cancelPresenterSession) {
        this.options.presenter.cancelSession()
      }
      if (options.logLabel) {
        console.log(`[notch] ${options.logLabel} session=${session.id}`)
      }
    }
  }

  private scheduleHide(delayMs: number, onHide?: () => void): void {
    this.clearHideTimer()
    this.pendingHide = onHide ?? null
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.hideIfSpeechDone()
    }, delayMs)
  }

  private hideIfSpeechDone(): void {
    if (this.speechActive) {
      this.hideWhenSpeechEnds = true
      return
    }
    const onHide = this.pendingHide
    this.pendingHide = null
    onHide?.()
    this.hidePresenter()
  }

  private clearHideTimer(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = null
    this.hideWhenSpeechEnds = false
    this.pendingHide = null
  }

  private clearEscapeHideTimer(): void {
    if (this.escapeHideTimer !== null) clearTimeout(this.escapeHideTimer)
    this.escapeHideTimer = null
  }

  private resetSpeechState(): void {
    if (this.speechActive) {
      this.options.presenter.setSpeechActive?.(false)
    }
    this.speechActive = false
    this.hideWhenSpeechEnds = false
    this.clearSpeechSafety()
  }

  private clearSpeechSafety(): void {
    if (this.speechSafetyTimer) clearTimeout(this.speechSafetyTimer)
    this.speechSafetyTimer = null
  }

  private clearSessionTimers(session: ActiveSession): void {
    if (session.endTimer) clearTimeout(session.endTimer)
    session.endTimer = null
  }
}
