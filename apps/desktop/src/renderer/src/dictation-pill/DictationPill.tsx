import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PillStatePayload } from '../../../shared/types'

const NUM_BARS = 7
const BAR_MULTIPLIERS = [0.45, 0.75, 1.0, 0.85, 0.65, 0.9, 0.5]

export interface DictationPillProps {
  initialState?: PillStatePayload
}

export function DictationPill({ initialState }: DictationPillProps): React.JSX.Element {
  const [state, setState] = useState<PillStatePayload>(
    initialState ?? { mode: 'idle', targetApp: null, error: null }
  )
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [liveBars, setLiveBars] = useState<number[]>(() => new Array(NUM_BARS).fill(4))
  const smoothedLevelRef = useRef<number>(0)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sinkRef = useRef<GainNode | null>(null)
  const sessionRef = useRef<number>(0)

  useEffect(() => {
    const kestrel = window.kestrel
    if (!kestrel) return

    const unsubState = kestrel.onPillState?.((nextState) => {
      setState(nextState)
    })

    const unsubAudio = kestrel.onPillAudioWave?.((level) => {
      setAudioLevel(level)
    })

    kestrel.notifyPillReady?.()

    return () => {
      unsubState?.()
      unsubAudio?.()
    }
  }, [])

  // Audio capture pipeline when in recording mode
  useEffect(() => {
    if (state.mode !== 'recording') {
      sessionRef.current += 1
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
        processorRef.current = null
      }
      sourceRef.current?.disconnect()
      sourceRef.current = null
      sinkRef.current?.disconnect()
      sinkRef.current = null

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
        streamRef.current = null
      }

      window.kestrel?.sendNotchAudioEnd?.()
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return
    }

    const currentSession = ++sessionRef.current

    const acquire = async (): Promise<MediaStream> => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream
      return stream
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

    const startCapture = async (): Promise<void> => {
      try {
        const stream = await acquire()
        if (sessionRef.current !== currentSession) {
          for (const track of stream.getTracks()) track.stop()
          if (streamRef.current === stream) streamRef.current = null
          return
        }

        const context = await getContext()
        if (sessionRef.current !== currentSession) {
          for (const track of stream.getTracks()) track.stop()
          if (streamRef.current === stream) streamRef.current = null
          return
        }

        const source = context.createMediaStreamSource(stream)
        const processor = context.createScriptProcessor(2048, 1, 1)
        const sink = context.createGain()
        sink.gain.value = 0

        processor.onaudioprocess = (event): void => {
          if (sessionRef.current !== currentSession) return
          const channel = event.inputBuffer.getChannelData(0)

          let sum = 0
          for (let i = 0; i < channel.length; i += 4) {
            sum += channel[i] * channel[i]
          }
          const rms = Math.sqrt(sum / (channel.length / 4))
          const level = Math.min(1, rms * 6)
          setAudioLevel(level)

          window.kestrel?.sendNotchAudio?.(new Float32Array(channel), context.sampleRate)
        }

        source.connect(processor)
        processor.connect(sink)
        sink.connect(context.destination)

        sourceRef.current = source
        processorRef.current = processor
        sinkRef.current = sink
      } catch (error) {
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) track.stop()
          streamRef.current = null
        }
        if (sessionRef.current === currentSession) {
          const message = error instanceof Error ? error.message : 'Microphone capture failed.'
          window.kestrel?.sendNotchAudioError?.(message)
        }
      }
    }

    void startCapture()

    return () => {
      sessionRef.current += 1
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null
        processorRef.current.disconnect()
        processorRef.current = null
      }
      sourceRef.current?.disconnect()
      sourceRef.current = null
      sinkRef.current?.disconnect()
      sinkRef.current = null

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
        streamRef.current = null
      }
    }
  }, [state.mode])

  useEffect(() => {
    return () => {
      if (contextRef.current && contextRef.current.state !== 'closed') {
        void contextRef.current.close().catch(() => undefined)
        contextRef.current = null
      }
    }
  }, [])

  // Smooth animation for wave bars
  useEffect(() => {
    if (state.mode !== 'recording') {
      smoothedLevelRef.current = 0
      setLiveBars(new Array(NUM_BARS).fill(4))
      return
    }

    let animationFrameId: number
    let frame = 0

    const updateBars = (): void => {
      frame += 1
      const target = audioLevel > 0 ? audioLevel : 0.08 + 0.05 * Math.sin(frame * 0.15)
      smoothedLevelRef.current += (target - smoothedLevelRef.current) * 0.25
      const currentLevel = smoothedLevelRef.current

      const newHeights = BAR_MULTIPLIERS.map((mult, i) => {
        const jitter = 0.85 + 0.3 * Math.sin(frame * 0.2 + i)
        const rawHeight = 4 + currentLevel * 20 * mult * jitter
        return Math.max(3, Math.min(22, Math.round(rawHeight)))
      })

      setLiveBars(newHeights)
      animationFrameId = requestAnimationFrame(updateBars)
    }

    animationFrameId = requestAnimationFrame(updateBars)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [state.mode, audioLevel])

  const appName = useMemo(() => {
    return state.targetApp?.name || 'Active App'
  }, [state.targetApp])

  const isVisible = state.mode !== 'idle'

  return (
    <div className="w-full h-full flex items-end justify-center pb-3 pointer-events-none select-none">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            key="dictation-pill"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="relative flex items-center gap-3 px-4 py-2 rounded-[24px] bg-[#0c101a]/90 backdrop-blur-xl border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] pointer-events-auto"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Ambient glass sheen */}
            <div
              className="absolute inset-0 rounded-[24px] pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 70%)'
              }}
            />

            {/* Target App Badge */}
            <div className="flex items-center gap-2 pr-1 border-r border-white/10 z-10">
              {state.targetApp?.icon ? (
                <img
                  src={state.targetApp.icon}
                  alt={appName}
                  className="w-4 h-4 rounded-sm object-contain"
                />
              ) : (
                <div className="w-4 h-4 rounded-sm bg-white/15 flex items-center justify-center text-[10px] font-semibold text-white/90">
                  {appName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-white/80 max-w-[110px] truncate">
                {appName}
              </span>
            </div>

            {/* Mode-specific content */}
            <div className="flex items-center gap-2 z-10">
              {state.mode === 'recording' && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <div className="flex items-center gap-[3px] h-5 min-w-[32px] justify-center">
                    {liveBars.map((height, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${height}px` }}
                        className="w-[3px] rounded-full bg-white transition-[height] duration-75 ease-out"
                      />
                    ))}
                  </div>
                </div>
              )}

              {state.mode === 'transcribing' && (
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span className="text-xs font-medium tracking-wide">Transcribing…</span>
                </div>
              )}

              {state.mode === 'success' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-emerald-400"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-xs font-semibold text-emerald-300 tracking-wide">
                    Pasted
                  </span>
                </motion.div>
              )}

              {state.mode === 'error' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-rose-400"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="text-xs font-medium text-rose-300 max-w-[140px] truncate">
                    {state.error || 'Failed'}
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
export default DictationPill
