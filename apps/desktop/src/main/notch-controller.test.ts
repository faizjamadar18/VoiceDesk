import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActionResponse,
  NotchOpenResult,
  NotchStatePayload,
  ScreenAskInput
} from '../shared/types'
import type { ActionClient } from './action-client'
import type { PasteService } from './dictation/paste'
import type { LiveTranscriber, LiveTurn, LiveTurnHandlers } from './live-asr'
import type { ScreenFrame, ScreenService, ScreenTurn } from './screen-service'
import {
  NotchController,
  type NotchFileService,
  type NotchPresenter
} from './notch-controller'

class FakePresenter implements NotchPresenter {
  shown = 0
  hidden = 0
  dismisses = 0
  speechStates: boolean[] = []
  startIds: number[] = []
  stops = 0
  cancels = 0
  states: { phase: string; transcript: string | null; message: string | null }[] = []
  payloads: NotchStatePayload[] = []
  partials: string[] = []

  show(): void {
    this.shown += 1
  }

  hide(): void {
    this.hidden += 1
  }

  dismissWithAnimation(): void {
    this.dismisses += 1
  }

  setSpeechActive(active: boolean): void {
    this.speechStates.push(active)
  }

  startSession(sessionId: number): void {
    this.startIds.push(sessionId)
  }

  stopSession(): void {
    this.stops += 1
  }

  cancelSession(): void {
    this.cancels += 1
  }

  update(state: NotchStatePayload): void {
    this.states.push({ phase: state.phase, transcript: state.transcript, message: state.message })
    this.payloads.push(structuredClone(state))
  }

  partial(text: string): void {
    this.partials.push(text)
  }
}

class FakeTranscriber implements LiveTranscriber {
  finalText = 'open notepad'
  partialText = 'open'
  throwOnFinal: Error | null = null
  startError: Error | null = null
  pushes = 0
  cancels = 0
  finishCalls = 0

  startTurn(handlers: LiveTurnHandlers = {}): LiveTurn {
    if (this.startError) throw this.startError
    const parent = this
    return {
      push() {
        parent.pushes += 1
        if (parent.partialText) handlers.onPartial?.(parent.partialText)
      },
      async finish() {
        parent.finishCalls += 1
        if (parent.throwOnFinal) throw parent.throwOnFinal
        return { text: parent.finalText, latencyMs: 5, provider: 'fake' }
      },
      cancel() {
        parent.cancels += 1
      }
    }
  }
}

class FakeActionClient implements ActionClient {
  readonly transcripts: string[] = []
  readonly confirmations: { planId: string; approved: boolean }[] = []
  readonly undos: string[] = []
  readonly screenInputs: ScreenAskInput[] = []
  response: ActionResponse = {
    status: 'ok',
    action: 'open_app',
    message: 'Opening Notepad.',
    dryRun: true
  }
  confirmResponse: ActionResponse = {
    status: 'cancelled',
    action: 'none',
    message: 'Cancelled.',
    dryRun: true
  }
  undoResponse: ActionResponse = {
    status: 'ok',
    action: 'undo',
    message: 'Undone.',
    dryRun: true
  }
  screenAnswer = 'The error says the file is missing.'
  screenError: Error | null = null
  failDecision: Error | null = null
  holdNext = false
  onAct?: () => void
  private heldConfirm: ((response: ActionResponse) => void) | null = null

  async act(transcript: string): Promise<ActionResponse> {
    this.transcripts.push(transcript)
    this.onAct?.()
    return this.response
  }

  async confirm(planId: string, approved: boolean): Promise<ActionResponse> {
    this.confirmations.push({ planId, approved })
    if (this.failDecision) throw this.failDecision
    if (this.holdNext) {
      return new Promise<ActionResponse>((resolve) => {
        this.heldConfirm = resolve
      })
    }
    return this.confirmResponse
  }

  async undo(planId: string): Promise<ActionResponse> {
    this.undos.push(planId)
    if (this.failDecision) throw this.failDecision
    return this.undoResponse
  }

  async askScreen(input: ScreenAskInput): Promise<{ answer: string; model?: string }> {
    this.screenInputs.push({ ...input })
    if (this.screenError) throw this.screenError
    return { answer: this.screenAnswer, model: 'fake-vision' }
  }

  releaseHeld(response = this.confirmResponse): void {
    this.heldConfirm?.(response)
    this.heldConfirm = null
  }
}

class FakePaste implements PasteService {
  readonly pasted: string[] = []

  async paste(text: string): Promise<void> {
    this.pasted.push(text)
  }
}

class FakeFileService implements NotchFileService {
  readonly files = new Set<string>()
  readonly opened: string[] = []
  readonly revealed: string[] = []
  openError: string | null = null
  revealError: string | null = null

  isRegularFile(path: string): boolean {
    return this.files.has(path)
  }

  async open(path: string): Promise<NotchOpenResult> {
    if (this.openError) return { ok: false, message: this.openError }
    this.opened.push(path)
    return { ok: true }
  }

  async reveal(path: string): Promise<NotchOpenResult> {
    if (this.revealError) return { ok: false, message: this.revealError }
    this.revealed.push(path)
    return { ok: true }
  }
}

const SCREEN_FRAME: ScreenFrame = {
  imageBase64: 'iVBORw0KGgoAAAANSUhEUg==',
  mimeType: 'image/png'
}

class FakeScreenService implements ScreenService {
  begins = 0
  finishes = 0
  captures = 0
  cancels = 0
  turn: ScreenTurn = { marked: false, frame: null, error: null }
  frame: ScreenFrame = SCREEN_FRAME
  finishError: Error | null = null
  finishGate: Promise<void> | null = null
  captureError: Error | null = null

  begin(): void {
    this.begins += 1
  }

  async finish(): Promise<ScreenTurn> {
    this.finishes += 1
    if (this.finishGate) await this.finishGate
    if (this.finishError) throw this.finishError
    return this.turn
  }

  async capture(): Promise<ScreenFrame> {
    this.captures += 1
    if (this.captureError) throw this.captureError
    return this.frame
  }

  cancel(): void {
    this.cancels += 1
  }
}

function setup(options: {
  screen?: FakeScreenService
  screenResultVisibleMs?: number
} = {}) {
  const presenter = new FakePresenter()
  const transcriber = new FakeTranscriber()
  const actionClient = new FakeActionClient()
  const paste = new FakePaste()
  const files = new FakeFileService()
  const activities: string[] = []
  let turnCompletes = 0
  const controller = new NotchController({
    presenter,
    getTranscriber: () => transcriber,
    actionClient,
    paste,
    fileService: files,
    screen: options.screen,
    screenResultVisibleMs: options.screenResultVisibleMs,
    onActivity: (activity) => activities.push(activity.phase),
    onTurnComplete: () => {
      turnCompletes += 1
    },
    endFallbackMs: 700,
    resultVisibleMs: 2_000,
    errorVisibleMs: 3_500,
    now: () => 1_000
  })
  return {
    presenter,
    transcriber,
    actionClient,
    paste,
    files,
    screen: options.screen,
    activities,
    turnCompletes: () => turnCompletes,
    controller
  }
}

function speech(seconds = 1, rate = 16_000): Float32Array {
  return new Float32Array(Math.round(seconds * rate)).fill(0.1)
}

const TAX_DIR = resolve('KestrelTests', '2025 Tax Returns')

interface RawFileResult {
  [key: string]: unknown
  name: string
  path: string
  sizeBytes: number | null
  modified: string
}

function fileResult(
  name: string,
  options: { dir?: string; sizeBytes?: number | null; modified?: string } = {}
): RawFileResult {
  return {
    name,
    path: join(options.dir ?? TAX_DIR, name),
    sizeBytes: 'sizeBytes' in options ? (options.sizeBytes ?? null) : 1_024,
    modified: options.modified ?? '2025-03-14T12:00:00+00:00'
  }
}

async function runFileSearch(
  context: ReturnType<typeof setup>,
  results: RawFileResult[],
  options: { register?: boolean } = {}
): Promise<void> {
  if (options.register ?? true) {
    for (const result of results) context.files.files.add(result.path)
  }
  context.actionClient.response = {
    status: 'ok',
    action: 'search_files',
    message: `I found ${results.length} file(s).`,
    results
  }
  context.controller.start()
  context.controller.pushAudio(speech(1), 16_000)
  context.controller.stop()
  context.controller.audioEnded()
  await vi.advanceTimersByTimeAsync(0)
}

async function runTurn(
  context: ReturnType<typeof setup>,
  response: ActionResponse
): Promise<void> {
  context.actionClient.response = response
  context.controller.start()
  context.controller.pushAudio(speech(1), 16_000)
  context.controller.stop()
  context.controller.audioEnded()
  await vi.advanceTimersByTimeAsync(0)
}

async function completeTurn(context: ReturnType<typeof setup>): Promise<void> {
  context.controller.start()
  context.controller.pushAudio(speech(1), 16_000)
  context.controller.stop()
  context.controller.audioEnded()
  await vi.advanceTimersByTimeAsync(0)
}

const PENDING_DELETE: ActionResponse = {
  status: 'pending',
  action: 'delete_file',
  message: 'Delete "report.pdf"? Approval needed.',
  requiresConfirmation: true,
  risk: 'write',
  planId: 'plan-1',
  target: join(TAX_DIR, 'report.pdf'),
  dryRun: false
}

const CREATED_FILE: ActionResponse = {
  status: 'ok',
  action: 'create_file',
  message: `Created "notes.txt" in ${TAX_DIR}.`,
  planId: 'plan-2',
  target: join(TAX_DIR, 'notes.txt'),
  canUndo: true,
  dryRun: false
}

describe('NotchController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the notch and emits listening on start', () => {
    const { presenter, controller } = setup()

    controller.start()

    expect(presenter.shown).toBe(1)
    expect(presenter.startIds).toEqual([1])
    expect(presenter.states).toEqual([
      { phase: 'listening', transcript: null, message: null }
    ])

    controller.dispose()
  })

  it('emits acting while working, then result with card and final speech', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'ok',
      action: 'weather',
      message: 'Weather for India: 29°C, Clear.',
      card: {
        kind: 'weather',
        location: 'India',
        temperature: '29°C',
        low: '17°',
        condition: 'Clear',
        icon: 'sun'
      },
      spokenResponse: 'The forecast returned clear skies today with a high of 29.'
    }

    let phasesDuringAct: string[] = []
    actionClient.onAct = () => {
      phasesDuringAct = presenter.payloads.map((p) => p.phase)
    }

    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(phasesDuringAct.at(-1)).toBe('acting')
    expect(phasesDuringAct).not.toContain('result')

    const actingPayload = presenter.payloads.find((p) => p.phase === 'acting')
    expect(actingPayload?.message).toBe('Working on it…')

    const resultPayload = presenter.payloads.find((p) => p.phase === 'result')
    expect(resultPayload?.card?.kind).toBe('weather')
    expect(resultPayload?.spoken).toBe('The forecast returned clear skies today with a high of 29.')

    controller.dispose()
  })

  it('streams partial transcripts while listening', () => {
    const { presenter, controller } = setup()
    controller.start()
    controller.pushAudio(speech(1), 16_000)

    expect(presenter.partials).toEqual(['open'])
    expect(presenter.states.at(-1)).toEqual({
      phase: 'listening',
      transcript: null,
      message: null
    })

    controller.dispose()
  })

  it('finalizes on release, runs the action, and hides after the result', async () => {
    const { presenter, controller, actionClient } = setup()
    controller.start()
    controller.pushAudio(speech(1), 16_000)

    controller.stop()
    expect(presenter.stops).toBe(1)
    expect(presenter.states.at(-1)?.phase).toBe('processing')

    controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(actionClient.transcripts).toEqual(['open notepad'])
    expect(presenter.states.at(-1)).toEqual({
      phase: 'result',
      transcript: 'open notepad',
      message: 'Opening Notepad.'
    })
    expect(presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(presenter.hidden).toBe(1)
  })

  it('waits for an explicit end signal but finalizes on the fallback timer', async () => {
    const { presenter, controller, actionClient } = setup()
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()

    await vi.advanceTimersByTimeAsync(699)
    expect(actionClient.transcripts).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(actionClient.transcripts).toEqual(['open notepad'])
    expect(presenter.states.at(-1)?.phase).toBe('result')
  })

  it('pastes typed text into the focused app', async () => {
    const { controller, actionClient, paste } = setup()
    actionClient.response = {
      status: 'ok',
      action: 'type',
      message: 'Typing that into the focused app.',
      text: 'hello world',
      dryRun: true
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(paste.pasted).toEqual(['hello world'])
  })

  it('shows the unhandled message as a result rather than an error', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'unhandled',
      action: 'none',
      message: 'I did not catch a command.',
      dryRun: true
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.states.at(-1)).toEqual({
      phase: 'result',
      transcript: 'open notepad',
      message: 'I did not catch a command.'
    })
  })

  it('shows a tool error as an error rather than a successful result', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'error',
      action: 'search_files',
      message: 'Windows Search is not available on this PC.',
      dryRun: true
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.states.at(-1)).toEqual({
      phase: 'error',
      transcript: 'open notepad',
      message: 'Windows Search is not available on this PC.'
    })
  })

  it('speaks the spoken response of an error result', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'error',
      action: 'open_app',
      message: 'Notion is not installed on this PC.',
      spokenResponse: 'Notion is not installed on this PC.',
      dryRun: false
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    const state = presenter.payloads.at(-1)
    expect(state?.phase).toBe('error')
    expect(state?.spoken).toBe('Notion is not installed on this PC.')
  })

  it('falls back to the error message when no spoken response is given', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'error',
      action: 'open_app',
      message: 'Notion is not installed on this PC.',
      dryRun: false
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.payloads.at(-1)?.spoken).toBe(
      'Notion is not installed on this PC.'
    )
  })

  it('speaks failures raised before a response', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.act = async () => {
      throw new Error('backend offline')
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.payloads.at(-1)?.phase).toBe('error')
    expect(presenter.payloads.at(-1)?.spoken).toContain('backend offline')
  })

  it('waits for error speech before hiding', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.response = {
      status: 'error',
      action: 'open_app',
      message: 'Notion is not installed on this PC.',
      spokenResponse: 'Notion is not installed on this PC.',
      dryRun: false
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    controller.setSpeechActive(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(presenter.hidden).toBe(0)

    controller.setSpeechActive(false)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(presenter.hidden).toBe(1)
  })

  it('cancels the stream without acting', async () => {
    const { presenter, controller, actionClient, transcriber } = setup()
    controller.start()
    controller.pushAudio(speech(1), 16_000)

    controller.cancel()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(transcriber.cancels).toBe(1)
    expect(presenter.cancels).toBe(1)
    expect(presenter.hidden).toBe(1)
    expect(actionClient.transcripts).toEqual([])
  })

  it('dismisses a result and lets a new turn start', async () => {
    const { presenter, controller } = setup()
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    controller.start()
    expect(presenter.startIds).toEqual([1, 2])
    expect(presenter.states.at(-1)?.phase).toBe('listening')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(presenter.hidden).toBe(0)
  })

  it('reports empty audio as an error', async () => {
    const { presenter, controller, actionClient, transcriber } = setup()
    controller.start()
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(actionClient.transcripts).toEqual([])
    expect(transcriber.cancels).toBe(1)
    expect(presenter.states.at(-1)?.phase).toBe('error')
    expect(presenter.states.at(-1)?.message).toContain("didn't hear anything")
  })

  it('reports an empty final transcript as no speech detected instead of acting', async () => {
    const { presenter, controller, transcriber, actionClient } = setup()
    transcriber.partialText = ''
    transcriber.finalText = ''
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(actionClient.transcripts).toEqual([])
    expect(presenter.states.at(-1)?.phase).toBe('error')
    expect(presenter.states.at(-1)?.message).toContain("didn't catch that")
  })

  it('reports transcription failures as an error', async () => {
    const { presenter, controller, transcriber } = setup()
    transcriber.throwOnFinal = new Error('model crashed')
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.states.at(-1)).toEqual({
      phase: 'error',
      transcript: null,
      message: 'Transcription failed: model crashed'
    })
  })

  it('reports action failures as an error', async () => {
    const { presenter, controller, actionClient } = setup()
    actionClient.act = async () => {
      throw new Error('backend offline')
    }
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.states.at(-1)?.phase).toBe('error')
    expect(presenter.states.at(-1)?.message).toContain('backend offline')
  })

  it('reports a missing transcriber without hanging', async () => {
    const presenter = new FakePresenter()
    const controller = new NotchController({
      presenter,
      getTranscriber: () => null,
      actionClient: new FakeActionClient(),
      paste: new FakePaste(),
      fileService: new FakeFileService(),
      now: () => 1_000
    })
    controller.start()
    controller.pushAudio(speech(1), 16_000)
    controller.stop()
    controller.audioEnded()

    await vi.advanceTimersByTimeAsync(0)

    expect(presenter.states.at(-1)).toEqual({
      phase: 'error',
      transcript: null,
      message: 'Speech recognition is not ready yet.'
    })
  })
})

describe('NotchController file results', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits display-only rows with stable ids and a shared-folder label', async () => {
    const context = setup()
    const first = fileResult('return.pdf', { sizeBytes: 2_048 })
    const second = fileResult('summary.docx', { sizeBytes: 5 * 1_024 })
    await runFileSearch(context, [first, second])

    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('result')
    expect(state?.results).toEqual([
      { id: 1, name: 'return.pdf', sizeBytes: 2_048, modified: first.modified },
      { id: 2, name: 'summary.docx', sizeBytes: 5 * 1_024, modified: second.modified }
    ])
    expect(state?.resultsLabel).toBe('2025 Tax Returns · 2 items')
    expect(state?.results?.some((row) => 'path' in row)).toBe(false)
    expect(JSON.stringify(state?.results)).not.toContain(TAX_DIR)

    context.controller.dispose()
  })

  it('does not invent a size when the search result has none', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf', { sizeBytes: null })])

    expect(context.presenter.payloads.at(-1)?.results?.[0]?.sizeBytes).toBeNull()
    context.controller.dispose()
  })

  it('labels results from different folders as plain files', async () => {
    const context = setup()
    await runFileSearch(context, [
      fileResult('return.pdf'),
      fileResult('budget.xlsx', { dir: resolve('KestrelTests', 'Finance') })
    ])

    expect(context.presenter.payloads.at(-1)?.resultsLabel).toBe('Files · 2 items')
    context.controller.dispose()
  })

  it('opens the real path for a valid row id and dismisses the card', async () => {
    const context = setup()
    const first = fileResult('return.pdf')
    const second = fileResult('summary.docx')
    await runFileSearch(context, [first, second])

    await expect(context.controller.openResult(2)).resolves.toEqual({ ok: true })

    expect(context.files.opened).toEqual([second.path])
    expect(context.files.revealed).toEqual([])
    expect(context.presenter.hidden).toBe(1)
    await expect(context.controller.openResult(2)).resolves.toMatchObject({ ok: false })
  })

  it('reveals risky file types instead of launching them', async () => {
    const context = setup()
    const setupFile = fileResult('Install Kestrel.EXE')
    await runFileSearch(context, [setupFile])

    await expect(context.controller.openResult(1)).resolves.toEqual({ ok: true })

    expect(context.files.revealed).toEqual([setupFile.path])
    expect(context.files.opened).toEqual([])
  })

  it('rejects an unknown result id without opening anything', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])

    const result = await context.controller.openResult(99)

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/no longer available/i)
    expect(context.files.opened).toEqual([])
    expect(context.files.revealed).toEqual([])
    expect(context.presenter.hidden).toBe(0)

    context.controller.dispose()
  })

  it('rejects a file that disappeared before the click', async () => {
    const context = setup()
    const file = fileResult('return.pdf')
    await runFileSearch(context, [file])
    context.files.files.delete(file.path)

    const result = await context.controller.openResult(1)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('return.pdf')
    expect(context.files.opened).toEqual([])
    expect(context.presenter.hidden).toBe(0)

    context.controller.dispose()
  })

  it('keeps the card and reports an honest error when the opener fails', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])
    context.files.openError = 'No application is associated with this file.'

    await expect(context.controller.openResult(1)).resolves.toEqual({
      ok: false,
      message: 'No application is associated with this file.'
    })
    expect(context.presenter.hidden).toBe(0)

    context.files.openError = null
    await expect(context.controller.openResult(1)).resolves.toEqual({ ok: true })
  })

  it('clears the allowlist when a new turn starts', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])

    context.controller.start()

    expect(context.presenter.payloads.at(-1)?.results).toBeNull()
    await expect(context.controller.openResult(1)).resolves.toMatchObject({ ok: false })
    expect(context.files.opened).toEqual([])

    context.controller.dispose()
  })

  it('clears the allowlist on cancel', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])

    context.controller.cancel()

    await expect(context.controller.openResult(1)).resolves.toMatchObject({ ok: false })
    expect(context.files.opened).toEqual([])
  })

  it('clears the allowlist when the card is dismissed', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])

    context.controller.dismissResults()

    expect(context.presenter.hidden).toBe(1)
    await expect(context.controller.openResult(1)).resolves.toMatchObject({ ok: false })
    expect(context.files.opened).toEqual([])
  })

  it('does not auto-hide file results after two seconds', async () => {
    const context = setup()
    await runFileSearch(context, [fileResult('return.pdf')])

    await vi.advanceTimersByTimeAsync(2_000)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(117_999)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(context.presenter.hidden).toBe(1)
    await expect(context.controller.openResult(1)).resolves.toMatchObject({ ok: false })
  })

  it('filters results that are missing or not absolute before showing them', async () => {
    const context = setup()
    const present = fileResult('present.pdf')
    const gone = fileResult('gone.pdf')
    context.files.files.add(present.path)

    await runFileSearch(
      context,
      [
        present,
        gone,
        { ...fileResult('relative.pdf'), path: 'relative.pdf' }
      ],
      { register: false }
    )

    const state = context.presenter.payloads.at(-1)
    expect(state?.results?.map((row) => row.name)).toEqual(['present.pdf'])
    expect(state?.resultsLabel).toBe('2025 Tax Returns · 1 item')
  })

  it('shows an honest empty state that stays on screen', async () => {
    const context = setup()
    await runFileSearch(context, [])

    const state = context.presenter.payloads.at(-1)
    expect(state?.results).toEqual([])
    expect(state?.resultsLabel).toBe('Files · 0 items')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(context.presenter.hidden).toBe(0)

    context.controller.dispose()
  })

  it('keeps the short timeout for non-file results', async () => {
    const context = setup()
    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.stop()
    context.controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(context.presenter.payloads.at(-1)?.results).toBeNull()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(context.presenter.hidden).toBe(1)
  })
})

describe('NotchController write decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks for approval on a pending delete and never auto-hides it', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)

    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('result')
    expect(state?.message).toBe('Delete "report.pdf"? Approval needed.')
    expect(state?.decision).toEqual({
      kind: 'confirm',
      planId: 'plan-1',
      target: join(TAX_DIR, 'report.pdf'),
      busy: false
    })

    await vi.advanceTimersByTimeAsync(120_000)
    expect(context.presenter.hidden).toBe(0)

    context.controller.dispose()
  })

  it('runs the delete when the user confirms, then hides', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)
    context.actionClient.confirmResponse = {
      status: 'ok',
      action: 'delete_file',
      message: 'Moved "report.pdf" to the Recycle Bin.',
      dryRun: false
    }

    await context.controller.decide('confirm')

    expect(context.actionClient.confirmations).toEqual([
      { planId: 'plan-1', approved: true }
    ])
    expect(context.actionClient.undos).toEqual([])
    const state = context.presenter.payloads.at(-1)
    expect(state?.decision).toBeNull()
    expect(state?.message).toContain('Recycle Bin')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(context.presenter.hidden).toBe(1)
  })

  it('keeps the file when the user cancels', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)
    context.actionClient.confirmResponse = {
      status: 'cancelled',
      action: 'none',
      message: 'Cancelled.',
      dryRun: false
    }

    await context.controller.decide('cancel')

    expect(context.actionClient.confirmations).toEqual([
      { planId: 'plan-1', approved: false }
    ])
    expect(context.presenter.payloads.at(-1)?.decision).toBeNull()
    expect(context.presenter.payloads.at(-1)?.message).toBe('Cancelled.')
  })

  it('offers an undo after a create and never auto-hides it', async () => {
    const context = setup()
    await runTurn(context, CREATED_FILE)

    const state = context.presenter.payloads.at(-1)
    expect(state?.message).toContain('notes.txt')
    expect(state?.decision).toEqual({
      kind: 'undo',
      planId: 'plan-2',
      target: join(TAX_DIR, 'notes.txt'),
      busy: false
    })

    await vi.advanceTimersByTimeAsync(120_000)
    expect(context.presenter.hidden).toBe(0)

    context.controller.dispose()
  })

  it('runs the undo when the user clicks it', async () => {
    const context = setup()
    await runTurn(context, CREATED_FILE)
    context.actionClient.undoResponse = {
      status: 'ok',
      action: 'undo',
      message: 'Removed "notes.txt".',
      dryRun: false
    }

    await context.controller.decide('undo')

    expect(context.actionClient.undos).toEqual(['plan-2'])
    expect(context.actionClient.confirmations).toEqual([])
    expect(context.presenter.payloads.at(-1)?.decision).toBeNull()
    expect(context.presenter.payloads.at(-1)?.message).toContain('Removed')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(context.presenter.hidden).toBe(1)
  })

  it('shows a busy decision while the choice is in flight', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)
    context.actionClient.holdNext = true

    const running = context.controller.decide('confirm')
    await vi.advanceTimersByTimeAsync(0)

    expect(context.presenter.payloads.at(-1)?.decision?.busy).toBe(true)

    context.actionClient.releaseHeld({
      status: 'ok',
      action: 'delete_file',
      message: 'Moved "report.pdf" to the Recycle Bin.',
      dryRun: false
    })
    await running

    expect(context.presenter.payloads.at(-1)?.decision).toBeNull()
  })

  it('ignores an action that does not belong to the card', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)

    await context.controller.decide('undo')

    expect(context.actionClient.confirmations).toEqual([])
    expect(context.actionClient.undos).toEqual([])
    expect(context.presenter.payloads.at(-1)?.decision?.kind).toBe('confirm')
  })

  it('leaves no decision on a plain result', async () => {
    const context = setup()
    await runTurn(context, {
      status: 'ok',
      action: 'open_app',
      message: 'Opening Notepad.',
      dryRun: true
    })

    expect(context.presenter.payloads.at(-1)?.decision).toBeNull()
  })

  it('clears the decision when a new turn starts', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)
    expect(context.presenter.payloads.at(-1)?.decision).not.toBeNull()

    context.controller.start()

    expect(context.presenter.payloads.at(-1)?.decision).toBeNull()
    context.controller.dispose()
  })

  it('dismisses a decision card without touching the backend', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)

    context.controller.dismissResults()

    expect(context.presenter.hidden).toBe(1)
    expect(context.actionClient.confirmations).toEqual([])
    expect(context.actionClient.undos).toEqual([])

    // The controller forgot the card: a stray click can no longer act on it.
    await context.controller.decide('confirm')
    expect(context.actionClient.confirmations).toEqual([])
  })

  it('keeps the card and reports a failed decision honestly', async () => {
    const context = setup()
    await runTurn(context, PENDING_DELETE)
    context.actionClient.failDecision = new Error('backend offline')

    await context.controller.decide('confirm')

    const state = context.presenter.payloads.at(-1)
    expect(state?.decision).toEqual({
      kind: 'confirm',
      planId: 'plan-1',
      target: join(TAX_DIR, 'report.pdf'),
      busy: false
    })
    expect(state?.message).toContain('backend offline')

    await vi.advanceTimersByTimeAsync(120_000)
    expect(context.presenter.hidden).toBe(0)
  })
})

describe('NotchController screen questions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks the vision endpoint for a marked hold and skips /act', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.transcriber.finalText = 'what does this error mean?'

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'what does this error mean?',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: true
      }
    ])
    expect(screen.begins).toBe(1)
    expect(screen.finishes).toBe(1)
    expect(screen.captures).toBe(0)

    const acting = context.presenter.payloads.find((payload) => payload.phase === 'acting')
    expect(acting?.message).toBe('Reading your screen…')
    expect(acting?.spoken).toBeNull()

    const result = context.presenter.payloads.at(-1)
    expect(result?.phase).toBe('result')
    expect(result?.message).toBe(context.actionClient.screenAnswer)
    expect(result?.spoken).toBe(context.actionClient.screenAnswer)
    expect(result?.transcript).toBe('what does this error mean?')
  })

  it('uses "What is this?" for a marked hold with no speech', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.transcriber.partialText = ''
    context.transcriber.finalText = ''

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'What is this?',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: true
      }
    ])
    expect(context.presenter.payloads.at(-1)?.transcript).toBe('What is this?')
  })

  it('asks with the default question when a circle is drawn without a ready mic', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.transcriber.startError = new Error('Speech recognition is not ready yet.')

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'What is this?',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: true
      }
    ])
    expect(context.presenter.payloads.at(-1)?.phase).toBe('result')
  })

  it('keeps a drawn circle when transcription fails and uses the default question', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.transcriber.throwOnFinal = new Error('model crashed')

    await completeTurn(context)

    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'What is this?',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: true
      }
    ])
    expect(context.presenter.payloads.at(-1)?.phase).toBe('result')
  })

  it('starts transcription without waiting for a slow screen capture', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    let releaseScreen: () => void = () => undefined
    screen.finishGate = new Promise<void>((resolve) => {
      releaseScreen = resolve
    })
    const context = setup({ screen })
    context.transcriber.finalText = 'what is this?'

    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.stop()
    context.controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(context.transcriber.finishCalls).toBe(1)
    expect(context.actionClient.screenInputs).toEqual([])

    releaseScreen()
    await vi.advanceTimersByTimeAsync(0)

    expect(context.actionClient.screenInputs).toHaveLength(1)
    expect(context.actionClient.screenInputs[0].question).toBe('what is this?')
  })

  it('captures and asks for an unmarked local screen question without calling /act', async () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })
    context.transcriber.finalText = 'what is this?'

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    expect(screen.captures).toBe(1)
    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'what is this?',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: false
      }
    ])
    expect(context.presenter.payloads.at(-1)?.phase).toBe('result')
  })

  it('leaves normal commands on the existing /act path with no screenshot', async () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual(['open notepad'])
    expect(context.actionClient.screenInputs).toEqual([])
    expect(screen.captures).toBe(0)
    expect(context.presenter.payloads.at(-1)?.message).toBe('Opening Notepad.')
  })

  it('follows up a planner look_at_screen directive with one vision request', async () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })
    context.transcriber.finalText = 'why is this happening'
    context.actionClient.response = {
      status: 'ok',
      action: 'look_at_screen',
      message: '',
      spokenResponse: null
    }

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual(['why is this happening'])
    expect(screen.captures).toBe(1)
    expect(context.actionClient.screenInputs).toEqual([
      {
        question: 'why is this happening',
        imageBase64: SCREEN_FRAME.imageBase64,
        marked: false
      }
    ])
    const result = context.presenter.payloads.at(-1)
    expect(result?.phase).toBe('result')
    expect(result?.message).toBe(context.actionClient.screenAnswer)
    expect(result?.spoken).toBe(context.actionClient.screenAnswer)
  })

  it('reports a marked capture error without calling /act or the vision endpoint', async () => {
    const screen = new FakeScreenService()
    screen.turn = {
      marked: true,
      frame: null,
      error: 'Screen capture timed out. Try again.'
    }
    const context = setup({ screen })

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    expect(context.actionClient.screenInputs).toEqual([])
    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('error')
    expect(state?.message).toContain('Screen capture timed out. Try again.')
  })

  it('reports a failed vision request as an error state', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.actionClient.screenError = new Error('Screen reading timed out. Try again.')

    await completeTurn(context)

    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('error')
    expect(state?.message).toBe('Screen reading timed out. Try again.')
  })

  it('reports an empty vision answer as an error', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })
    context.actionClient.screenAnswer = '   '

    await completeTurn(context)

    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('error')
    expect(state?.message).toMatch(/empty/i)
  })

  it('reports a failed no-mark capture as an error state', async () => {
    const screen = new FakeScreenService()
    screen.captureError = new Error('No screen source matched this monitor.')
    const context = setup({ screen })
    context.transcriber.finalText = 'what is this?'

    await completeTurn(context)

    expect(context.actionClient.transcripts).toEqual([])
    const state = context.presenter.payloads.at(-1)
    expect(state?.phase).toBe('error')
    expect(state?.message).toContain('No screen source matched this monitor.')
  })

  it('keeps the final screen answer visible for eight seconds', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })

    await completeTurn(context)

    await vi.advanceTimersByTimeAsync(7_999)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(context.presenter.hidden).toBe(1)
  })

  it('holds the notch open until the spoken answer finishes', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })

    await completeTurn(context)
    context.controller.setSpeechActive(true)

    await vi.advanceTimersByTimeAsync(8_000)
    expect(context.presenter.hidden).toBe(0)

    context.controller.setSpeechActive(false)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(context.presenter.hidden).toBe(1)
  })

  it('hides on the normal deadline when speech ends first', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })

    await completeTurn(context)
    context.controller.setSpeechActive(true)
    context.controller.setSpeechActive(false)

    await vi.advanceTimersByTimeAsync(7_999)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(context.presenter.hidden).toBe(1)
  })

  it('does not carry a pending speech hold into the next session', async () => {
    const screen = new FakeScreenService()
    screen.turn = { marked: true, frame: SCREEN_FRAME, error: null }
    const context = setup({ screen })

    await completeTurn(context)
    context.controller.setSpeechActive(true)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(context.presenter.hidden).toBe(0)

    context.controller.start()
    context.controller.setSpeechActive(false)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(context.presenter.hidden).toBe(0)
  })

  it('starts the overlay once and cancels it on Escape', () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.start()
    expect(screen.begins).toBe(1)

    context.controller.cancel()
    expect(screen.cancels).toBe(1)
    expect(screen.finishes).toBe(0)
  })

  it('finishes the screen turn only once per session', async () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.stop()
    context.controller.stop()
    context.controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(screen.finishes).toBe(1)
  })

  it('cancels the overlay when disposed', () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.start()
    context.controller.dispose()

    expect(screen.cancels).toBeGreaterThanOrEqual(1)
  })
})

describe('NotchController escape & cancel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a no-op when requestEscapeDismiss is called while idle and hidden', () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.requestEscapeDismiss()

    expect(context.presenter.dismisses).toBe(0)
    expect(context.presenter.hidden).toBe(0)
    expect(screen.cancels).toBe(0)
    expect(context.turnCompletes()).toBe(0)
  })

  it('cancels an active session, triggers dismissWithAnimation without immediate hide, ignores late responses, and hides after fallback timer', async () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })
    let resolveAct: ((value: ActionResponse) => void) | null = null
    context.actionClient.act = () =>
      new Promise<ActionResponse>((resolve) => {
        resolveAct = resolve
      })

    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.stop()
    context.controller.audioEnded()
    await vi.advanceTimersByTimeAsync(0)

    expect(context.presenter.payloads.at(-1)?.phase).toBe('acting')

    context.controller.requestEscapeDismiss()

    expect(context.controller.active).toBe(false)
    expect(context.presenter.dismisses).toBe(1)
    expect(context.presenter.hidden).toBe(0)
    expect(screen.cancels).toBe(1)
    expect(context.turnCompletes()).toBe(1)

    resolveAct!({
      status: 'ok',
      action: 'open_app',
      message: 'Late result',
      dryRun: true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(context.presenter.payloads.at(-1)?.phase).toBe('acting')

    await vi.advanceTimersByTimeAsync(259)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(context.presenter.hidden).toBe(1)
  })

  it('clears the escape fallback timer when dismissResults completes first', async () => {
    const context = setup()
    await completeTurn(context)

    context.controller.requestEscapeDismiss()
    expect(context.presenter.dismisses).toBe(1)
    expect(context.presenter.hidden).toBe(0)

    await vi.advanceTimersByTimeAsync(200)
    context.controller.dismissResults()
    expect(context.presenter.hidden).toBe(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(context.presenter.hidden).toBe(1)
  })

  it('falls back to presenter.hide() when dismissWithAnimation is not provided', () => {
    let hidden = 0
    const basicPresenter: NotchPresenter = {
      show: () => undefined,
      hide: () => {
        hidden += 1
      },
      startSession: () => undefined,
      stopSession: () => undefined,
      cancelSession: () => undefined,
      update: () => undefined,
      partial: () => undefined
    }

    const controller = new NotchController({
      presenter: basicPresenter,
      getTranscriber: () => new FakeTranscriber(),
      actionClient: new FakeActionClient(),
      paste: new FakePaste(),
      fileService: new FakeFileService()
    })

    controller.start()
    controller.requestEscapeDismiss()

    expect(hidden).toBe(1)
    controller.dispose()
  })

  it('clears a pending escape fallback timer when start() begins a new turn', async () => {
    const context = setup()
    await completeTurn(context)

    context.controller.requestEscapeDismiss()
    await vi.advanceTimersByTimeAsync(100)

    context.controller.start()
    await vi.advanceTimersByTimeAsync(300)

    expect(context.presenter.hidden).toBe(0)
    expect(context.controller.active).toBe(true)
    context.controller.dispose()
  })

  it('cancelActiveWork aborts active work and speech without calling hide()', () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.setSpeechActive(true)
    context.controller.cancelActiveWork()

    expect(context.controller.active).toBe(false)
    expect(context.transcriber.cancels).toBe(1)
    expect(screen.cancels).toBe(1)
    expect(context.presenter.speechStates.at(-1)).toBe(false)
    expect(context.presenter.hidden).toBe(0)
    expect(context.turnCompletes()).toBe(1)

    context.controller.dismissResults()
    expect(context.presenter.hidden).toBe(1)
  })

  it('dismissResults aborts an active session and hides', () => {
    const screen = new FakeScreenService()
    const context = setup({ screen })

    context.controller.start()
    context.controller.pushAudio(speech(1), 16_000)
    context.controller.stop()
    context.controller.dismissResults()

    expect(context.controller.active).toBe(false)
    expect(context.transcriber.cancels).toBe(1)
    expect(screen.cancels).toBe(1)
    expect(context.presenter.hidden).toBe(1)
    expect(context.turnCompletes()).toBe(1)
  })

  describe('text input', () => {
    it('startTyping stops an active session and cancels speech without hiding', () => {
      const screen = new FakeScreenService()
      const context = setup({ screen })

      context.controller.start()
      context.controller.pushAudio(speech(1), 16_000)
      context.controller.setSpeechActive(true)

      context.controller.startTyping()

      expect(context.controller.active).toBe(false)
      expect(context.transcriber.cancels).toBe(1)
      expect(screen.cancels).toBe(1)
      expect(context.presenter.speechStates.at(-1)).toBe(false)
      expect(context.presenter.stops).toBe(1)
      expect(context.presenter.hidden).toBe(0)
      expect(context.turnCompletes()).toBe(1)
    })

    it('submitText cancels active speech session, emits acting, calls actionClient.act, and emits result', async () => {
      const context = setup()
      context.controller.start()
      context.controller.pushAudio(speech(1), 16_000)

      context.actionClient.response = {
        status: 'ok',
        action: 'open_app',
        message: 'Opening Calculator.',
        dryRun: false,
        spokenResponse: 'Opening Calculator.'
      }

      await context.controller.submitText('open calculator')

      expect(context.controller.active).toBe(false)
      expect(context.transcriber.cancels).toBe(1)
      expect(context.actionClient.transcripts).toEqual(['open calculator'])

      const states = context.presenter.states
      const actingState = states.find((s) => s.phase === 'acting')
      expect(actingState).toEqual({
        phase: 'acting',
        transcript: 'open calculator',
        message: 'Working on it…'
      })

      const lastPayload = context.presenter.payloads.at(-1)
      expect(lastPayload?.phase).toBe('result')
      expect(lastPayload?.transcript).toBe('open calculator')
      expect(lastPayload?.message).toBe('Opening Calculator.')
      expect(lastPayload?.spoken).toBe('Opening Calculator.')
    })

    it('submitText handles actionClient error gracefully', async () => {
      const context = setup()
      context.actionClient.act = vi.fn().mockRejectedValue(new Error('Backend offline'))

      await context.controller.submitText('check status')

      const lastPayload = context.presenter.payloads.at(-1)
      expect(lastPayload?.phase).toBe('error')
      expect(lastPayload?.transcript).toBe('check status')
      expect(lastPayload?.message).toBe("That didn't work: Backend offline")
    })

    it('submitText handles paste if response action is type', async () => {
      const context = setup()
      context.actionClient.response = {
        status: 'ok',
        action: 'type',
        text: 'Hello typed world',
        message: 'Typing text.',
        dryRun: false
      }

      await context.controller.submitText('write hello')

      expect(context.paste.pasted).toEqual(['Hello typed world'])
      const lastPayload = context.presenter.payloads.at(-1)
      expect(lastPayload?.phase).toBe('result')
      expect(lastPayload?.message).toBe('Typing text.')
    })

    it('restores history item: clears active turn, shows presenter, sets transcript, emits result phase with prompt and reply', () => {
      const context = setup()
      context.controller.start()

      context.controller.restoreHistory('What is 2+2?', '4')

      expect(context.presenter.shown).toBeGreaterThan(0)
      const lastPayload = context.presenter.payloads.at(-1)
      expect(lastPayload?.phase).toBe('result')
      expect(lastPayload?.status).toBe('ok')
      expect(lastPayload?.transcript).toBe('What is 2+2?')
      expect(lastPayload?.message).toBe('4')
      expect(lastPayload?.spoken).toBeNull()
    })
  })
})
