import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import cloudsBlue from '../../voiceos-notch/assets/cloudsBlue.png'
import type { ActionCopy } from './action-detail-catalog'
import type { AgentActionId } from './types'

const NOTCH_ARC_SAMPLES = 8

function buildNotchClipPath(
  shoulderX: number,
  shoulderY: number,
  bottomRadius: number
): string {
  const points: [string, string][] = []
  const px = (value: number): string => `${value.toFixed(3)}px`
  const fromRight = (value: number): string => `calc(100% - ${value.toFixed(3)}px)`
  const fromBottom = (value: number): string => `calc(100% - ${value.toFixed(3)}px)`

  points.push([px(0), px(0)], ['100%', px(0)])

  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -Math.PI / 2 - (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    points.push([
      fromRight(-shoulderX * Math.cos(theta)),
      px(shoulderY + shoulderY * Math.sin(theta))
    ])
  }

  points.push([fromRight(shoulderX), fromBottom(bottomRadius)])

  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    points.push([
      fromRight(shoulderX + bottomRadius - bottomRadius * Math.cos(theta)),
      fromBottom(bottomRadius - bottomRadius * Math.sin(theta))
    ])
  }

  points.push([px(shoulderX + bottomRadius), '100%'])

  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = Math.PI / 2 + (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    points.push([
      px(shoulderX + bottomRadius + bottomRadius * Math.cos(theta)),
      fromBottom(bottomRadius - bottomRadius * Math.sin(theta))
    ])
  }

  points.push([px(shoulderX), px(shoulderY)])

  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -(i / NOTCH_ARC_SAMPLES) * (Math.PI / 2)
    points.push([
      px(shoulderX * Math.cos(theta)),
      px(shoulderY + shoulderY * Math.sin(theta))
    ])
  }

  return `polygon(${points.map(([x, y]) => `${x} ${y}`).join(', ')})`
}

const COLLAPSED_NOTCH_CLIP = buildNotchClipPath(10, 10, 11)
const LISTENING_NOTCH_CLIP = buildNotchClipPath(14, 14, 17)
const EXPANDED_NOTCH_CLIP = buildNotchClipPath(18, 18, 24)

const WAND_HUE = 214
const WAND_BLUE = `hsl(${WAND_HUE}, 100%, 60%)`
const WAND_BLUE_LIGHT = `hsl(${WAND_HUE}, 100%, 68%)`
const SCENE_W = 420
const SCENE_H = 244

const MENU_BAR_CSS = `
.mbar {
  position: absolute; top: 0; left: 0; right: 0; height: 22px; z-index: 10;
  display: flex; align-items: center; gap: 9px; padding: 0 10px;
  background: rgba(246,247,250,0.96);
  border-bottom: 0.5px solid rgba(15,23,42,0.07);
  color: rgba(20,22,28,0.62);
  font-size: 8px; font-weight: 400; letter-spacing: 0.004em; line-height: 1;
}
.mbar-apple { width: 9px; height: 11px; fill: rgba(20,22,28,0.72); flex: none; }
.mbar-app { font-weight: 640; color: rgba(20,22,28,0.82); }
.mbar-menu { color: rgba(20,22,28,0.6); }
.mbar-right {
  margin-left: auto; display: flex; align-items: center; gap: 7px;
  color: rgba(20,22,28,0.55);
}
`

const WAND_CSS = `
.wand { position: absolute; inset: 0; pointer-events: none; z-index: 15; }
.wand-glow {
  opacity: 0.24; filter: blur(3px);
  stroke-dasharray: 100; stroke-dashoffset: 0;
  animation: wandDraw 9s linear infinite, wandFade 9s linear infinite;
}
.wand-core {
  stroke-dasharray: 100; stroke-dashoffset: 0;
  animation: wandDraw 9s linear infinite, wandFade 9s linear infinite;
}
.wand-head, .wand-cursor {
  position: absolute; left: 0; top: 0;
  offset-distance: 100%;
  offset-rotate: 0deg;
  animation: wandRide 9s linear infinite;
  z-index: 16;
}
.wand-head {
  width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px;
  border-radius: 999px;
  background: radial-gradient(circle, #ffffff 0%, ${WAND_BLUE} 55%, rgba(30,130,255,0) 100%);
  opacity: 0;
  animation: wandRide 9s linear infinite, wandHead 9s linear infinite;
}
.wand-cursor {
  offset-anchor: 1.5px 1px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.42));
  opacity: 0;
  animation: wandRide 9s linear infinite, wandCursor 9s linear infinite;
}
.point-hint {
  position: absolute; display: inline-flex; align-items: center; gap: 4px;
  padding: 3.5px 7px; border-radius: 5px;
  background: rgba(0,0,0,0.75); color: rgba(255,255,255,0.9);
  font-size: 8.5px; font-weight: 500; line-height: 1; white-space: nowrap;
  opacity: 0;
  animation: pointHint 9s linear infinite;
  z-index: 17;
}

@keyframes wandDraw {
  0%, 13% { stroke-dashoffset: 100; animation-timing-function: cubic-bezier(0.4, 0, 0.35, 1); }
  21.5%, 100% { stroke-dashoffset: 0; }
}
@keyframes wandFade {
  0%, 12.5% { opacity: 0; }
  13%, 85% { opacity: 1; }
  88.5%, 100% { opacity: 0; }
}
@keyframes wandRide {
  0%, 13% { offset-distance: 0%; animation-timing-function: cubic-bezier(0.4, 0, 0.35, 1); }
  21.5%, 100% { offset-distance: 100%; }
}
@keyframes wandHead {
  0%, 13% { opacity: 0; }
  14%, 20% { opacity: 1; }
  23%, 100% { opacity: 0; }
}
@keyframes wandCursor {
  0%, 9% { opacity: 0; }
  11%, 46% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
@keyframes pointHint {
  0%, 9% { opacity: 0; }
  11%, 12.5% { opacity: 1; }
  15%, 100% { opacity: 0; }
}
`

const BASE_SCENE_CSS = `
.ids {
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  width: 100%;
  height: 100%;
}
.ids-scene {
  position: relative; height: 244px; overflow: hidden;
  border-radius: var(--ids-scene-radius, 26px);
  background: linear-gradient(145deg, #d7e8f5, #b8d5ed);
  box-shadow:
    0 22px 50px -24px rgba(19, 46, 82, 0.5),
    0 8px 18px -14px rgba(19, 46, 82, 0.32),
    0 0 0 0.5px rgba(14, 24, 39, 0.22),
    inset 0 1px 0 rgba(255,255,255,0.5);
  pointer-events: none; user-select: none; -webkit-user-select: none;
}
.ids--dark .ids-scene {
  box-shadow:
    0 24px 54px -22px rgba(0,0,0,0.76),
    0 8px 18px -12px rgba(0,0,0,0.46),
    0 0 0 0.5px rgba(255,255,255,0.14),
    inset 0 1px 0 rgba(255,255,255,0.12);
}
.ids-wallpaper {
  position: absolute; inset: -3px;
  background-position: center 61%;
  background-size: cover;
  background-repeat: no-repeat;
  opacity: 0.84;
  filter: saturate(0.74) contrast(0.95) brightness(1.08);
  transform: scale(1.012);
  animation: idsWallpaper 9s ease-in-out infinite;
}
.ids-scene-glow {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 76% 48% at 50% 4%, rgba(255,255,255,0.42) 0%, rgba(235,246,255,0.16) 52%, transparent 80%),
    linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 58%, rgba(38,74,109,0.055) 100%),
    radial-gradient(ellipse 112% 96% at 50% 44%, transparent 68%, rgba(45,77,108,0.07) 100%);
}
.ids-scene-sheen {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.015)),
    linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 20%, transparent 84%, rgba(255,255,255,0.06) 100%);
}
.ids-notch-ambient {
  position: absolute; top: -14px; left: 50%; width: 330px; height: 92px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at 50% 0%, rgba(8,18,35,0.3), transparent 70%);
  filter: blur(9px);
  opacity: 0.72;
}
.ids-panel {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 300px; height: var(--ids-expanded-h, 160px);
  overflow: hidden;
  clip-path: ${EXPANDED_NOTCH_CLIP};
  -webkit-clip-path: ${EXPANDED_NOTCH_CLIP};
  background:
    radial-gradient(ellipse 76% 30% at 50% -2%, rgba(255,255,255,0.05), transparent 68%),
    linear-gradient(180deg, #030305 0%, #08080a 56%, #0b0b0e 100%);
  filter:
    drop-shadow(0 17px 22px rgba(4,10,22,0.42))
    drop-shadow(0 4px 7px rgba(4,10,22,0.24));
  box-shadow:
    inset 0 -0.5px 0 rgba(255,255,255,0.16);
  isolation: isolate; contain: paint;
  will-change: width, height, clip-path;
  animation: idsPanel 9s linear infinite;
  z-index: 30;
}
.ids-panel::after {
  content: ""; position: absolute; inset: 0; z-index: 4; pointer-events: none;
  background:
    linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.055) 50%, transparent 95%) bottom / 100% 0.5px no-repeat;
  opacity: 0.9;
}
.ids-panel-content {
  position: absolute; z-index: 1; top: 0; left: 50%; transform: translateX(-50%);
  width: 264px; height: var(--ids-expanded-h, 160px);
}
.ids-query { display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 24px; }
.ids-wave {
  display: flex; align-items: center; gap: 2px; height: 12px; flex-shrink: 0;
  animation: idsWave 9s linear infinite;
}
.ids-wave-bar {
  width: 2px; border-radius: 999px;
  background: linear-gradient(180deg, #ffffff, rgba(255,255,255,0.72));
  box-shadow: 0 0 4px rgba(255,255,255,0.16);
  transform: scaleY(0.55); animation: idsWavePulse 1.1s ease-in-out infinite;
}
.ids-wave-bar:nth-child(1) { height: 6px; }
.ids-wave-bar:nth-child(2) { height: 11px; animation-delay: 0.15s; }
.ids-wave-bar:nth-child(3) { height: 8px; animation-delay: 0.3s; }
.ids-wave-bar:nth-child(4) { height: 12px; animation-delay: 0.45s; }
.ids-query-text {
  font-size: 11.75px; font-weight: 510; letter-spacing: 0.006em; line-height: 15px;
  color: rgba(255,255,255,0.94); white-space: nowrap; overflow: hidden;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  animation: idsQueryText 9s linear infinite;
}
.ids-qword { display: inline-block; white-space: pre; animation: idsWord 9s linear infinite; }

@keyframes idsPanel {
  0%, 7% {
    width: 128px; height: 22px;
    clip-path: ${COLLAPSED_NOTCH_CLIP}; -webkit-clip-path: ${COLLAPSED_NOTCH_CLIP};
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  11.5%, 20% {
    width: 292px; height: 34px;
    clip-path: ${LISTENING_NOTCH_CLIP}; -webkit-clip-path: ${LISTENING_NOTCH_CLIP};
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  24.5%, 88.5% {
    width: 300px; height: var(--ids-expanded-h, 160px);
    clip-path: ${EXPANDED_NOTCH_CLIP}; -webkit-clip-path: ${EXPANDED_NOTCH_CLIP};
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  92.5%, 93.5% {
    width: 292px; height: 34px;
    clip-path: ${LISTENING_NOTCH_CLIP}; -webkit-clip-path: ${LISTENING_NOTCH_CLIP};
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  97.5%, 100% {
    width: 128px; height: 22px;
    clip-path: ${COLLAPSED_NOTCH_CLIP}; -webkit-clip-path: ${COLLAPSED_NOTCH_CLIP};
  }
}
@keyframes idsWallpaper {
  0%, 100% { transform: scale(1.012); }
  50% { transform: scale(1.006); }
}
@keyframes idsWave {
  0%, 12.4% { opacity: 0; }
  13.4%, 88.5% { opacity: 1; }
  90.5%, 100% { opacity: 0; }
}
@keyframes idsWavePulse {
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}
@keyframes idsQueryText {
  0%, 12.5% { opacity: 0; }
  13.5%, 88.5% { opacity: 1; }
  90.5%, 100% { opacity: 0; }
}
@keyframes idsWord {
  0%, 14% { opacity: 0; filter: blur(2.5px); transform: translateY(2px); animation-timing-function: cubic-bezier(0.2, 0.6, 0.3, 1); }
  16.5%, 100% { opacity: 1; filter: blur(0px); transform: translateY(0); }
}
`

function screenSurfaceCss(key: string, background: string): string {
  const root = `.asc-${key}`
  return `
${root} .ids-wallpaper, ${root} .ids-scene-glow { display: none; }
${root} .ids-scene { background: ${background}; }
${root} .ids-scene-sheen { opacity: 0.22; }
`
}

function MacPointer({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 12 17"
      width="12"
      height="17"
      aria-hidden="true"
    >
      <path
        d="M1.5 1 L1.5 13.6 L4.6 10.8 L6.5 15.6 L8.9 14.6 L7 9.9 L11 9.9 Z"
        fill="#0b0b0d"
        stroke="#ffffff"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WandTrail({ d }: { d: string }): JSX.Element {
  return (
    <svg
      className="wand"
      width={SCENE_W}
      height={SCENE_H}
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        className="wand-glow"
        d={d}
        pathLength={100}
        stroke={WAND_BLUE}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="wand-core"
        d={d}
        pathLength={100}
        stroke={WAND_BLUE}
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PointHint({
  label,
  at
}: {
  label: string
  at: CSSProperties
}): JSX.Element {
  return (
    <span className="point-hint" style={at}>
      <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
          fill={WAND_BLUE_LIGHT}
        />
      </svg>
      {label}
    </span>
  )
}

function WandRider({
  d,
  hintLabel,
  hintAt
}: {
  d: string
  hintLabel: string
  hintAt: CSSProperties
}): JSX.Element {
  const ridePath: CSSProperties = { offsetPath: `path("${d}")` }
  return (
    <>
      <span className="wand-head" style={ridePath} />
      <span className="wand-cursor" style={ridePath}>
        <MacPointer />
      </span>
      <PointHint label={hintLabel} at={hintAt} />
    </>
  )
}

function MenuBar({
  app,
  menus,
  clock
}: {
  app: string
  menus: string[]
  clock?: ReactNode
}): JSX.Element {
  return (
    <div className="mbar">
      <svg className="mbar-apple" viewBox="0 0 14 17" aria-hidden="true">
        <path d="M11.2 9.1c0-1.9 1.5-2.8 1.6-2.9-0.9-1.3-2.3-1.5-2.8-1.5-1.2-0.1-2.3 0.7-2.9 0.7-0.6 0-1.5-0.7-2.5-0.7-1.3 0-2.5 0.7-3.1 1.9-1.3 2.3-0.3 5.8 1 7.7 0.6 0.9 1.4 2 2.4 1.9 1-0.04 1.3-0.6 2.5-0.6 1.2 0 1.5 0.6 2.5 0.6 1 0 1.7-0.9 2.3-1.9 0.7-1.1 1-2.1 1-2.2-0.02-0.01-2-0.8-2-3zM9.3 3.5c0.5-0.6 0.9-1.5 0.8-2.4-0.8 0.03-1.7 0.5-2.3 1.2-0.5 0.6-0.9 1.5-0.8 2.3 0.9 0.07 1.8-0.4 2.3-1.1z" />
      </svg>
      <span className="mbar-app">{app}</span>
      {menus.map((m) => (
        <span key={m} className="mbar-menu">
          {m}
        </span>
      ))}
      <span className="mbar-right">
        <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4a8 8 0 0 1 8 8m-8-4a4 4 0 0 1 4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="1.6" fill="currentColor" />
        </svg>
        <svg width="13" height="9" viewBox="0 0 26 14" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="20"
            height="12"
            rx="3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.7"
          />
          <rect x="2.8" y="2.8" width="14" height="8.4" rx="1.8" fill="currentColor" />
          <path
            d="M23 5v4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        {clock}
      </span>
    </div>
  )
}

export function NotchAnswerText({ text }: { text: string }): JSX.Element {
  return (
    <div
      style={{
        padding: '4px 14px 8px',
        fontSize: 15,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,0.95)'
      }}
    >
      <div
        className="ask-response-markdown vos-answer-reveal"
        style={{ fontSize: 15, lineHeight: 1.5 }}
      >
        {text}
      </div>
    </div>
  )
}

function HeroNotchContent({
  answerText,
  onNotchHeight
}: {
  answerText?: string
  onNotchHeight: (height: number) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [nativeHeight, setNativeHeight] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setNativeHeight(el.scrollHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const HERO_NOTCH_BODY_WIDTH = 264
  const HERO_INSET = 10
  const HERO_QUERY_ZONE = 34
  const HERO_MAX_CARD_HEIGHT = 168
  const NATIVE_CARD_WIDTH = 404

  const targetWidth = HERO_NOTCH_BODY_WIDTH - HERO_INSET * 2
  const scale =
    nativeHeight > 0
      ? Math.min(targetWidth / NATIVE_CARD_WIDTH, HERO_MAX_CARD_HEIGHT / nativeHeight)
      : targetWidth / NATIVE_CARD_WIDTH
  const visualHeight = nativeHeight * scale

  useEffect(() => {
    if (nativeHeight > 0) {
      onNotchHeight(HERO_QUERY_ZONE + HERO_INSET * 2 + visualHeight)
    }
  }, [nativeHeight, visualHeight, onNotchHeight])

  return (
    <div
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        height: HERO_INSET * 2 + visualHeight,
        paddingTop: HERO_INSET,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center'
      }}
    >
      <div
        ref={ref}
        style={{
          width: NATIVE_CARD_WIDTH,
          transformOrigin: 'top center',
          transform: `scale(${scale})`
        }}
      >
        {answerText && <NotchAnswerText text={answerText} />}
      </div>
    </div>
  )
}

function ActionScene({
  isDarkMode,
  copy,
  sceneKey,
  extraCss,
  backdrop,
  actionOverlay,
  holdListening
}: {
  isDarkMode: boolean
  copy: ActionCopy
  sceneKey: string
  extraCss?: string
  backdrop?: ReactNode
  actionOverlay?: ReactNode
  holdListening?: boolean
}): JSX.Element {
  const [notchHeight, setNotchHeight] = useState(140)

  return (
    <div
      className={`ids ${isDarkMode ? 'ids--dark' : ''} asc-${sceneKey}`}
      style={{ width: '100%', height: '100%' }}
    >
      <style>{BASE_SCENE_CSS}</style>
      {extraCss && <style>{extraCss}</style>}

      <div className="ids-scene">
        <div
          className="ids-wallpaper"
          style={{ backgroundImage: `url(${cloudsBlue})` }}
        />
        <div className="ids-scene-glow" />
        <div className="ids-scene-sheen" />

        {backdrop}

        <div className="ids-notch-ambient" />

        <div
          className="ids-panel"
          style={
            {
              ['--ids-expanded-h' as string]: `${notchHeight}px`
            } as CSSProperties
          }
        >
          <div
            className="ids-panel-content"
            style={
              {
                ['--ids-expanded-h' as string]: `${notchHeight}px`
              } as CSSProperties
            }
          >
            <div className="ids-query">
              <span className="ids-wave">
                <span className="ids-wave-bar" />
                <span className="ids-wave-bar" />
                <span className="ids-wave-bar" />
                <span className="ids-wave-bar" />
              </span>
              <span className="ids-query-text">
                {copy.queryChunks.map((chunk, i) => (
                  <span
                    key={i}
                    className="ids-qword"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    {chunk}
                  </span>
                ))}
              </span>
            </div>

            {!holdListening && (
              <HeroNotchContent
                answerText={copy.answer}
                onNotchHeight={setNotchHeight}
              />
            )}
          </div>
        </div>

        {actionOverlay}
      </div>
    </div>
  )
}

/* 1. AskScreenScene */
const ASK_LOOP =
  'M 30 191 C 16 182, 24 165, 66 160 C 110 155, 178 157, 197 166 C 212 174, 199 188, 158 193 C 114 198, 46 197, 31 189 C 25 185, 29 180, 37 177'

const ASK_CSS = `
${screenSurfaceCss('ask', '#ffffff')}
${MENU_BAR_CSS}
${WAND_CSS}
.ask-tabs {
  position: absolute; top: 22px; left: 0; right: 0; height: 24px;
  background: #f7f8fa; border-bottom: 0.5px solid rgba(15,23,42,0.08);
  display: flex; align-items: center; padding: 0 12px;
}
.ask-tab {
  display: inline-flex; align-items: center; gap: 5px;
  background: #ffffff; padding: 3px 9px; border-radius: 4px;
  font-size: 8.5px; font-weight: 500; color: #1e293b;
  box-shadow: 0 1px 2px rgba(15,23,42,0.06);
}
.ask-tab-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #3b82f6;
}
.ask-code {
  position: absolute; top: 50px; left: 14px; right: 14px;
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size: 8.5px; line-height: 1.5; color: #334155;
}
.ask-line { display: flex; gap: 10px; }
.ask-no { width: 14px; color: #94a3b8; text-align: right; user-select: none; }
.ask-fn { color: #2563eb; font-weight: 600; }
.ask-console {
  position: absolute; bottom: 8px; left: 14px; right: 14px; height: 64px;
  background: #0f172a; border-radius: 6px; padding: 7px 10px;
  color: #f1f5f9; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
}
.ask-console-title { font-size: 8px; color: #64748b; margin-bottom: 3px; font-weight: 600; text-transform: uppercase; }
.ask-err { font-size: 8.5px; color: #f87171; display: flex; align-items: center; gap: 4px; font-weight: 600; }
.ask-err-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 10px; height: 10px; border-radius: 50%; background: #ef4444; color: #fff; font-size: 7px;
}
.ask-err-detail { font-size: 7.5px; color: #94a3b8; margin-top: 2px; }
`

function AskScreenScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="ask"
      extraCss={ASK_CSS}
      backdrop={
        <>
          <div className="ask-tabs">
            <span className="ask-tab">
              <span className="ask-tab-dot" />
              server.ts
            </span>
          </div>
          <div className="ask-code">
            <div className="ask-line">
              <span className="ask-no">1</span>
              <span>import &#123; createClient &#125; from &apos;@kestrel/agent&apos;</span>
            </div>
            <div className="ask-line">
              <span className="ask-no">2</span>
              <span>const client = createClient(&#123;</span>
            </div>
            <div className="ask-line">
              <span className="ask-no">3</span>
              <span>
                &nbsp;&nbsp;apiKey: process.env.<span className="ask-fn">API_KEY</span>
              </span>
            </div>
            <div className="ask-line">
              <span className="ask-no">4</span>
              <span>&#125;)</span>
            </div>
          </div>
          <div className="ask-console">
            <div className="ask-console-title">Console</div>
            <div className="ask-err">
              <span className="ask-err-mark">!</span>
              Error: Missing API key
            </div>
            <div className="ask-err-detail">at createClient (server.ts:14)</div>
          </div>
          <MenuBar app="Editor" menus={['File', 'Edit', 'View']} />
          <WandTrail d={ASK_LOOP} />
          <WandRider
            d={ASK_LOOP}
            hintLabel="Point to show VoiceOS"
            hintAt={{ left: 46, top: 214 }}
          />
        </>
      }
    />
  )
}

/* 2. CreatePromptScene */
const PROMPT_LOOP =
  'M 44 224 C 24 210, 26 168, 62 154 C 104 140, 176 146, 196 168 C 212 186, 198 218, 154 230 C 112 240, 58 238, 44 222 C 38 214, 44 206, 54 202'

const PROMPT_CARD = { left: 34, top: 150, width: 160, height: 82 }
const FLY_DX = 210 - (PROMPT_CARD.left + PROMPT_CARD.width / 2)
const FLY_DY = 14 - (PROMPT_CARD.top + PROMPT_CARD.height / 2)

const FRAME_CORNERS = (() => {
  const w2 = PROMPT_CARD.width
  const h2 = PROMPT_CARD.height
  const arm = 13
  const r3 = 6.5
  const p3 = 2.25
  return [
    `M ${p3} ${p3 + arm} L ${p3} ${p3 + r3} Q ${p3} ${p3} ${p3 + r3} ${p3} L ${p3 + arm} ${p3}`,
    `M ${w2 - p3 - arm} ${p3} L ${w2 - p3 - r3} ${p3} Q ${w2 - p3} ${p3} ${w2 - p3} ${p3 + r3} L ${w2 - p3} ${p3 + arm}`,
    `M ${w2 - p3} ${h2 - p3 - arm} L ${w2 - p3} ${h2 - p3 - r3} Q ${w2 - p3} ${h2 - p3} ${w2 - p3 - r3} ${h2 - p3} L ${w2 - p3 - arm} ${h2 - p3}`,
    `M ${p3 + arm} ${h2 - p3} L ${p3 + r3} ${h2 - p3} Q ${p3} ${h2 - p3} ${p3} ${h2 - p3 - r3} L ${p3} ${h2 - p3 - arm}`
  ].join(' ')
})()

const PROMPT_CSS = `
${screenSurfaceCss('cprompt', '#f4f4f7')}
${MENU_BAR_CSS}
${WAND_CSS}
.cp-canvas-label {
  position: absolute; top: 27px; left: 0; right: 0; text-align: center;
  font-size: 8px; font-weight: 500; color: rgba(20,22,28,0.42);
}
.cp-board {
  position: absolute; top: 156px; height: 70px; border-radius: 7px;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(15,23,42,0.1), 0 0 0 0.5px rgba(15,23,42,0.07);
}
.cp-board-label {
  position: absolute; top: -11px; left: 1px;
  font-size: 7px; font-weight: 500; color: rgba(20,22,28,0.4);
}
.cp-board-a { left: 38px; width: 152px; }
.cp-board-b { left: 232px; width: 152px; }
.cp-bar { position: absolute; border-radius: 3px; background: rgba(20,22,28,0.12); }
.cp-bar-accent { background: ${WAND_BLUE}; opacity: 0.85; }
.cp-bar-soft { background: rgba(20,22,28,0.07); }
.cp-flash {
  position: absolute; left: ${PROMPT_CARD.left}px; top: ${PROMPT_CARD.top}px;
  width: ${PROMPT_CARD.width}px; height: ${PROMPT_CARD.height}px;
  border-radius: 9px; background: #ffffff; opacity: 0; pointer-events: none;
  animation: cpFlash 9s linear infinite;
  z-index: 20;
}
@keyframes cpFlash {
  0%, 21.5% { opacity: 0; }
  22.5% { opacity: 0.38; }
  24.5%, 100% { opacity: 0; }
}
.cp-capture {
  position: absolute; left: ${PROMPT_CARD.left}px; top: ${PROMPT_CARD.top}px;
  width: ${PROMPT_CARD.width}px; height: ${PROMPT_CARD.height}px;
  opacity: 0; pointer-events: none;
  transform-origin: center;
  animation: cpFly 9s infinite;
  z-index: 21;
}
.cp-capture svg {
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
  filter: drop-shadow(0 0 4px hsla(214, 100%, 62%, 0.45));
}
@keyframes cpFly {
  0%, 21.8% { opacity: 0; transform: translate(0, 0) scale(1.06); }
  23.2% {
    opacity: 1; transform: translate(0, 0) scale(1);
    animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  }
  27.8% {
    opacity: 0.95;
    transform: translate(${FLY_DX}px, ${FLY_DY}px) scale(0.16);
  }
  29%, 100% {
    opacity: 0;
    transform: translate(${FLY_DX}px, ${FLY_DY}px) scale(0.14);
  }
}
`

function BoardBars({ accent }: { accent?: boolean }): JSX.Element {
  return (
    <>
      <span
        className={`cp-bar ${accent ? 'cp-bar-accent' : ''}`}
        style={{ left: 10, top: 10, width: accent ? 54 : 38, height: 7 }}
      />
      <span className="cp-bar" style={{ left: 10, top: 24, width: 92, height: 5 }} />
      <span
        className="cp-bar cp-bar-soft"
        style={{ left: 10, top: 33, width: 78, height: 5 }}
      />
      <span
        className="cp-bar cp-bar-soft"
        style={{ left: 10, top: 46, width: 34, height: 12 }}
      />
      <span
        className="cp-bar cp-bar-soft"
        style={{ left: 50, top: 46, width: 34, height: 12 }}
      />
      <span
        className="cp-bar cp-bar-soft"
        style={{ left: 108, top: 10, width: 34, height: 48 }}
      />
    </>
  )
}

function CreatePromptScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="cprompt"
      extraCss={PROMPT_CSS}
      backdrop={
        <>
          <div className="cp-canvas-label">landing-page.design</div>
          <div className="cp-board cp-board-a">
            <span className="cp-board-label">Hero</span>
            <BoardBars accent={true} />
          </div>
          <div className="cp-board cp-board-b">
            <span className="cp-board-label">Pricing</span>
            <BoardBars />
          </div>
          <MenuBar app="Design" menus={['File', 'Edit', 'Object']} />
          <WandTrail d={PROMPT_LOOP} />
          <div className="cp-flash" />
          <div className="cp-capture">
            <svg
              viewBox={`0 0 ${PROMPT_CARD.width} ${PROMPT_CARD.height}`}
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="cpFrameGrad"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2={PROMPT_CARD.width}
                  y2={PROMPT_CARD.height}
                >
                  <stop offset="0" stopColor="hsl(199, 100%, 72%)" />
                  <stop offset="0.5" stopColor="hsl(214, 100%, 60%)" />
                  <stop offset="1" stopColor="hsl(228, 100%, 56%)" />
                </linearGradient>
              </defs>
              <path
                d={FRAME_CORNERS}
                stroke="url(#cpFrameGrad)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <WandRider
            d={PROMPT_LOOP}
            hintLabel="Circle to capture"
            hintAt={{ left: 58, top: 232 }}
          />
        </>
      }
    />
  )
}

/* 3. EditTextScene */
const EDIT_CSS = `
${screenSurfaceCss('edit', '#ffffff')}
${MENU_BAR_CSS}
.edt-doc {
  position: absolute; top: 40px; left: 24px; right: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 10px; line-height: 1.45; color: #1e293b;
}
.edt-line--dim { color: #94a3b8; }
.edt-gap { height: 6px; }
.edt-target { position: relative; height: 19px; white-space: nowrap; font-size: 11px; font-weight: 500; }
.edt-sel {
  position: absolute; left: -2px; top: 1px; height: 17px;
  width: calc(var(--edt-aw, 130px) + 4px); border-radius: 2px;
  background: #b3d7ff;
  opacity: 0;
  animation: edtSel 9s linear infinite;
}
.edt-before {
  position: absolute; left: 0; top: 0; white-space: nowrap;
  opacity: 0; animation: edtBefore 9s linear infinite;
}
.edt-after {
  position: relative; display: inline-block; vertical-align: top;
  opacity: 1; animation: edtAfter 9s linear infinite;
}
.edt-caret {
  position: absolute; top: 2px; left: calc(var(--edt-aw, 130px) + 1px);
  width: 1.5px; height: 15px; background: #1b73e8;
  visibility: visible;
  animation: edtCaretShow 9s linear infinite, edtBlink 1.06s step-end infinite;
}
.edt-ibeam {
  position: absolute; left: 0; top: 0;
  transform: translateX(var(--edt-bw, 120px));
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.32));
  opacity: 0;
  animation: edtBeamX 9s linear infinite, edtBeamFade 9s linear infinite;
}
@keyframes edtSel {
  0%, 3.5% { width: 0; opacity: 1; animation-timing-function: cubic-bezier(0.3, 0.7, 0.3, 1); }
  11%, 37% { width: calc(var(--edt-bw, 120px) + 4px); opacity: 1; }
  41%, 46% { width: calc(var(--edt-aw, 130px) + 4px); opacity: 1; }
  52%, 100% { width: calc(var(--edt-aw, 130px) + 4px); opacity: 0; }
}
@keyframes edtBefore {
  0%, 1% { opacity: 0; }
  1.5%, 37% { opacity: 1; }
  41%, 100% { opacity: 0; }
}
@keyframes edtAfter {
  0%, 38.5% { opacity: 0; }
  42%, 100% { opacity: 1; }
}
@keyframes edtCaretShow {
  0%, 45% { visibility: hidden; }
  46%, 86% { visibility: visible; }
  86.5%, 100% { visibility: hidden; }
}
@keyframes edtBlink {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}
@keyframes edtBeamX {
  0%, 3.5% { transform: translateX(0); animation-timing-function: cubic-bezier(0.3, 0.7, 0.3, 1); }
  11%, 100% { transform: translateX(var(--edt-bw, 120px)); }
}
@keyframes edtBeamFade {
  0%, 1% { opacity: 0; }
  2.5%, 20% { opacity: 1; }
  25%, 100% { opacity: 0; }
}
`

function IBeam(): JSX.Element {
  return (
    <svg width="7" height="16" viewBox="0 0 7 16" aria-hidden="true">
      <path
        d="M2 1h3M2 15h3M3.5 1v14M0.5 1h2M0.5 15h2"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M1.6 1.4h3.8M1.6 14.6h3.8M3.5 1.4v13.2"
        stroke="#111114"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

function EditTextScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  const beforeRef = useRef<HTMLSpanElement>(null)
  const afterRef = useRef<HTMLSpanElement>(null)
  const [widths, setWidths] = useState({ before: 120, after: 135 })

  useLayoutEffect(() => {
    const bW = beforeRef.current?.offsetWidth ?? 120
    const aW = afterRef.current?.offsetWidth ?? 135
    setWidths({ before: bW, after: aW })
  }, [])

  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="edit"
      extraCss={EDIT_CSS}
      backdrop={
        <>
          <div className="edt-doc">
            <div className="edt-line edt-line--dim">
              Thanks for the update on the launch plan —
            </div>
            <div className="edt-line edt-line--dim">
              I went through the deck this morning and left a
            </div>
            <div className="edt-line edt-line--dim">few comments on the pricing slide.</div>
            <div className="edt-gap" />
            <div
              className="edt-target"
              style={
                {
                  ['--edt-bw' as string]: `${widths.before}px`,
                  ['--edt-aw' as string]: `${widths.after}px`
                } as CSSProperties
              }
            >
              <span className="edt-sel" />
              <span ref={beforeRef} className="edt-before">
                hey can u send the file
              </span>
              <span ref={afterRef} className="edt-after">
                Could you send the file?
              </span>
              <span className="edt-caret" />
              <span className="edt-ibeam">
                <IBeam />
              </span>
            </div>
            <div className="edt-gap" />
            <div className="edt-line edt-line--dim">Talk tomorrow,</div>
            <div className="edt-line edt-line--dim">Alex</div>
          </div>
          <MenuBar app="Mail" menus={['File', 'Edit', 'Format']} />
        </>
      }
    />
  )
}

/* 4. MusicScene */
const MUSIC_CSS = `
${MENU_BAR_CSS}
.asc-music .ids-query { padding: 0 16px; }
.msc-player {
  position: absolute; left: 50%; top: 156px;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 11px;
  width: 322px; padding: 10px 14px; box-sizing: border-box;
  border-radius: 15px;
  background: rgba(255,255,255,0.84);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow:
    0 6px 20px -10px rgba(15,23,42,0.34),
    inset 0 1px 0 rgba(255,255,255,0.5);
  z-index: 10;
}
.msc-stage {
  position: relative; flex: 1; min-width: 0; height: 40px; overflow: hidden;
}
.msc-track {
  position: absolute; inset: 0;
  display: flex; align-items: center; gap: 10px;
}
.msc-track--from { opacity: 0; animation: mscFrom 9s linear infinite; }
.msc-track--to { animation: mscTo 9s linear infinite; }
.msc-art {
  width: 34px; height: 34px; border-radius: 5px; flex: none;
  box-shadow: 0 2px 6px -2px rgba(15,23,42,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.28);
}
.msc-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.msc-title {
  font-size: 12.5px; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em;
  color: #0b0f19; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msc-artist {
  font-size: 10px; line-height: 1.2; color: rgba(15,23,42,0.6);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msc-controls { display: flex; align-items: center; gap: 9px; flex: none; color: rgba(15,23,42,0.72); }
.msc-btn { cursor: default; }
.msc-btn--next { animation: mscNext 9s linear infinite; transform-origin: center; }
.msc-bar {
  position: absolute; left: 14px; right: 14px; bottom: 4px; height: 2px;
  border-radius: 999px; background: rgba(15,23,42,0.08); overflow: hidden;
}
.msc-bar-fill {
  height: 100%; border-radius: 999px;
  background: #0b0f19;
  animation: mscBar 9s linear infinite;
}
@keyframes mscFrom {
  0%, 28% { opacity: 1; transform: translateX(0); animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
  31.5%, 100% { opacity: 0; transform: translateX(-30px); }
}
@keyframes mscTo {
  0%, 31.5% { opacity: 0; transform: translateX(30px); animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
  36%, 100% { opacity: 1; transform: translateX(0); }
}
@keyframes mscNext {
  0%, 25% { transform: scale(1); color: rgba(15,23,42,0.72); }
  27.5% { transform: scale(1.28); color: #0b0f19; }
  31%, 100% { transform: scale(1); color: rgba(15,23,42,0.72); }
}
@keyframes mscBar {
  0%, 28% { width: 62%; }
  29%, 30% { width: 2%; animation-timing-function: linear; }
  85%, 100% { width: 20%; }
}
`

function MusicScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="music"
      extraCss={MUSIC_CSS}
      backdrop={
        <>
          <MenuBar app="Spotify" menus={['File', 'Edit', 'View', 'Play']} />
          <div className="msc-player">
            <div className="msc-stage">
              <div className="msc-track msc-track--from">
                <span
                  className="msc-art"
                  style={{
                    background: 'linear-gradient(145deg, #4c5b8c, #8fa5c9)'
                  }}
                />
                <span className="msc-meta">
                  <span className="msc-title">Weightless</span>
                  <span className="msc-artist">Marconi Union</span>
                </span>
              </div>
              <div className="msc-track msc-track--to">
                <span
                  className="msc-art"
                  style={{
                    background: 'linear-gradient(145deg, #c2410c, #f5a742)'
                  }}
                />
                <span className="msc-meta">
                  <span className="msc-title">Golden Hour</span>
                  <span className="msc-artist">JVKE</span>
                </span>
              </div>
            </div>
            <div className="msc-controls">
              <svg className="msc-btn" width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M12 2v10L5 7ZM3.4 2h1.4v10H3.4Z" fill="currentColor" />
              </svg>
              <svg className="msc-btn" width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3.4 1.6h2.1v10.8H3.4ZM8.5 1.6h2.1v10.8H8.5Z" fill="currentColor" />
              </svg>
              <svg
                className="msc-btn msc-btn--next"
                width="11"
                height="11"
                viewBox="0 0 14 14"
                aria-hidden="true"
              >
                <path d="M2 2v10l7-5ZM9.2 2h1.4v10H9.2Z" fill="currentColor" />
              </svg>
            </div>
            <div className="msc-bar">
              <div className="msc-bar-fill" />
            </div>
          </div>
        </>
      }
    />
  )
}

/* 5. OpenAppScene */
const DOCK_TILES = [
  ['#5b8def', '#3567d6'],
  ['#57c07a', '#2f9d59'],
  ['#f0a63c', '#d9802a'],
  ['#8b5cf6', '#6d33e0'],
  ['#ef6f6c', '#d64545'],
  ['#4fb3d9', '#2b8db8'],
  ['#8e93a0', '#6b707c']
]
const LAUNCHED_INDEX = 3
const WIN_LEFT = 88
const WIN_TOP = 100
const WIN_W = 244
const WIN_H = 96
const TILE_X = 210
const TILE_Y = 214

const OPEN_APP_CSS = `
${MENU_BAR_CSS}
.asc-openapp .ids-query { padding: 0 16px; }
.oap-dock {
  position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
  display: flex; align-items: flex-end; gap: 7px;
  padding: 5px 7px; border-radius: 15px;
  background: rgba(240,242,248,0.42);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 0.5px solid rgba(255,255,255,0.5);
  box-shadow: 0 6px 18px -10px rgba(15,23,42,0.42);
  z-index: 10;
}
.oap-tile {
  width: 22px; height: 22px; border-radius: 6px;
  box-shadow: 0 1.5px 4px -1px rgba(15,23,42,0.4), inset 0 0.5px 0 rgba(255,255,255,0.35);
}
.oap-tile--launched { animation: oapBounce 9s linear infinite; }
.oap-dot {
  position: absolute; left: 50%; bottom: 1.5px; width: 3px; height: 3px;
  margin-left: -1.5px; border-radius: 999px; background: rgba(15,23,42,0.55);
  opacity: 1; animation: oapDot 9s linear infinite;
}
.oap-slot { position: relative; display: flex; }
.oap-win {
  position: absolute; left: ${WIN_LEFT}px; top: ${WIN_TOP}px;
  width: ${WIN_W}px; height: ${WIN_H}px;
  border-radius: 9px; overflow: hidden;
  background: #ffffff;
  box-shadow:
    0 18px 34px -18px rgba(9,18,35,0.55),
    0 3px 10px -6px rgba(9,18,35,0.34),
    0 0 0 0.5px rgba(15,23,42,0.14);
  transform-origin: ${TILE_X - WIN_LEFT}px ${TILE_Y - WIN_TOP}px;
  animation: oapWin 9s linear infinite;
  z-index: 12;
}
.oap-titlebar {
  display: flex; align-items: center; gap: 5px;
  height: 20px; padding: 0 8px;
  background: linear-gradient(180deg, #f6f6f8, #ececf0);
  border-bottom: 0.5px solid rgba(15,23,42,0.1);
}
.oap-light { width: 6px; height: 6px; border-radius: 999px; }
.oap-title {
  margin-left: 4px;
  font-size: 8.5px; font-weight: 600; letter-spacing: -0.004em;
  color: rgba(20,22,28,0.7);
}
.oap-canvas {
  position: relative; height: ${WIN_H - 20}px;
  background:
    linear-gradient(90deg, rgba(15,23,42,0.055) 0.5px, transparent 0.5px) 0 0 / 16px 16px,
    linear-gradient(180deg, rgba(15,23,42,0.055) 0.5px, transparent 0.5px) 0 0 / 16px 16px,
    #fbfbfd;
}
.oap-shape { position: absolute; border-radius: 4px; }
@keyframes oapBounce {
  0%, 25% { transform: translateY(0); animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1); }
  27.5% { transform: translateY(-11px); animation-timing-function: cubic-bezier(0.4, 0, 0.3, 1); }
  30%, 100% { transform: translateY(0); }
}
@keyframes oapDot {
  0%, 33% { opacity: 0; }
  36%, 85% { opacity: 1; }
  88.5%, 100% { opacity: 0; }
}
@keyframes oapWin {
  0%, 28% { opacity: 0; transform: scale(0.08); animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
  35%, 85% { opacity: 1; transform: scale(1); }
  88.5%, 100% { opacity: 0; transform: scale(0.96); }
}
`

function OpenAppScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="openapp"
      extraCss={OPEN_APP_CSS}
      backdrop={
        <>
          <MenuBar app="Finder" menus={['File', 'Edit', 'View', 'Go']} />
          <div className="oap-win">
            <div className="oap-titlebar">
              <span className="oap-light" style={{ background: '#ff5f57' }} />
              <span className="oap-light" style={{ background: '#febc2e' }} />
              <span className="oap-light" style={{ background: '#28c840' }} />
              <span className="oap-title">Figma — Untitled</span>
            </div>
            <div className="oap-canvas">
              <span
                className="oap-shape"
                style={{
                  left: 20,
                  top: 14,
                  width: 58,
                  height: 48,
                  background: '#8b5cf6',
                  opacity: 0.85
                }}
              />
              <span
                className="oap-shape"
                style={{
                  left: 88,
                  top: 14,
                  width: 52,
                  height: 22,
                  background: 'rgba(15,23,42,0.12)'
                }}
              />
              <span
                className="oap-shape"
                style={{
                  left: 88,
                  top: 42,
                  width: 40,
                  height: 20,
                  background: 'rgba(15,23,42,0.08)'
                }}
              />
              <span
                className="oap-shape"
                style={{
                  left: 152,
                  top: 14,
                  width: 70,
                  height: 20,
                  background: '#38bdf8',
                  opacity: 0.85
                }}
              />
            </div>
          </div>
          <div className="oap-dock">
            {DOCK_TILES.map(([from, to], i) => (
              <span key={from} className="oap-slot">
                <span
                  className={i === LAUNCHED_INDEX ? 'oap-tile oap-tile--launched' : 'oap-tile'}
                  style={{
                    background: `linear-gradient(160deg, ${from}, ${to})`
                  }}
                />
                {i === LAUNCHED_INDEX && <span className="oap-dot" />}
              </span>
            ))}
          </div>
        </>
      }
    />
  )
}

/* 6. RemindersScene */
const REMINDER_TILE_SQUIRCLE =
  'M17 0C3.75 0 0 3.75 0 17 0 30.25 3.75 34 17 34 30.25 34 34 30.25 34 17 34 3.75 30.25 0 17 0Z'

function ReminderTile({ size = 32 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient
          id="remTileGrad"
          x1="17"
          y1="0"
          x2="17"
          y2="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFB84D" />
          <stop offset="0.55" stopColor="#F28C00" />
          <stop offset="1" stopColor="#E07800" />
        </linearGradient>
        <radialGradient id="remTileSheen" cx="0.5" cy="0" r="1">
          <stop stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={REMINDER_TILE_SQUIRCLE} fill="url(#remTileGrad)" />
      <path d={REMINDER_TILE_SQUIRCLE} fill="url(#remTileSheen)" />
      <g transform="translate(6.5 6.5) scale(0.875)">
        <path
          fill="#FFFFFF"
          d="M12 2.75c-3.35 0-6.05 2.7-6.05 6.05 0 3.9-.95 5.9-1.9 7.05-.5.62-.08 1.65.85 1.65h14.2c.93 0 1.35-1.03.85-1.65-.95-1.15-1.9-3.15-1.9-7.05 0-3.35-2.7-6.05-6.05-6.05Z"
        />
        <path fill="#FFFFFF" fillOpacity="0.5" d="M9.75 19.5a2.25 2.25 0 0 0 4.5 0Z" />
      </g>
      <path
        d={REMINDER_TILE_SQUIRCLE}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
    </svg>
  )
}

const REMINDERS_CSS = `
${MENU_BAR_CSS}
.asc-reminders .ids-query { padding: 0 14px; }
.rms-clock { position: relative; display: block; width: 26px; height: 9px; }
.rms-clock span { position: absolute; right: 0; top: 0; white-space: nowrap; }
.rms-clock-before { opacity: 0; animation: rmsClockBefore 9s linear infinite; }
.rms-clock-after { opacity: 1; animation: rmsClockAfter 9s linear infinite; }
.rms-card {
  position: absolute; left: 50%; top: 122px;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 11px;
  width: 304px; padding: 10px 14px; box-sizing: border-box;
  border-radius: 16px;
  background: rgba(255,255,255,0.84);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow:
    0 6px 20px -10px rgba(15,23,42,0.34),
    inset 0 1px 0 rgba(255,255,255,0.5);
  animation: rmsCard 9s linear infinite;
  z-index: 10;
}
.rms-card-icon {
  display: flex; align-items: center; justify-content: center; flex: none;
  filter: drop-shadow(0 1.5px 3px rgba(0,0,0,0.26));
  animation: rmsBell 9s linear infinite;
}
.rms-card-copy {
  display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1;
}
.rms-card-meta {
  position: relative; height: 11px;
  font-size: 9.5px; line-height: 11px; letter-spacing: 0.002em;
  color: rgba(15,23,42,0.5);
}
.rms-meta-set, .rms-meta-now { position: absolute; left: 0; top: 0; white-space: nowrap; }
.rms-meta-set { opacity: 0; animation: rmsMetaSet 9s linear infinite; }
.rms-meta-now { color: #c2410c; font-weight: 600; opacity: 1; animation: rmsMetaNow 9s linear infinite; }
.rms-card-task {
  font-size: 13px; line-height: 1.2; font-weight: 560; letter-spacing: -0.01em;
  color: #0b0f19; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rms-card-when {
  flex: none; padding: 3px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.002em;
  background: rgba(242,140,0,0.16); color: #c2410c;
  animation: rmsWhen 9s linear infinite;
}
@keyframes rmsCard {
  0%, 26% {
    opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.94);
    animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  33%, 52% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  55% { opacity: 1; transform: translateX(-50%) translateY(-3px) scale(1.02); }
  58%, 85% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  88.5%, 100% { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.98); }
}
@keyframes rmsBell {
  0%, 53% { transform: rotate(0deg); }
  55% { transform: rotate(-13deg); }
  57% { transform: rotate(10deg); }
  59% { transform: rotate(-6deg); }
  61%, 100% { transform: rotate(0deg); }
}
@keyframes rmsMetaSet {
  0%, 52% { opacity: 1; }
  54.5%, 100% { opacity: 0; }
}
@keyframes rmsMetaNow {
  0%, 53% { opacity: 0; }
  55.5%, 100% { opacity: 1; }
}
@keyframes rmsWhen {
  0%, 52% { background: rgba(15,23,42,0.07); color: rgba(15,23,42,0.62); }
  55%, 100% { background: rgba(242,140,0,0.16); color: #c2410c; }
}
@keyframes rmsClockBefore {
  0%, 52% { opacity: 1; }
  54%, 100% { opacity: 0; }
}
@keyframes rmsClockAfter {
  0%, 53% { opacity: 0; }
  55%, 100% { opacity: 1; }
}
`

function RemindersScene({
  isDarkMode,
  copy
}: {
  isDarkMode: boolean
  copy: ActionCopy
}): JSX.Element {
  return (
    <ActionScene
      isDarkMode={isDarkMode}
      copy={copy}
      sceneKey="reminders"
      extraCss={REMINDERS_CSS}
      backdrop={
        <>
          <MenuBar
            app="Finder"
            menus={['File', 'Edit', 'View', 'Go']}
            clock={
              <span className="rms-clock">
                <span className="rms-clock-before">5:10</span>
                <span className="rms-clock-after">5:20</span>
              </span>
            }
          />
          <div className="rms-card">
            <span className="rms-card-icon">
              <ReminderTile size={32} />
            </span>
            <span className="rms-card-copy">
              <span className="rms-card-task">Stand up and stretch</span>
              <span className="rms-card-meta">
                <span className="rms-meta-set">Reminder set</span>
                <span className="rms-meta-now">It&apos;s time</span>
              </span>
            </span>
            <span className="rms-card-when">5:20 PM</span>
          </div>
        </>
      }
    />
  )
}

export function NativeActionScene({
  id,
  copy,
  isDarkMode
}: {
  id: AgentActionId
  copy: ActionCopy
  isDarkMode: boolean
}): JSX.Element {
  switch (id) {
    case 'insertText':
      return <AskScreenScene isDarkMode={isDarkMode} copy={copy} />
    case 'createPrompt':
      return <CreatePromptScene isDarkMode={isDarkMode} copy={copy} />
    case 'editText':
      return <EditTextScene isDarkMode={isDarkMode} copy={copy} />
    case 'controlPlayback':
      return <MusicScene isDarkMode={isDarkMode} copy={copy} />
    case 'openApp':
      return <OpenAppScene isDarkMode={isDarkMode} copy={copy} />
    case 'reminders':
      return <RemindersScene isDarkMode={isDarkMode} copy={copy} />
  }
}
