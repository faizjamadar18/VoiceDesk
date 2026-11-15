import React, { useEffect, useRef, useState } from 'react'
import type { PillStatePayload } from '../../../shared/types'
import { AudioBars } from './AudioBars'
import { AppIcon } from './AppIcon'
import { DictationProgressRing } from './DictationProgressRing'
import { PillContentBlurSwap } from './PillContentBlurSwap'

const DICTATION_BAR_WIDTH = 80
const DICTATION_BAR_NO_ICON_WIDTH = 60
const DICTATION_PILL_HEIGHT = 30
const PROCESSING_CIRCLE_SIZE = 30

const PILL_GLASS_BACKGROUND =
  'linear-gradient(180deg, rgba(22,22,27,0.96) 0%, rgba(12,12,15,0.96) 100%)'

export interface DictationPillProps {
  initialState?: PillStatePayload
}

export function DictationPill({ initialState }: DictationPillProps): React.JSX.Element {
  const [state, setState] = useState<PillStatePayload>(
    initialState ?? { mode: 'idle', targetApp: null, error: null }
  )
  const [volumeHistory, setVolumeHistory] = useState<number[]>([])
  const volumeHistoryRef = useRef<number[]>([])
  const recordingStartTimeRef = useRef<number>(0)

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sinkRef = useRef<GainNode | null>(null)
  const sessionRef = useRef<number>(0)

  const pushVolume = (vol: number): void => {
    const next = [...volumeHistoryRef.current, vol]
    while (next.length > 16) {
      next.shift()
    }
    volumeHistoryRef.current = next
    setVolumeHistory(next)
  }

  useEffect(() => {
    const kestrel = window.kestrel
    if (!kestrel) return

    const unsubState = kestrel.onPillState?.((nextState) => {
      setState(nextState)
    })

    const unsubAudio = kestrel.onPillAudioWave?.((level) => {
      pushVolume(level)
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

      volumeHistoryRef.current = []
      setVolumeHistory([])

      window.kestrel?.sendNotchAudioEnd?.()
      return
    }

    recordingStartTimeRef.current = Date.now()
    volumeHistoryRef.current = []
    setVolumeHistory([])

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
          pushVolume(level)

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

  const isVisible = state.mode !== 'idle'
  const hasAppIcon = Boolean(state.targetApp?.icon)

  let width: number
  let height: number = DICTATION_PILL_HEIGHT

  if (state.mode === 'recording') {
    width = hasAppIcon ? DICTATION_BAR_WIDTH : DICTATION_BAR_NO_ICON_WIDTH
    height = DICTATION_PILL_HEIGHT
  } else if (state.mode === 'transcribing' || state.mode === 'success') {
    width = PROCESSING_CIRCLE_SIZE
    height = PROCESSING_CIRCLE_SIZE
  } else if (state.mode === 'error') {
    const errorText = state.error || 'Failed'
    width = Math.min(280, Math.max(136, 44 + errorText.length * 8))
    height = DICTATION_PILL_HEIGHT
  } else {
    width = 36
    height = 8
  }

  const wrapperStyle: React.CSSProperties = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'scale(1)' : 'scale(0.8)',
    transformOrigin: 'center center',
    visibility: isVisible ? 'visible' : 'hidden',
    transition: 'opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease',
    marginBottom: '0px'
  }

  const pillOuterStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: `${width}px`,
    height: `${height}px`,
    background: PILL_GLASS_BACKGROUND,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: '24px',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    cursor: 'default',
    transition:
      'width 0.15s ease, height 0.15s ease, background-color 0.15s ease, border-radius 0.15s ease, box-shadow 0.15s ease'
  }

  const renderContent = (): React.JSX.Element | null => {
    if (state.mode === 'recording') {
      return (
        <PillContentBlurSwap swapKey="recording" animate={false}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4.5px',
              padding: hasAppIcon ? '0 10.5px 0 6px' : '0 10.5px',
              height: '100%',
              opacity: 0,
              animation: 'pillContentFadeIn 100ms ease-out 100ms forwards'
            }}
          >
            {hasAppIcon && (
              <div
                style={{
                  width: 20,
                  display: 'flex',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <AppIcon
                  appIcon={state.targetApp?.icon}
                  appName={state.targetApp?.name}
                  size={20}
                  recordingStartTime={recordingStartTimeRef.current}
                  isFavicon={Boolean(state.targetApp?.name?.includes('.'))}
                />
              </div>
            )}
            <AudioBars
              volumeHistory={volumeHistory}
              barColor="#ffffff"
              barCount={7}
              direction="right-to-left"
              maxBarHeight={18}
              barWidth={2.5}
              barGap={1.5}
              marginLeft={0}
              marginRight={0}
            />
          </div>
        </PillContentBlurSwap>
      )
    }

    if (state.mode === 'transcribing' || state.mode === 'success') {
      return (
        <PillContentBlurSwap swapKey="processing" animate={true}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%'
            }}
          >
            <DictationProgressRing
              size={16}
              strokeWidth={2.5}
              complete={state.mode === 'success'}
              insertionSucceeded={state.mode === 'success'}
            />
          </div>
        </PillContentBlurSwap>
      )
    }

    if (state.mode === 'error') {
      return (
        <PillContentBlurSwap swapKey="error" animate={true}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              padding: '0 12px'
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#fca5a5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {state.error || 'Failed'}
            </span>
          </div>
        </PillContentBlurSwap>
      )
    }

    return null
  }

  return (
    <div className="w-full h-full flex items-end justify-center pb-3 pointer-events-none select-none">
      <div style={wrapperStyle}>
        <div
          className="pill-gradient-border"
          style={pillOuterStyle}
          {...({ 'data-pill-hover-zone': '' } as React.HTMLAttributes<HTMLDivElement>)}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              borderRadius: 'inherit'
            }}
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DictationPill
