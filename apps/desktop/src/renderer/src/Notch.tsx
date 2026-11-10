import { useEffect, useRef, useState, type JSX } from 'react'
import {
  fileKind,
  fileKindBadge,
  formatFileModified,
  formatFileSize
} from '../../shared/file-display'
import { splitSpeechText } from '../../shared/speech'
import type {
  NotchCard,
  NotchDecision,
  NotchDecisionAction,
  NotchFileResult,
  NotchPhase,
  NotchWeatherCard
} from '../../shared/types'
import VoiceOsNotch, { type VoiceOsNotchMode } from './voiceos-notch/VoiceOsNotch'
import { VoiceOsAnswer, VoiceOsPrompt } from './voiceos-notch/markdown'
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

let speechRun = 0
let speechQueue: string[] = []
const liveUtterances = new Set<SpeechSynthesisUtterance>()
let speechWatchdog: ReturnType<typeof setTimeout> | null = null
let preferredVoice: SpeechSynthesisVoice | null = null

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

function stopSpeech(): void {
  speechRun += 1
  speechQueue = []
  clearSpeechWatchdog()
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

/**
 * Speak the whole answer as a short chain of sentence chunks. Keeping one
 * utterance alive at a time avoids Chromium's long-utterance cutoff, and the
 * main process waits for `notifyNotchSpeech(false)` before hiding the notch.
 */
function playSpeech(
  text: string | null | undefined,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const chunks = splitSpeechText(text)
  if (chunks.length === 0) return

  stopSpeech()
  const run = ++speechRun
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

/** Mirrors MAX_SESSION_SECONDS in the main process (notch-controller.ts). */
const NOTCH_RECORDING_CAP_SECONDS = 120
/** VoiceOS sounds its "running out" alert during the final minute of the cap. */
const NOTCH_WARNING_THRESHOLD_SECONDS = 60
/** Longest the answer scroll region grows before it scrolls internally. */
const NOTCH_ANSWER_MAX_HEIGHT_PX = 360

/**
 * Renderer side of the notch. All of Kestrel's audio capture, IPC and speech
 * logic lives here unchanged; only the chrome is VoiceOS's. `VoiceOsNotch` owns
 * the silhouette, orb, waveform, band and transitions, and this file maps
 * Kestrel's `NotchPhase` onto the VoiceOS notch modes and drops Kestrel's
 * content into the expanded body.
 */
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
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [surface, setSurface] = useState({ width: 0, height: 0 })

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sinkRef = useRef<GainNode | null>(null)
  const sessionRef = useRef<number | null>(null)
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
    }

    const teardown = (sendEnd: boolean): void => {
      sessionRef.current = null
      cancelSpeech(() => setIsSpeaking(false))
      setIsSpeaking(false)
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

    const api = window.kestrel
    const offStart = api.onNotchStart(({ sessionId }) => {
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
      resetContent()
    })

    const offState = api.onNotchState((state) => {
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
        playSpeech(
          state.spoken,
          () => setIsSpeaking(true),
          () => setIsSpeaking(false)
        )
        // A spoken answer already signals completion; suppress the muted cue.
        completionSoundRef.current = true
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
      cancelSpeech(() => setIsSpeaking(false))
      setIsSpeaking(false)
      clearCountdown()
      endSoundGate()
      setCard(null)
      setResults(null)
      setResultsLabel(null)
      setDecision(null)
      setRowError(null)
      setOpeningId(null)
    })

    api.notifyNotchReady()

    return () => {
      offStart()
      offStop()
      offCancel()
      offState()
      offPartial()
      offHide()
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
    if (surface.width <= 0 || surface.height <= 0) {
      window.kestrel?.setNotchRegion(null)
      return
    }
    const left = Math.max(0, (window.innerWidth - surface.width) / 2)
    window.kestrel?.setNotchRegion({
      left,
      top: 0,
      width: surface.width,
      height: surface.height
    })
  }, [surface])

  const dismissNotch = (): void => {
    cancelSpeech(() => setIsSpeaking(false))
    setIsSpeaking(false)
    window.kestrel?.dismissNotchResult()
    setCard(null)
    setResults(null)
    setResultsLabel(null)
    setDecision(null)
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

  const isWorking = phase === 'processing' || phase === 'acting'
  const answer = message?.trim() ?? ''
  const showAnswer = (phase === 'result' || phase === 'error') && answer.length > 0
  const hasWeatherCard = card?.kind === 'weather'
  const weather = hasWeatherCard ? (card as NotchWeatherCard) : null
  const hasExpandedContent =
    showAnswer || results !== null || decision !== null || weather !== null

  const mode: VoiceOsNotchMode =
    phase === 'listening'
      ? 'listening'
      : isWorking
        ? 'thinking'
        : phase === 'error'
          ? 'error'
          : 'responding'

  return (
    <VoiceOsNotch
      key={sessionKey}
      mode={mode}
      expanded={hasExpandedContent}
      volumeRef={audioLevelRef}
      speaking={isSpeaking}
      showCancel={hasExpandedContent || isWorking}
      onCancel={dismissNotch}
      remainingSeconds={remainingSeconds}
      onGeometryChange={setSurface}
    >
      {transcript.trim().length > 0 && <VoiceOsPrompt text={transcript} />}

      {showAnswer && (
        <VoiceOsAnswer text={answer} maxHeight={NOTCH_ANSWER_MAX_HEIGHT_PX} />
      )}

      {weather && (
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

      {results !== null && (
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

      {decision !== null && (
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
    </VoiceOsNotch>
  )
}
