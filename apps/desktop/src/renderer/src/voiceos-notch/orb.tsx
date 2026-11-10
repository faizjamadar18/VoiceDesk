/*
 * VoiceOS notch orb + waveform - VERBATIM PORT.
 *
 * Source: VoiceOS 0.1.40 `out/renderer/assets/index-BKi3REhQ.js`
 *   - AgentThinkingOrb     @ 167808-167907
 *   - VoiceVolumePulse     @ 253777-253814
 *   - MorphingOrbWaveform  @ 201243-201475
 *   - animation constants  @ 201199-201228 (kept in geometry.ts)
 *
 * These are the three renderer-drawn pieces that make the orb: the cloud-sphere
 * itself, the imperatively-scaled wrapper that breathes with the agent's voice,
 * and the morphing waveform that collapses into the orb while listening. This is
 * why the "liquid glass" look renders identically on Windows - it is all DOM +
 * CSS + canvas-free math, no macOS-only native material.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BOUNCE_CONSTANTS,
  DOT_GREY_FLOOR,
  DOT_HOP_PERIOD_MS,
  DOT_HOP_STAGGER,
  DOT_SQUASH_MAX,
  DOT_STRETCH_MAX,
  LOADING_HOLD_MS,
  WAVE_MAX_BAR_H,
  WAVE_MIN_BAR_H,
  WAVE_TICK_MS,
  WAVEFORM_BAR_COUNT,
  WAVEFORM_BAR_GAP_PX,
  WAVEFORM_BAR_WIDTH_PX,
  WAVEFORM_WIDTH_PX,
  bounceHeight,
  bounceSquash,
  clamp01,
  fract,
  lerp,
  parseRgb
} from "./geometry";
import lensOverlay from "./assets/lens.png";
import { getAgentVoiceCloudImage } from "./voices";

const BOUNCE_MAX_SPEED = BOUNCE_CONSTANTS.BOUNCE_MAX_SPEED;

export interface AgentThinkingOrbProps {
  animation?: string;
  size?: number;
  cloudTone?: string;
  customIcon?: string;
}

/** AgentThinkingOrb - 167808. */
export function AgentThinkingOrb({
  animation = "cloud-sphere-spin 2s ease-in-out infinite",
  size = 16,
  cloudTone = "blue",
  customIcon
}: AgentThinkingOrbProps): ReactNode {
  return (
    <div
      style={{
        position: "relative",
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0
      }}
    >
      {customIcon ? (
        <img
          src={customIcon}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.35), 0 0 2px rgba(0, 0, 0, 0.2)",
            pointerEvents: "none"
          }}
        />
      ) : (
        <>
          <div
            className="cloud-viewport"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${getAgentVoiceCloudImage(cloudTone)})`,
              boxShadow:
                "0 2px 6px rgba(0, 0, 0, 0.35), 0 0 2px rgba(0, 0, 0, 0.2), inset 0 2px 3px rgba(255, 255, 255, 0.35), inset 0 -2px 3px rgba(0, 0, 0, 0.2)",
              animation
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse 70% 50% at 40% 25%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
              pointerEvents: "none"
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse 60% 30% at 55% 80%, rgba(200,230,255,0.2) 0%, transparent 70%)",
              pointerEvents: "none"
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              boxShadow:
                "inset 0 0 4px rgba(210, 235, 255, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.3), inset 0 -1px 2px rgba(0, 0, 0, 0.15)",
              border: "0.5px solid rgba(255, 255, 255, 0.25)",
              pointerEvents: "none"
            }}
          />
          <img
            src={lensOverlay}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none"
            }}
          />
        </>
      )}
    </div>
  );
}

export interface VoiceVolumePulseProps {
  volumeRef: { current: number };
  active: boolean;
  scaleAmount?: number;
  children: ReactNode;
}

/** VoiceVolumePulse - 253777. */
export function VoiceVolumePulse({
  volumeRef,
  active,
  scaleAmount = 0.18,
  children
}: VoiceVolumePulseProps): ReactNode {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (!active) {
      node.style.transform = "scale(1)";
      return;
    }
    let rafId = 0;
    const tick = (): void => {
      const current = nodeRef.current;
      if (current) {
        const volume = Math.min(1, Math.max(0, volumeRef.current || 0));
        current.style.transform = `scale(${1 + volume * scaleAmount})`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, scaleAmount, volumeRef]);
  return (
    <div
      ref={nodeRef}
      style={{
        display: "flex",
        transform: "scale(1)",
        transition: "transform 90ms ease-out"
      }}
    >
      {children}
    </div>
  );
}

type OrbIndicatorMode = "orb" | "waveform" | "loading";

interface WaveElem {
  heightPx: number;
  tyPx: number;
  sx: number;
  sy: number;
  level: number;
  glow: number;
}

export interface MorphingOrbWaveformProps {
  mode: OrbIndicatorMode;
  volume?: number;
  size?: number;
  waveColor?: string;
  orbColor?: string;
  orbContent?: ReactNode;
  /** Kestrel feeds mic level here instead of VoiceOS's IPC volume event. */
  volumeRef?: { current: number };
}

/**
 * MorphingOrbWaveform - 201243.
 *
 * VoiceOS subscribes to its `volume-update` IPC to drive `volumeRef`. Kestrel
 * passes an optional `volumeRef` directly so no IPC wiring is required, while
 * `volume` still works for a fixed value.
 */
export function MorphingOrbWaveform({
  mode,
  volume,
  size = 18,
  waveColor = "#ffffff",
  orbColor = "rgba(79,140,255,1)",
  orbContent,
  volumeRef: externalVolumeRef
}: MorphingOrbWaveformProps): ReactNode {
  const containerW = Math.max(WAVEFORM_WIDTH_PX, size);
  const orbCss = useMemo(() => {
    const m = orbColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : orbColor;
  }, [orbColor]);
  const modeRef = useRef(mode);
  const sizeRef = useRef(size);
  const internalVolumeRef = useRef(0);
  const volumeRef = externalVolumeRef ?? internalVolumeRef;
  const waveHeightsRef = useRef<number[]>(
    Array(WAVEFORM_BAR_COUNT).fill(WAVE_MIN_BAR_H)
  );
  const smoothedRef = useRef(0);
  const elemsRef = useRef<WaveElem[]>(
    Array.from({ length: WAVEFORM_BAR_COUNT }, () => ({
      heightPx: WAVE_MIN_BAR_H,
      tyPx: 0,
      sx: 1,
      sy: 1,
      level: 0,
      glow: 0
    }))
  );
  const loadEnvelopeRef = useRef(0);
  const lastLoadingAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [, setRenderTick] = useState(0);
  modeRef.current = mode;
  sizeRef.current = size;
  if (typeof volume === "number" && Number.isFinite(volume)) {
    volumeRef.current = volume;
  }
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const ensureRunningRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let last = performance.now();
    let waveLast = last;
    const tick = (): void => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const recording = modeRef.current === "waveform";
      const raw = recording ? volumeRef.current : 0;
      const GATE = 0.012;
      const gated = raw > GATE ? raw - GATE : 0;
      const rooted = gated > 0 ? Math.sqrt(gated) : 0;
      const KNEE = 0.08;
      const compressed = rooted < KNEE ? (rooted * rooted) / KNEE : rooted;
      const alpha = compressed > smoothedRef.current ? 0.45 : 0.14;
      smoothedRef.current += (compressed - smoothedRef.current) * alpha;
      const vol = smoothedRef.current;
      let waveUpdated = false;
      if (now - waveLast >= WAVE_TICK_MS) {
        const baseScale = Math.min(1, vol * 2.4);
        const jitter = vol > 0 ? 0.85 + Math.random() * 0.3 : 1;
        const scale = Math.min(1, baseScale * jitter);
        const newH = WAVE_MIN_BAR_H + scale * (WAVE_MAX_BAR_H - WAVE_MIN_BAR_H);
        const buf = waveHeightsRef.current;
        for (let i = 0; i < buf.length - 1; i++) buf[i] = buf[i + 1];
        buf[buf.length - 1] = newH;
        waveLast = now;
        waveUpdated = true;
      }
      if (modeRef.current === "loading") lastLoadingAtRef.current = now;
      const envTarget =
        recording
          ? 0
          : modeRef.current === "loading" ||
              now - lastLoadingAtRef.current < LOADING_HOLD_MS
            ? 1
            : 0;
      loadEnvelopeRef.current +=
        (envTarget - loadEnvelopeRef.current) * Math.min(1, dt / 180);
      const env = loadEnvelopeRef.current;
      const buf = waveHeightsRef.current;
      const sizePx = sizeRef.current;
      const elems = elemsRef.current;
      const dp = 1e-3;
      let barsActive = false;
      for (let i = 0; i < elems.length; i++) {
        const barH = buf[buf.length - 1 - i];
        if (barH > WAVE_MIN_BAR_H + 0.3) barsActive = true;
        const tBar = clamp01(
          (barH - WAVE_MIN_BAR_H) / (WAVE_MAX_BAR_H - WAVE_MIN_BAR_H)
        );
        const waveLevel = Math.pow(tBar, 1.5);
        const phase = fract(now / DOT_HOP_PERIOD_MS - i * DOT_HOP_STAGGER);
        const h = bounceHeight(phase);
        const speed =
          (bounceHeight(fract(phase + dp)) - bounceHeight(fract(phase - dp))) /
          (2 * dp);
        const stretch = clamp01(Math.abs(speed) / BOUNCE_MAX_SPEED);
        const squash = bounceSquash(phase);
        const rawSy = 1 + DOT_STRETCH_MAX * stretch - DOT_SQUASH_MAX * squash;
        const rawSx =
          1 - DOT_STRETCH_MAX * stretch * 0.6 + DOT_SQUASH_MAX * squash * 0.85;
        const e = elems[i];
        e.heightPx = lerp(barH, WAVEFORM_BAR_WIDTH_PX, env);
        e.tyPx = -0.24 * sizePx * h * env;
        e.sx = lerp(1, rawSx, env);
        e.sy = lerp(1, rawSy, env);
        e.level = lerp(waveLevel, h, env);
        e.glow = env * h;
      }
      const stillAnimating = recording || env > 2e-3 || vol > 2e-3 || barsActive;
      const needsPerFrameRender =
        env > 2e-3 || Math.abs(envTarget - env) > 2e-3;
      if (waveUpdated || needsPerFrameRender) {
        setRenderTick((x) => (x + 1) % 1e6);
      }
      if (stillAnimating || modeRef.current === "loading") {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
      }
    };
    const ensureRunning = (): void => {
      if (disposed || runningRef.current) return;
      runningRef.current = true;
      last = performance.now();
      waveLast = last;
      rafRef.current = requestAnimationFrame(tick);
    };
    ensureRunningRef.current = ensureRunning;
    ensureRunning();
    return () => {
      disposed = true;
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    ensureRunningRef.current();
  }, [mode]);

  const elems = elemsRef.current;
  const [waveR, waveG, waveB] = useMemo(() => parseRgb(waveColor), [waveColor]);
  const colorForLevel = (level: number): string => {
    const t = clamp01(level);
    const r = Math.round(DOT_GREY_FLOOR + t * (waveR - DOT_GREY_FLOOR));
    const g = Math.round(DOT_GREY_FLOOR + t * (waveG - DOT_GREY_FLOOR));
    const b = Math.round(DOT_GREY_FLOOR + t * (waveB - DOT_GREY_FLOOR));
    return `rgb(${r}, ${g}, ${b})`;
  };
  const layer = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    willChange: "opacity, transform"
  } as const;
  const FADE =
    "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1), transform 280ms cubic-bezier(0.4, 0, 0.2, 1)";
  const isOrb = mode === "orb";
  return (
    <div
      style={{
        position: "relative",
        width: `${containerW}px`,
        height: `${size}px`,
        flexShrink: 0,
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          ...layer,
          opacity: isOrb ? 0 : 1,
          transform: `scale(${isOrb ? 0.85 : 1})`,
          transition: FADE
        }}
        aria-hidden="true"
      >
        {elems.map((e, i) => (
          <div
            key={i}
            style={{
              width: `${WAVEFORM_BAR_WIDTH_PX}px`,
              height: `${e.heightPx.toFixed(2)}px`,
              margin: `0 ${WAVEFORM_BAR_GAP_PX}px`,
              borderRadius:
                e.heightPx <= WAVEFORM_BAR_WIDTH_PX
                  ? "50%"
                  : `${WAVEFORM_BAR_WIDTH_PX / 2}px`,
              background: colorForLevel(e.level),
              transform: `translateY(${e.tyPx.toFixed(2)}px) scale(${e.sx.toFixed(
                3
              )}, ${e.sy.toFixed(3)})`,
              boxShadow:
                e.glow > 0.04
                  ? `0 0 ${(3 * e.glow).toFixed(2)}px rgba(255, 255, 255, ${(
                      0.4 * e.glow
                    ).toFixed(3)})`
                  : "none",
              transition: "height 60ms linear, background 80ms linear",
              willChange: "transform, height"
            }}
          />
        ))}
      </div>
      <div
        style={{
          ...layer,
          opacity: isOrb ? 1 : 0,
          transform: `scale(${isOrb ? 1 : 0.75})`,
          transition: FADE
        }}
      >
        {orbContent ?? (
          <div
            style={{
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: "50%",
              background: orbCss
            }}
          />
        )}
      </div>
    </div>
  );
}
