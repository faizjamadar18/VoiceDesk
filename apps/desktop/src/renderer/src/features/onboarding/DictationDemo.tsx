import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import skyClouds from '../../assets/skyClouds.webp'
import notionIcon from '../../assets/notion.webp'
import { DemoPill } from './DemoPill'
import { getKeyDisplay } from './KeyboardKey'

const DEMO_CLEAN_TEXT = 'The deadline is Friday.'
const DEMO_SPOKEN_TEXT = 'umm.. the deadline is Tuesday, actually Friday'

export interface DictationDemoProps {
  shortcutKeys?: string[]
}

export function DictationDemo({
  shortcutKeys = ['control-left', 'shift-left']
}: DictationDemoProps): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'shortcut' | 'recording' | 'typing'>('idle')
  const [typedLength, setTypedLength] = useState(0)
  const [rawVisible, setRawVisible] = useState(false)

  const runCycle = useCallback(() => {
    setPhase('idle')
    setTypedLength(0)
    setRawVisible(false)

    const timeouts: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = []
    const s = (fn: () => void, ms: number): void => {
      timeouts.push(setTimeout(fn, ms))
    }

    s(() => setPhase('shortcut'), 400)

    s(() => {
      setPhase('recording')
      setRawVisible(true)
    }, 2200)

    s(() => {
      setPhase('typing')
      setRawVisible(false)
      let i = 0
      const iv = setInterval(() => {
        i++
        setTypedLength(i)
        if (i >= DEMO_CLEAN_TEXT.length) clearInterval(iv)
      }, 22)
      timeouts.push(iv)
    }, 4600)

    return () => {
      timeouts.forEach((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
    }
  }, [])

  useEffect(() => {
    const cleanup = runCycle()
    const loop = setInterval(runCycle, 7800)
    return () => {
      cleanup()
      clearInterval(loop)
    }
  }, [runCycle])

  const showShortcut = phase === 'shortcut'
  const isRecording = phase === 'recording'
  const isTyping = phase === 'typing'
  const showWindow = isRecording || isTyping

  return (
    <div className="relative w-full max-w-[480px] select-none">
      <div
        className="rounded-[20px] overflow-hidden relative"
        style={{
          boxShadow: '0 25px 60px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.12)',
          aspectRatio: '4/3'
        }}
      >
        {/* Sky Clouds Background */}
        <div
          className="absolute inset-0"
          style={{
            background: `url(${skyClouds}) center 72% / cover no-repeat`
          }}
        />

        {/* Ambient Radial Gradient Overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 115% 110% at 50% 34%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.08) 48%, rgba(255,255,255,0.2) 100%)'
          }}
        />

        {/* Center Glowing Shortcut Keycaps Preview */}
        <div
          className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none gap-2"
          style={{
            opacity: showShortcut ? 1 : 0,
            transform: showShortcut ? 'scale(1)' : 'scale(0.85)',
            transition: 'all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          {shortcutKeys.map((key) => (
            <div key={key} className="relative" style={{ width: 60, height: 60 }}>
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  borderRadius: 18,
                  WebkitBackdropFilter: 'blur(2px)',
                  backdropFilter: 'blur(2px)',
                  background:
                    'linear-gradient(-75deg, rgba(230,245,255,0.08), rgba(240,250,255,0.2), rgba(230,245,255,0.08))',
                  boxShadow:
                    'rgba(0,0,0,0.05) 0px 2px 2px 0px inset, rgba(255,255,255,0.5) 0px -2px 2px 0px inset, rgba(0,0,0,0.2) 0px 4px 2px -2px, rgba(210,235,255,0.25) 0px 0px 1.6px 4px inset'
                }}
              >
                <span
                  className="select-none font-bold"
                  style={{
                    fontSize: 22,
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    letterSpacing: '-0.18px'
                  }}
                >
                  {getKeyDisplay(key)}
                </span>
              </div>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: 18,
                  padding: 1,
                  background:
                    'conic-gradient(from -75deg at 50% 50%, rgba(20,60,120,0.5), rgba(150,200,255,0.1) 5% 40%, rgba(20,60,120,0.5) 50%, rgba(150,200,255,0.1) 60% 95%, rgba(20,60,120,0.5)), linear-gradient(180deg, rgba(220,240,255,0.5), rgba(240,250,255,0.5))',
                  boxShadow: 'inset 0 0 0 0.5px rgba(220,240,255,0.5)',
                  WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
                  WebkitMaskClip: 'content-box, border-box',
                  WebkitMaskOrigin: 'content-box, border-box',
                  WebkitMaskComposite: 'xor',
                  maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
                  maskClip: 'content-box, border-box',
                  maskOrigin: 'content-box, border-box',
                  maskComposite: 'exclude'
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{
                  borderRadius: 18,
                  background:
                    'linear-gradient(-45deg, transparent 0%, rgba(255,255,255,0.5) 40% 50%, transparent 55%)',
                  mixBlendMode: 'screen',
                  backgroundSize: '200% 200%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Dark Editor Card (Notion Mockup) */}
        <div
          className="absolute z-10"
          style={{
            top: '10%',
            left: '50%',
            transform: `translateX(-50%) ${showWindow ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)'}`,
            width: '72%',
            opacity: showWindow ? 1 : 0,
            transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.4,0,0.2,1)'
          }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(30, 30, 36, 0.92)',
              backdropFilter: 'blur(40px) saturate(180%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.1)'
            }}
          >
            {/* Window title bar */}
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '0.5px solid rgba(255,255,255,0.06)'
              }}
            >
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-1.5">
                <img src={notionIcon} alt="" className="w-3.5 h-3.5 rounded-xs shrink-0" />
                <span className="text-xs font-medium text-white/60">Dictation Mode</span>
              </div>
            </div>

            {/* Editor Text Area */}
            <div className="p-4 min-h-[120px]">
              <span className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">
                {DEMO_CLEAN_TEXT.slice(0, typedLength)}
              </span>
              {(isTyping || isRecording) && (
                <span
                  className="inline-block w-[1.5px] h-[14px] bg-white/80 align-text-bottom ml-px"
                  style={{ animation: 'cursor-blink 1s steps(2) infinite' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Floating Spoken Text Bubble */}
        <div
          className="absolute z-10 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1.5 rounded-full"
          style={{
            bottom: '52px',
            opacity: rawVisible ? 1 : 0,
            transform: `translateX(-50%) ${rawVisible ? 'translateY(0)' : 'translateY(6px)'}`,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
        >
          <span className="text-[11px] italic text-white/80 whitespace-nowrap">
            &ldquo;{DEMO_SPOKEN_TEXT}&rdquo;
          </span>
        </div>

        {/* Notch Transcription Pill at Bottom */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <DemoPill isRecording={isRecording} />
        </div>
      </div>
    </div>
  )
}

