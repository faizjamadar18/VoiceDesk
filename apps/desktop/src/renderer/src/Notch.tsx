import { useEffect, useRef, useState, type JSX } from 'react'
import {
  fileKind,
  fileKindBadge,
  formatFileModified,
  formatFileSize
} from '../../shared/file-display'
import { splitSpeechText } from '../../shared/speech'
import {
  HOTKEY_LABEL,
  hotkeyLabel,
  type HistoryRestorePayload,
  type NotchCard,
  type NotchDecision,
  type NotchDecisionAction,
  type NotchEmailComposeCard,
  type NotchEmailReplyCard,
  type NotchEmailListCard,
  type NotchCalendarCard,
  type NotchDriveCard,
  type NotchFileResult,
  type NotchPhase,
  type NotchWeatherCard,
  type SpeechChunkPayload,
  type SpeechStreamDonePayload,
  type SpeechStreamErrorPayload
} from '../../shared/types'
import { SpeechPlayer } from './voice/speech-player'
import { WebAudioSink } from './voice/web-audio-sink'
import { GmailComposeCard } from './components/GmailComposeCard'
import { EmailReplyCard } from './components/EmailReplyCard'
import { GoogleCalendarCard } from './components/GoogleCalendarCard'
import { GoogleDriveCard } from './components/GoogleDriveCard'
import { deriveCardFromDecisionOrMessage } from './card-derivation'
import VoiceOsNotch from './voiceos-notch/VoiceOsNotch'
import {
  VoiceOsAnswer,
  VoiceOsBottomHint,
  VoiceOsPrompt
} from './voiceos-notch/markdown'
import {
  createDismissAnimator,
  deriveNotchPresentation,
  type DismissAnimator
} from './voiceos-notch/notch-ui'
import {
  INITIAL_SOUND_GATE,
  playSound,
  preloadSounds,
  reduceSoundGate,
  type SoundGateState
} from './voiceos-notch/sound'

function formatAudioError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Microphone capture failed.'
}

const SPEECH_WATCHDOG_MIN_MS = 4_000
const SPEECH_WATCHDOG_MS_PER_WORD = 420
const SPEECH_WATCHDOG_PAD_MS = 5_000
/** How long to wait for the first streamed sentence before falling back. */
const SPEECH_STREAM_START_MS = 10_000
/** How long a gap between chunks is tolerated before giving up on the stream. */
const SPEECH_STREAM_STALL_MS = 15_000
/** Hard cap on waiting for the player to drain, in case onended never fires. */
const SPEECH_STREAM_DRAIN_MS = 60_000

let speechRun = 0
let speechQueue: string[] = []
const liveUtterances = new Set<SpeechSynthesisUtterance>()
let speechWatchdog: ReturnType<typeof setTimeout> | null = null
let preferredVoice: SpeechSynthesisVoice | null = null
let currentAudio: HTMLAudioElement | null = null
let currentAudioUrl: string | null = null

let speechPlayer: SpeechPlayer | null = null
let speechSink: WebAudioSink | null = null
let speechRequestSeq = 0
let activeSpeechStream: {
  requestId: string
  close: (cancelRemote: boolean) => void
} | null = null

function getSpeechPlayer(): SpeechPlayer {
  if (speechSink === null) speechSink = new WebAudioSink()
  if (speechPlayer === null) speechPlayer = new SpeechPlayer(speechSink)
  return speechPlayer
}

/** Cancel the current player and drop it; a later answer gets a fresh one. */
function resetSpeechPlayer(): void {
  speechPlayer?.cancel()
  speechPlayer = null
}

function createSpeechRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the counter below.
  }
  speechRequestSeq += 1
  return `speech-${Date.now()}-${speechRequestSeq}`
}

function sendCancelSpeechStream(requestId: string): void {
  try {
    if (window.kestrel?.cancelSpeechStream) window.kestrel.cancelSpeechStream(requestId)
    else window.api?.cancelSpeechStream(requestId)
  } catch {
    // The main process already tore the stream down.
  }
}

function notifySpeech(speaking: boolean): void {
  try {
    window.kestrel?.notifyNotchSpeech(speaking)
  } catch {
    // The notch is being torn down; the main process will time out safely.
  }
}

function clearSpeechWatchdog(): void {
  if (speechWatchdog !== null) clearTimeout(speechWatchdog)
  speechWatchdog = null
}

function cleanupAudio(): void {
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.currentTime = 0
    } catch {
      // ignore
    }
    currentAudio = null
  }
  if (currentAudioUrl) {
    try {
      URL.revokeObjectURL(currentAudioUrl)
    } catch {
      // ignore
    }
    currentAudioUrl = null
  }
}

function stopSpeech(): void {
  speechRun += 1
  speechQueue = []
  clearSpeechWatchdog()
  const stream = activeSpeechStream
  activeSpeechStream = null
  if (stream !== null) stream.close(true)
  resetSpeechPlayer()
  cleanupAudio()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }
  // Keep utterances referenced until cancel() returns; Chromium may still be
  // reading one while the queue is torn down.
  liveUtterances.clear()
  notifySpeech(false)
}

function cancelSpeech(onEnd?: () => void): void {
  stopSpeech()
  onEnd?.()
}

function playKokoroAudio(
  audioBytes: Uint8Array,
  run: number,
  onEnd?: () => void
): void {
  try {
    const bytes =
      audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes)
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    currentAudioUrl = url
    const audio = new Audio(url)
    currentAudio = audio

    let settled = false
    const settle = (): void => {
      if (settled || run !== speechRun) return
      settled = true
      clearSpeechWatchdog()
      cleanupAudio()
      notifySpeech(false)
      onEnd?.()
    }

    audio.onended = settle
    audio.onerror = () => {
      console.warn('[notch] Kokoro audio playback error')
      settle()
    }

    const byteLength = bytes.byteLength || bytes.length || 0
    const watchdogMs = Math.max(
      SPEECH_WATCHDOG_MIN_MS,
      (byteLength / 48000) * 1000 + SPEECH_WATCHDOG_PAD_MS
    )
    clearSpeechWatchdog()
    speechWatchdog = setTimeout(() => {
      speechWatchdog = null
      settle()
    }, watchdogMs)

    audio.play().catch((err) => {
      console.warn('[notch] Audio play failed:', err)
      settle()
    })
  } catch (err) {
    console.warn('[notch] Failed to initialize audio element for Kokoro:', err)
    if (run === speechRun) {
      notifySpeech(false)
      onEnd?.()
    }
  }
}

function fallbackSpeechSynthesis(
  text: string,
  run: number,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    notifySpeech(false)
    onEnd?.()
    return
  }

  const chunks = splitSpeechText(text)
  if (chunks.length === 0) {
    notifySpeech(false)
    onEnd?.()
    return
  }

  speechQueue = chunks
  let started = false

  const finish = (): void => {
    if (run !== speechRun) return
    speechRun += 1
    speechQueue = []
    liveUtterances.clear()
    clearSpeechWatchdog()
    notifySpeech(false)
    onEnd?.()
  }

  const speakNext = (): void => {
    if (run !== speechRun) return
    const chunk = speechQueue.shift()
    if (!chunk) {
      finish()
      return
    }

    const utterance = new SpeechSynthesisUtterance(chunk)
    liveUtterances.add(utterance)
    utterance.rate = 1.05
    utterance.pitch = 1.0

    // Pick one voice and keep it for every chunk so the answer never changes
    // voice halfway through. The list can be empty until voices finish loading.
    if (preferredVoice === null) {
      preferredVoice =
        window.speechSynthesis
          .getVoices()
          .find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Natural') ||
                v.name.includes('Aria') ||
                v.name.includes('Jenny') ||
                v.name.includes('David') ||
                v.name.includes('Zira') ||
                v.name.includes('Mark'))
          ) ?? null
    }
    utterance.voice = preferredVoice
    utterance.lang = preferredVoice?.lang ?? 'en-US'

    let settled = false
    const settle = (): void => {
      if (settled || run !== speechRun) return
      settled = true
      clearSpeechWatchdog()
      liveUtterances.delete(utterance)
      speakNext()
    }

    utterance.onend = settle
    utterance.onerror = settle

    const words = chunk.split(/\s+/).filter(Boolean).length
    const watchdogMs =
      Math.max(SPEECH_WATCHDOG_MIN_MS, words * SPEECH_WATCHDOG_MS_PER_WORD) +
      SPEECH_WATCHDOG_PAD_MS
    clearSpeechWatchdog()
    speechWatchdog = setTimeout(() => {
      speechWatchdog = null
      settle()
    }, watchdogMs)

    if (!started) {
      started = true
      notifySpeech(true)
      onStart?.()
    }

    try {
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('[notch] TTS failed', err)
      settle()
    }
  }

  speakNext()
}

/**
 * Full-file path: synthesize the whole answer with Kokoro and play it through
 * an HTMLAudioElement. Used when the streaming bridge is unavailable.
 */
function playFullSpeech(
  text: string,
  run: number,
  onReady?: () => void,
  onStart?: () => void,
  onEnd?: () => void
): void {
  let readyCalled = false
  const safeReady = (): void => {
    if (readyCalled) return
    readyCalled = true
    if (synthSafetyTimer) {
      clearTimeout(synthSafetyTimer)
      synthSafetyTimer = null
    }
    onReady?.()
  }

  let synthSafetyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    synthSafetyTimer = null
    safeReady()
  }, 6000)

  const synthFn =
    window.api?.synthesizeSpeech ?? window.kestrel?.synthesizeSpeech

  if (typeof synthFn === 'function') {
    synthFn(text)
      .then((audioBytes) => {
        if (run !== speechRun) {
          safeReady()
          return
        }
        if (audioBytes && audioBytes.length > 0) {
          safeReady()
          onStart?.()
          playKokoroAudio(audioBytes, run, onEnd)
        } else {
          safeReady()
          fallbackSpeechSynthesis(text, run, onStart, onEnd)
        }
      })
      .catch((err) => {
        console.warn('[notch] Kokoro synthesis failed, falling back to speech-synthesis:', err)
        if (run !== speechRun) {
          safeReady()
          return
        }
        safeReady()
        fallbackSpeechSynthesis(text, run, onStart, onEnd)
      })
  } else {
    safeReady()
    fallbackSpeechSynthesis(text, run, onStart, onEnd)
  }
}

interface SpeechStreamApi {
  startSpeechStream: (requestId: string, text: string) => void
  cancelSpeechStream: (requestId: string) => void
  onSpeechChunk: (callback: (payload: SpeechChunkPayload) => void) => () => void
  onSpeechStreamDone: (callback: (payload: SpeechStreamDonePayload) => void) => () => void
  onSpeechStreamError: (
    callback: (payload: SpeechStreamErrorPayload) => void
  ) => () => void
}

function getSpeechStreamApi(): SpeechStreamApi | null {
  const bridge = window.kestrel ?? window.api
  if (!bridge) return null
  const {
    startSpeechStream,
    cancelSpeechStream,
    onSpeechChunk,
    onSpeechStreamDone,
    onSpeechStreamError
  } = bridge
  if (
    typeof startSpeechStream !== 'function' ||
    typeof cancelSpeechStream !== 'function' ||
    typeof onSpeechChunk !== 'function' ||
    typeof onSpeechStreamDone !== 'function' ||
    typeof onSpeechStreamError !== 'function'
  ) {
    return null
  }
  return {
    startSpeechStream,
    cancelSpeechStream,
    onSpeechChunk,
    onSpeechStreamDone,
    onSpeechStreamError
  }
}

/**
 * Streaming path: main synthesizes one sentence at a time and sends each WAV
 * chunk here. The player schedules chunks back to back so the first sentence
 * plays while the rest are still being synthesized.
 */
function streamSpeech(
  text: string,
  run: number,
  onReady?: () => void,
  onStart?: () => void,
  onEnd?: () => void
): void {
  const api = getSpeechStreamApi()
  if (api === null) {
    playFullSpeech(text, run, onReady, onStart, onEnd)
    return
  }

  const requestId = createSpeechRequestId()
  const player = getSpeechPlayer()

  let ready = false
  let started = false
  let settled = false
  let doneSeen = false
  let chunkCount = 0
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let drainTimer: ReturnType<typeof setTimeout> | null = null
  let offChunk: () => void = () => undefined
  let offDone: () => void = () => undefined
  let offError: () => void = () => undefined

  const safeReady = (): void => {
    if (ready) return
    ready = true
    onReady?.()
  }

  const clearWatchdog = (): void => {
    if (watchdog !== null) clearTimeout(watchdog)
    watchdog = null
  }

  const clearStall = (): void => {
    if (stallTimer !== null) clearTimeout(stallTimer)
    stallTimer = null
  }

  const clearDrain = (): void => {
    if (drainTimer !== null) clearTimeout(drainTimer)
    drainTimer = null
  }

  const unsubscribe = (): void => {
    clearWatchdog()
    clearStall()
    clearDrain()
    offChunk()
    offDone()
    offError()
    if (activeSpeechStream?.requestId === requestId) activeSpeechStream = null
  }

  const complete = (): void => {
    if (settled || run !== speechRun) return
    settled = true
    unsubscribe()
    safeReady()
    notifySpeech(false)
    onEnd?.()
  }

  const fallToWebSpeech = (reason: string): void => {
    if (settled) return
    settled = true
    unsubscribe()
    if (run !== speechRun) return
    console.warn('[notch] speech stream failed, falling back to speech-synthesis:', reason)
    sendCancelSpeechStream(requestId)
    resetSpeechPlayer()
    safeReady()
    fallbackSpeechSynthesis(text, run, onStart, onEnd)
  }

  const finishPlayback = (): void => {
    // Everything has been handed to the player; wait for it to drain.
    const drain = (): void => {
      clearDrain()
      complete()
    }
    drainTimer = setTimeout(drain, SPEECH_STREAM_DRAIN_MS)
    void player.finished().then(drain, drain)
  }

  const onStall = (): void => {
    stallTimer = null
    if (settled) return
    console.warn('[notch] speech stream stalled, ending after the audio already received')
    doneSeen = true
    unsubscribe()
    // Let the buffered tail play out, then end normally. complete() is idempotent.
    finishPlayback()
  }

  const armStall = (): void => {
    if (stallTimer !== null) clearTimeout(stallTimer)
    stallTimer = setTimeout(onStall, SPEECH_STREAM_STALL_MS)
  }

  offChunk = api.onSpeechChunk((payload) => {
    if (settled || doneSeen || run !== speechRun || payload.requestId !== requestId) return
    clearWatchdog()
    armStall()
    safeReady()
    if (!started) {
      started = true
      notifySpeech(true)
      onStart?.()
    }
    chunkCount += 1
    player.enqueue(payload.audio)
  })

  offDone = api.onSpeechStreamDone((payload) => {
    if (settled || doneSeen || run !== speechRun || payload.requestId !== requestId) return
    clearWatchdog()
    clearStall()
    doneSeen = true
    if (chunkCount === 0) {
      complete()
      return
    }
    finishPlayback()
  })

  offError = api.onSpeechStreamError((payload) => {
    if (settled || run !== speechRun || payload.requestId !== requestId) return
    fallToWebSpeech(payload.message || 'speech stream error')
  })

  activeSpeechStream = {
    requestId,
    close: (cancelRemote: boolean): void => {
      unsubscribe()
      if (cancelRemote) sendCancelSpeechStream(requestId)
    }
  }

  watchdog = setTimeout(() => {
    watchdog = null
    fallToWebSpeech(`no speech chunk within ${SPEECH_STREAM_START_MS / 1000}s`)
  }, SPEECH_STREAM_START_MS)

  try {
    api.startSpeechStream(requestId, text)
  } catch (error) {
    fallToWebSpeech(error instanceof Error ? error.message : 'speech stream failed')
  }
}

/**
 * Speak the answer. Streams Kokoro audio sentence by sentence when the bridge
 * supports it, falls back to a full-file synthesis, then to the Web Speech API.
 */
function playSpeech(
  text: string | null | undefined,
  onReady?: () => void,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (!text || typeof window === 'undefined') {
    onReady?.()
    return
  }
  const trimmed = text.trim()
  if (!trimmed) {
    onReady?.()
    return
  }

  stopSpeech()
  const run = ++speechRun

  notifySpeech(true)
  streamSpeech(trimmed, run, onReady, onStart, onEnd)
}

/** Mirrors MAX_SESSION_SECONDS in the main process (notch-controller.ts). */
const NOTCH_RECORDING_CAP_SECONDS = 120
/** VoiceOS sounds its "running out" alert during the final minute of the cap. */
const NOTCH_WARNING_THRESHOLD_SECONDS = 60
/** Longest the answer scroll region grows before it scrolls internally. */
export const NOTCH_ANSWER_MAX_HEIGHT_PX = 340

export interface NotchHistoryRestoreState {
  isDismissing: boolean
  isEditingText: boolean
  typedDraft: string
  isSpeaking: boolean
  isSynthesizing: boolean
  results: NotchFileResult[] | null
  resultsLabel: string | null
  decision: NotchDecision | null
  card: NotchCard | null
  rowError: string | null
  openingId: number | null
  transcript: string
  message: string | null
  phase: NotchPhase
}

export function applyNotchHistoryRestore(
  payload: HistoryRestorePayload
): NotchHistoryRestoreState {
  return {
    isDismissing: false,
    isEditingText: false,
    typedDraft: '',
    isSpeaking: false,
    isSynthesizing: false,
    results: null,
    resultsLabel: null,
    decision: null,
    card: null,
    rowError: null,
    openingId: null,
    transcript: payload.prompt ?? '',
    message: payload.reply ?? '',
    phase: 'result'
  }
}

export function computeNotchRegion(
  surface: { width: number; height: number },
  windowWidth: number
): { left: number; top: number; width: number; height: number } | null {
  if (surface.width <= 0 || surface.height <= 0) return null
  const left = Math.max(0, (windowWidth - surface.width) / 2)
  return {
    left,
    top: 0,
    width: surface.width,
    height: surface.height
  }
}

/**
 * Renderer side of the notch. All of Kestrel's audio capture, IPC and speech
 * logic lives here unchanged; only the chrome is VoiceOS's. `VoiceOsNotch` owns
 * the silhouette, orb, waveform, band and transitions, and this file maps
 * Kestrel's `NotchPhase` onto the VoiceOS notch modes and drops Kestrel's
 * content into the expanded body.
 */
export function deriveShowBottomHint(params: {
  isEditingText: boolean
  phase: string
  showCards: boolean
  showAnswer: boolean
  results: unknown
  weather: unknown
  emailList: unknown
  hasPreviewModel: boolean
}): boolean {
  return (
    !params.isEditingText &&
    params.phase !== 'listening' &&
    params.showCards &&
    (params.showAnswer ||
      params.results !== null ||
      params.weather !== null ||
      params.emailList !== null ||
      params.hasPreviewModel)
  )
}

export interface NotchResolvedCards {
  emailCompose: NotchEmailComposeCard | null
  emailReply: NotchEmailReplyCard | null
  calendarEvent: NotchCalendarCard | null
  driveCard: NotchDriveCard | null
  hasPreviewModel: boolean
}

export function deriveNotchCards(
  card: NotchCard | null,
  derivedCards: ReturnType<typeof deriveCardFromDecisionOrMessage>
): NotchResolvedCards {
  const emailCompose =
    card?.kind === 'email_compose'
      ? (card as NotchEmailComposeCard)
      : derivedCards.emailComposeCard
  const emailReply =
    card?.kind === 'email_reply' ? (card as NotchEmailReplyCard) : null
  const calendarEvent =
    card?.kind === 'calendar_event'
      ? (card as NotchCalendarCard)
      : derivedCards.calendarCard
  const driveCard =
    card?.kind === 'drive_file'
      ? (card as NotchDriveCard)
      : derivedCards.driveCard
  const hasPreviewModel =
    emailCompose !== null ||
    emailReply !== null ||
    calendarEvent !== null ||
    driveCard !== null

  return { emailCompose, emailReply, calendarEvent, driveCard, hasPreviewModel }
}

export default function Notch(): JSX.Element {
  const [phase, setPhase] = useState<NotchPhase>('listening')
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [card, setCard] = useState<NotchCard | null>(null)
  const [results, setResults] = useState<NotchFileResult[] | null>(null)
  const [resultsLabel, setResultsLabel] = useState<string | null>(null)
  const [decision, setDecision] = useState<NotchDecision | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)
  const [hotkeyKeys, setHotkeyKeys] = useState<string[]>(() => [...HOTKEY_LABEL])
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [surface, setSurface] = useState({ width: 0, height: 0 })
  const [isEditingText, setIsEditingText] = useState(false)
  const [typedDraft, setTypedDraft] = useState('')
  const isEditingTextRef = useRef(false)
  isEditingTextRef.current = isEditingText
  const stopLocalMediaRef = useRef<(() => void) | null>(null)
  const cancelEditRef = useRef<(() => void) | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sinkRef = useRef<GainNode | null>(null)
  const sessionRef = useRef<number | null>(null)
  const dismissAnimatorRef = useRef<DismissAnimator | null>(null)
  /**
   * VoiceOS drives the waveform and voice pulse from a ref so a changing mic
   * level never re-renders the notch (bundle ~201256, ~253784). We keep the
   * same shape: the audio callback writes here, the orb reads it each frame.
   */
  const audioLevelRef = useRef(0)
  const soundGateRef = useRef<SoundGateState>(INITIAL_SOUND_GATE)
  const micAudioSentRef = useRef(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningPlayedRef = useRef(false)
  const errorSoundRef = useRef(false)
  const completionSoundRef = useRef(false)

  useEffect(() => {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }

    const acquire = async (): Promise<MediaStream> => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: audioConstraints
      })
      streamRef.current = stream
      return stream
    }

    const releaseStream = (): void => {
      const stream = streamRef.current
      streamRef.current = null
      for (const track of stream?.getTracks() ?? []) track.stop()
    }

    const getContext = async (): Promise<AudioContext> => {
      let context = contextRef.current
      if (context === null || context.state === 'closed') {
        context = new AudioContext()
        contextRef.current = context
      }
      if (context.state === 'suspended') await context.resume()
      return context
    }

    /* ---- Sound gate (bundle 246798-246824): arm on the recording edge, play
       the open chirp on the first real mic frame, the close chirp on stop. ---- */
    const armSoundGate = (): void => {
      soundGateRef.current = reduceSoundGate(soundGateRef.current, {
        type: 'recording-state',
        ownedElsewhere: false,
        isRecording: true,
        skipSound: false,
        soundEligible: true
      }).state
    }

    const endSoundGate = (): void => {
      const outcome = reduceSoundGate(soundGateRef.current, {
        type: 'recording-state',
        ownedElsewhere: false,
        isRecording: false,
        skipSound: false,
        soundEligible: true
      })
      soundGateRef.current = outcome.state
      if (outcome.play === 'toggleOff') playSound('toggleOff')
    }

    /* ---- Recording time limit: VoiceOS shows a countdown and sounds the
       `alert` chirp during the final minute before the cap (bundle
       263742-263833, 267966). The cap itself lives in the main process; the
       renderer mirrors it to drive the same warning affordance. ---- */
    const clearCountdown = (): void => {
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      warningPlayedRef.current = false
      setRemainingSeconds(null)
    }

    const startCountdown = (): void => {
      clearCountdown()
      const deadline = Date.now() + NOTCH_RECORDING_CAP_SECONDS * 1000
      const tick = (): void => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        if (remaining <= NOTCH_WARNING_THRESHOLD_SECONDS) {
          setRemainingSeconds(remaining)
          if (remaining > 0 && !warningPlayedRef.current) {
            warningPlayedRef.current = true
            playSound('alert')
          }
        } else {
          setRemainingSeconds(null)
        }
        if (remaining <= 0 && countdownRef.current !== null) {
          clearInterval(countdownRef.current)
          countdownRef.current = null
        }
      }
      tick()
      countdownRef.current = setInterval(tick, 1000)
    }

    const resetContent = (): void => {
      setTranscript('')
      setMessage(null)
      setCard(null)
      setResults(null)
      setResultsLabel(null)
      setDecision(null)
      setRowError(null)
      setOpeningId(null)
      setIsSynthesizing(false)
    }

    const stopCaptureResources = (): void => {
      sessionRef.current = null
      audioLevelRef.current = 0
      clearCountdown()
      endSoundGate()

      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
        processorRef.current = null
      }
      sourceRef.current?.disconnect()
      sourceRef.current = null
      sinkRef.current?.disconnect()
      sinkRef.current = null

      releaseStream()
    }

    const stopLocalMedia = (): void => {
      cancelSpeech(() => setIsSpeaking(false))
      setIsSynthesizing(false)
      stopCaptureResources()
    }
    stopLocalMediaRef.current = stopLocalMedia

    const teardown = (sendEnd: boolean): void => {
      stopLocalMedia()

      if (sendEnd) window.kestrel?.sendNotchAudioEnd()
    }

    const startCapture = async (sessionId: number): Promise<void> => {
      try {
        const stream = await acquire()
        if (sessionRef.current !== sessionId) {
          for (const track of stream.getTracks()) track.stop()
          if (streamRef.current === stream) streamRef.current = null
          return
        }

        const context = await getContext()
        if (sessionRef.current !== sessionId) {
          releaseStream()
          return
        }

        const source = context.createMediaStreamSource(stream)
        const processor = context.createScriptProcessor(2048, 1, 1)
        const sink = context.createGain()
        sink.gain.value = 0

        processor.onaudioprocess = (event): void => {
          if (sessionRef.current !== sessionId) return
          const channel = event.inputBuffer.getChannelData(0)

          let sum = 0
          for (let i = 0; i < channel.length; i += 4) {
            sum += channel[i] * channel[i]
          }
          const rms = Math.sqrt(sum / (channel.length / 4))
          audioLevelRef.current = Math.min(1, rms * 6)

          // First mic frame after the recording edge: play the open chirp.
          if (!micAudioSentRef.current) {
            micAudioSentRef.current = true
            const gate = reduceSoundGate(soundGateRef.current, { type: 'mic-audio' })
            soundGateRef.current = gate.state
            if (gate.play === 'toggleOn') playSound('toggleOn')
          }

          window.kestrel.sendNotchAudio(new Float32Array(channel), context.sampleRate)
        }

        source.connect(processor)
        processor.connect(sink)
        sink.connect(context.destination)

        sourceRef.current = source
        processorRef.current = processor
        sinkRef.current = sink
      } catch (error) {
        releaseStream()
        if (sessionRef.current === sessionId) {
          window.kestrel.sendNotchAudioError(formatAudioError(error))
        }
      }
    }

    void preloadSounds()

    void (async () => {
      try {
        await getContext()
        const probe = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioConstraints
        })
        for (const track of probe.getTracks()) track.stop()
      } catch (error) {
        console.warn('[notch] mic check failed', error)
      }
    })()

    let disposed = false
    const api = window.kestrel
    const dismissAnimator = createDismissAnimator({
      onStart: () => {
        setIsEditingText(false)
        setTypedDraft('')
        window.kestrel?.setNotchFocusable(false)
        stopLocalMedia()
        window.kestrel?.cancelNotchActive()
        setIsDismissing(true)
      },
      onFinish: () => {
        setIsDismissing(false)
        resetContent()
        window.kestrel?.dismissNotchResult()
      }
    })
    dismissAnimatorRef.current = dismissAnimator

    const applyHotkey = (hotkey: string | undefined): void => {
      if (!hotkey) return
      const labels = hotkeyLabel(hotkey).filter(Boolean)
      if (labels.length > 0) setHotkeyKeys(labels)
    }

    void api
      ?.getSettings?.()
      ?.then((loaded) => {
        if (!disposed) applyHotkey(loaded?.hotkey)
      })
      .catch(() => undefined)

    const offSettings = api?.onSettingsChanged?.((next) => {
      applyHotkey(next?.hotkey)
    })

    const offStart = api.onNotchStart(({ sessionId }) => {
      dismissAnimator.cancel()
      setIsDismissing(false)
      setIsEditingText(false)
      setTypedDraft('')
      window.kestrel?.setNotchFocusable(false)
      teardown(false)
      sessionRef.current = sessionId
      setSessionKey((key) => key + 1)
      setPhase('listening')
      resetContent()
      micAudioSentRef.current = false
      errorSoundRef.current = false
      completionSoundRef.current = false
      armSoundGate()
      startCountdown()
      void startCapture(sessionId)
    })

    const offStop = api.onNotchStop(() => {
      teardown(true)
    })

    const offCancel = api.onNotchCancel(() => {
      teardown(false)
      if (!dismissAnimator.isActive()) {
        resetContent()
      }
    })

    const offState = api.onNotchState((state) => {
      if (
        state.phase === 'result' ||
        state.phase === 'error' ||
        state.phase === 'acting' ||
        state.phase === 'processing'
      ) {
        dismissAnimator.cancel()
        setIsDismissing(false)
        setIsEditingText(false)
        setTypedDraft('')
        window.kestrel?.setNotchFocusable(false)
      }
      setPhase(state.phase)
      if (state.transcript !== null) setTranscript(state.transcript)
      setMessage(state.message)
      setDecision(state.decision ?? null)
      if (state.card !== undefined) setCard(state.card ?? null)
      if (state.results !== undefined) {
        setResults(state.results ?? null)
        setResultsLabel(state.resultsLabel ?? null)
        setRowError(null)
        setOpeningId(null)
      }
      if (state.spoken) {
        setIsSynthesizing(true)
        playSpeech(
          state.spoken,
          () => setIsSynthesizing(false),
          () => setIsSpeaking(true),
          () => setIsSpeaking(false)
        )
        // A spoken answer already signals completion; suppress the muted cue.
        completionSoundRef.current = true
      } else {
        setIsSynthesizing(false)
      }
      if (state.phase === 'result' && !completionSoundRef.current) {
        completionSoundRef.current = true
        // VoiceOS plays `manusComplete` only when the agent voice is silent
        // (bundle 269040). With no spoken answer, the chirp is the cue.
        playSound('manusComplete')
      }
      if (state.phase === 'error' && !errorSoundRef.current) {
        errorSoundRef.current = true
        completionSoundRef.current = true
        playSound('error')
      }
    })

    const offPartial = api.onNotchPartial((text) => {
      setTranscript(text)
    })

    const offHide = api.onNotchHide(() => {
      dismissAnimator.cancel()
      setIsDismissing(false)
      setIsEditingText(false)
      setTypedDraft('')
      window.kestrel?.setNotchFocusable(false)
      cancelSpeech(() => setIsSpeaking(false))
      setIsSynthesizing(false)
      clearCountdown()
      endSoundGate()
      setCard(null)
      setResults(null)
      setResultsLabel(null)
      setDecision(null)
      setRowError(null)
      setOpeningId(null)
    })

    const offDismiss = api.onNotchDismiss(() => {
      setIsEditingText(false)
      setTypedDraft('')
      window.kestrel?.setNotchFocusable(false)
      dismissAnimator.start()
    })

    const offRestore = api?.onNotchRestoreHistory?.((payload) => {
      dismissAnimator.cancel()
      window.kestrel?.setNotchFocusable(false)
      stopLocalMedia()

      const restored = applyNotchHistoryRestore(payload)
      setIsDismissing(restored.isDismissing)
      setIsEditingText(restored.isEditingText)
      setTypedDraft(restored.typedDraft)
      setIsSpeaking(restored.isSpeaking)
      setIsSynthesizing(restored.isSynthesizing)

      setResults(restored.results)
      setResultsLabel(restored.resultsLabel)
      setDecision(restored.decision)
      setCard(restored.card)
      setRowError(restored.rowError)
      setOpeningId(restored.openingId)

      setTranscript(restored.transcript)
      setMessage(restored.message)
      setPhase(restored.phase)

      completionSoundRef.current = true
      errorSoundRef.current = false
    })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.repeat) return
      if (isEditingTextRef.current) {
        event.preventDefault()
        event.stopPropagation()
        cancelEditRef.current?.()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      dismissAnimator.start()
    }
    window.addEventListener('keydown', handleKeyDown, true)

    api.notifyNotchReady()

    return () => {
      disposed = true
      stopLocalMediaRef.current = null
      window.removeEventListener('keydown', handleKeyDown, true)
      offSettings?.()
      offDismiss()
      dismissAnimator.cancel()
      dismissAnimatorRef.current = null
      offStart()
      offStop()
      offCancel()
      offState()
      offPartial()
      offHide()
      offRestore?.()
      teardown(false)
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      const context = contextRef.current
      contextRef.current = null
      if (context) void context.close().catch(() => undefined)
    }
  }, [])

  // Report the rendered surface rectangle so the main process can keep the
  // window click-through everywhere except the notch itself.
  useEffect(() => {
    const region = computeNotchRegion(surface, window.innerWidth)
    window.kestrel?.setNotchRegion(region)
  }, [surface])

  const startDismissAnimation = (): void => {
    dismissAnimatorRef.current?.start()
  }

  const decide = (action: NotchDecisionAction): void => {
    if (decision?.busy) return
    window.kestrel?.decideNotch(action)
  }

  const openResult = async (id: number): Promise<void> => {
    if (openingId !== null) return
    setOpeningId(id)
    setRowError(null)
    try {
      const outcome = await window.kestrel.openNotchResult(id)
      if (!outcome.ok) {
        setRowError(outcome.message ?? "Couldn't open that file.")
        return
      }
      setResults(null)
      setResultsLabel(null)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setRowError(`Couldn't open that file: ${detail}`)
    } finally {
      setOpeningId(null)
    }
  }

  const handleStartEdit = (): void => {
    stopLocalMediaRef.current?.()
    window.kestrel?.startNotchTyping()
    window.kestrel?.setNotchFocusable(true)
    setTypedDraft(transcript)
    setIsEditingText(true)
  }

  const handleStartTypingFromIdle = (): void => {
    stopLocalMediaRef.current?.()
    window.kestrel?.startNotchTyping()
    window.kestrel?.setNotchFocusable(true)
    setTranscript('')
    setTypedDraft('')
    setIsEditingText(true)
  }

  const handleSubmitText = (newText: string): void => {
    window.kestrel?.setNotchFocusable(false)
    setIsEditingText(false)
    setTypedDraft('')
    setTranscript(newText)
    setPhase('acting')
    setMessage(null)
    setCard(null)
    setResults(null)
    setResultsLabel(null)
    setDecision(null)
    window.kestrel?.submitNotchText(newText)
  }

  const handleCancelEdit = (): void => {
    window.kestrel?.setNotchFocusable(false)
    setIsEditingText(false)
    setTypedDraft('')
    if (!transcript.trim()) {
      startDismissAnimation()
    }
  }

  cancelEditRef.current = handleCancelEdit

  const answer = message?.trim() ?? ''
  const hasWeatherCard = card?.kind === 'weather'
  const weather = hasWeatherCard ? (card as NotchWeatherCard) : null
  const emailList = card?.kind === 'email_list' ? (card as NotchEmailListCard) : null

  const derivedCards = deriveCardFromDecisionOrMessage({
    message,
    decision,
    transcript
  })
  const { emailCompose, emailReply, calendarEvent, driveCard, hasPreviewModel } =
    deriveNotchCards(card, derivedCards)

  const showCards = !isSynthesizing && (phase === 'result' || phase === 'error')
  const showAnswer = showCards && answer.length > 0 && !hasPreviewModel
  const hasTranscript = transcript.trim().length > 0
  const hasExpandedContent =
    isEditingText ||
    hasTranscript ||
    showAnswer ||
    (showCards &&
      (results !== null ||
        decision !== null ||
        weather !== null ||
        emailList !== null ||
        hasPreviewModel))
  const showBottomHint = deriveShowBottomHint({
    isEditingText,
    phase,
    showCards,
    showAnswer,
    results,
    weather,
    emailList,
    hasPreviewModel
  })

  const presentation = deriveNotchPresentation({
    phase: isEditingText ? 'result' : phase,
    isSynthesizing: isEditingText ? false : isSynthesizing,
    isSpeaking: isEditingText ? false : isSpeaking,
    hasExpandedContent,
    isDismissing
  })

  return (
    <VoiceOsNotch
      key={sessionKey}
      mode={presentation.mode}
      expanded={presentation.expanded}
      volumeRef={audioLevelRef}
      speaking={isSpeaking}
      showCancel={presentation.showCancel}
      onCancel={startDismissAnimation}
      onActivate={handleStartTypingFromIdle}
      remainingSeconds={remainingSeconds}
      onGeometryChange={setSurface}
    >
      {(hasTranscript || isEditingText) && (
        <VoiceOsPrompt
          text={isEditingText ? typedDraft : transcript}
          isEditing={isEditingText}
          onStartEdit={handleStartEdit}
          onSubmitEdit={handleSubmitText}
          onCancelEdit={handleCancelEdit}
        />
      )}

      {showAnswer && (
        <VoiceOsAnswer
          text={answer}
          maxHeight={NOTCH_ANSWER_MAX_HEIGHT_PX}
          isError={phase === 'error'}
        />
      )}

      {showCards && weather && (
        <div className="kestrel-weather-card">
          <div className="kestrel-weather-row">
            <div className="kestrel-weather-left">
              <span className="kestrel-weather-loc">{weather.location}</span>
              <div className="kestrel-weather-temps">
                <span className="kestrel-weather-temp">{weather.temperature}</span>
                <span className="kestrel-weather-low">{weather.low}</span>
              </div>
            </div>
            <div className="kestrel-weather-right">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="5" fill="#f59e0b" />
                <path
                  d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="kestrel-weather-cond">{weather.condition}</span>
            </div>
          </div>
        </div>
      )}

      {showCards && emailList && (
        <div className="kestrel-email-list">
          <div className="kestrel-email-list-title">{emailList.title}</div>
          <ul className="kestrel-email-list-rows">
            {emailList.rows.map((row, index) => (
              <li key={index} className="kestrel-email-row">
                <div className="kestrel-email-row-text">
                  <span className="kestrel-email-row-title">{row.title}</span>
                  <span className="kestrel-email-row-subtitle">{row.subtitle}</span>
                </div>
                <span className="kestrel-email-row-trailing">{row.trailing}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showCards && emailReply && (
        <EmailReplyCard
          card={emailReply}
          onCopy={(text) => window.kestrel?.copyToClipboard(text)}
        />
      )}

      {showCards && emailCompose && (
        <GmailComposeCard
          card={emailCompose}
          busy={decision?.busy}
          onSend={() => decide('confirm')}
          onDiscard={() => decide('cancel')}
          onCopy={(text) => window.kestrel?.copyToClipboard(text)}
        />
      )}

      {showCards && calendarEvent && (
        <GoogleCalendarCard
          card={calendarEvent}
          busy={decision?.busy}
          onConfirm={() => decide('confirm')}
          onDiscard={() => decide('cancel')}
        />
      )}

      {showCards && driveCard && (
        <GoogleDriveCard
          card={driveCard}
          busy={decision?.busy}
          onConfirm={() => decide('confirm')}
          onDiscard={() => decide('cancel')}
        />
      )}

      {showCards && results !== null && (
        <div className="kestrel-file-results">
          <span className="kestrel-file-results-label">
            {resultsLabel ?? `Files · ${results.length} items`}
          </span>
          <ul className="kestrel-file-list">
            {results.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className="kestrel-file-row"
                  disabled={openingId !== null}
                  onClick={() => void openResult(file.id)}
                >
                  <span className={`kestrel-file-badge is-${fileKind(file.name)}`}>
                    {fileKindBadge(file.name)}
                  </span>
                  <span className="kestrel-file-name">{file.name}</span>
                  <span className="kestrel-file-meta">
                    {formatFileSize(file.sizeBytes)}
                    {file.modified ? ` · ${formatFileModified(file.modified)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rowError && <p className="kestrel-file-error">{rowError}</p>}
        </div>
      )}

      {showCards && decision !== null && !hasPreviewModel && (
        <div className="kestrel-decision">
          <p className="kestrel-decision-target">
            {decision.target || 'Action requires approval'}
          </p>
          <div className="kestrel-decision-actions">
            <button
              type="button"
              className="kestrel-decision-btn is-confirm"
              disabled={decision.busy}
              onClick={() => decide(decision.kind === 'confirm' ? 'confirm' : 'undo')}
            >
              {decision.kind === 'confirm' ? 'Confirm' : 'Undo'}
            </button>
            <button
              type="button"
              className="kestrel-decision-btn is-cancel"
              disabled={decision.busy}
              onClick={() => decide('cancel')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showBottomHint && <VoiceOsBottomHint keys={hotkeyKeys} />}
    </VoiceOsNotch>
  )
}
