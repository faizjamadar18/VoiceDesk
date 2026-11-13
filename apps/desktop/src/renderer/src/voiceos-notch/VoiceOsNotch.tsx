/*
 * VoiceOsNotch - the exact VoiceOS notch surface.
 *
 * This is a faithful reconstruction of VoiceOS 0.1.40's `AgentNotch` surface
 * (bundle `out/renderer/assets/index-BKi3REhQ.js`, render root at ~270831-272715)
 * with every agent/backend concern stripped out. It owns ONLY the notch chrome:
 *
 *   - the surface box + its silhouette clip-path (`geometry.ts`)
 *   - the opaque veil layer that traces the silhouette
 *   - the top band with its left orb / right controls slots
 *   - the cloud-sphere orb and the morphing waveform
 *   - the expanded body slot (any Kestrel content)
 *   - the recording time-limit warning
 *   - the exact stylesheet (`getVoiceOsNotchStyleSheet`) and transition clocks
 *
 * It talks to no IPC, no network, and no store. Every visual value is the one
 * VoiceOS ships. The on-screen result on Windows is identical to VoiceOS's
 * renderer-drawn path, because on Windows VoiceOS also falls back to the
 * renderer (its native Liquid Glass material is macOS-only) - see
 * `getAgentNotchMotionOwner` (bundle 265816), which returns "renderer" whenever
 * the native material is unavailable.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  AGENT_ERROR_GLOW_COLOR,
  EXPANDED_SURFACE_CONTENT_BOTTOM_INSET_PX,
  EXPANDED_SURFACE_CONTENT_INSET_PX,
  EXPANDED_SURFACE_CONTENT_TOP_INSET_PX,
  NOTCH_AGENT_ORB_SIZE_PX,
  NOTCH_BAND_EDGE_INSET_PX,
  NOTCH_BAND_SIDE_SLOT_HEIGHT_PX,
  NOTCH_BAND_SIDE_SLOT_WIDTH_PX,
  NOTCH_COLLAPSED_WIDTH_PX,
  NOTCH_COMPACT_BAND_WIDTH_PX,
  NOTCH_EXPANDED_BODY_WIDTH_PX,
  NOTCH_HOVER_AFFORDANCE_GROW_PX,
  NOTCH_HOVER_AFFORDANCE_WIDEN_PX,
  NOTCH_IDLE_CONTENT_HEIGHT_PX,
  NOTCH_IDLE_REST_HEIGHT_PX,
  NOTCH_IDLE_WIDTH_PX,
  NOTCH_RECORDING_BAND_HEIGHT_PX,
  NOTCH_TOP_BAND_HEIGHT_PX,
  getAgentNotchSurfaceShadow,
  getNotchSilhouetteGeometry,
  getNotchSilhouetteRadii,
  getNotchSizeTransition,
  getNotchTransitionTiming,
  rgbaWithAlpha,
  buildNotchClipPath
} from "./geometry";
import { getVoiceOsNotchStyleSheet } from "./voiceos-notch-styles";
import {
  AgentThinkingOrb,
  MorphingOrbWaveform,
  VoiceVolumePulse
} from "./orb";
import {
  AGENT_RECORDING_TIME_LIMIT_WARNING_HEIGHT_PX
} from "./sound";
import { getAgentVoiceCustomIcon, getAgentVoiceOptionById } from "./voices";

export type VoiceOsNotchMode =
  | "hidden"
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "error";

export interface VoiceOsNotchProps {
  /** High-level surface state, mapped from Kestrel's NotchPhase. */
  mode: VoiceOsNotchMode;
  /** Whether the surface is grown to its expanded body. */
  expanded?: boolean;
  /** Pointer is over the resting sliver (drives the hover affordance). */
  hovered?: boolean;
  /** Live microphone level 0..1, read by the waveform each frame. */
  volumeRef?: { current: number };
  /** Agent voice persona id (see `voices.ts`). */
  voiceId?: string;
  /** Agent voice enabled (drives the switch + mute icon). */
  agentVoiceEnabled?: boolean;
  /** The answer is being spoken aloud (drives the orb pulse). */
  speaking?: boolean;
  /** Show the right-side stop control (agent working / speaking). */
  showCancel?: boolean;
  onCancel?: () => void;
  /** Click on the resting sliver. */
  onActivate?: () => void;
  /** Toggle the agent voice from the right slot. */
  onToggleVoice?: () => void;
  /** Recording countdown seconds (20-minute cap). Null hides the warning. */
  remainingSeconds?: number | null;
  /** Reports the rendered surface size so the host can set its hit region. */
  onGeometryChange?: (geometry: { width: number; height: number }) => void;
  /** The expanded body: any Kestrel content. */
  children?: ReactNode;
}

/** Agent voice muted glyph - AgentVoiceMutedIcon (bundle 268124-268150). */
function AgentVoiceMutedIcon({ size = 11 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.4 6.1h2.3l3.1-2.7v9.2L4.7 9.9H2.4V6.1z"
        fill="currentColor"
      />
      <path
        d="M10.4 6.4l3.2 3.2m0-3.2l-3.2 3.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AgentVoiceUnmutedIcon({ size = 11 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.4 6.1h2.3l3.1-2.7v9.2L4.7 9.9H2.4V6.1z"
        fill="currentColor"
      />
      <path
        d="M10.6 5.8a3.4 3.4 0 0 1 0 4.4M12.4 4.2a5.7 5.7 0 0 1 0 7.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** AgentRecordingTimeLimitWarning - bundle 263801-263833. */
function AgentRecordingTimeLimitWarning({
  remainingSeconds
}: {
  remainingSeconds: number;
}): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        height: AGENT_RECORDING_TIME_LIMIT_WARNING_HEIGHT_PX,
        flexShrink: 0,
        padding: "6px 14px",
        boxSizing: "border-box",
        textAlign: "center",
        color: "#fbbf24",
        fontSize: 12,
        lineHeight: "20px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none"
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0
        }}
      >
        Recording has a 20 minute limit. It will end and send in one minute.
      </span>
      <span aria-hidden="true">
        {`20 min limit · sending in ${remainingSeconds}s`}
      </span>
    </div>
  );
}

export function VoiceOsNotch({
  mode,
  expanded = false,
  hovered = false,
  volumeRef,
  voiceId,
  agentVoiceEnabled = true,
  speaking = false,
  showCancel = false,
  onCancel,
  onActivate,
  onToggleVoice,
  remainingSeconds = null,
  onGeometryChange,
  children
}: VoiceOsNotchProps): ReactNode {
  const isExpanded = expanded;
  const isHidden = mode === "hidden";
  const isIdle = mode === "idle";
  const isListening = mode === "listening";
  const isThinking = mode === "thinking";
  const isResponding = mode === "responding";
  const isError = mode === "error";

  /** Measured height of the expanded body, fed to the surface silhouette. */
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);

  /*
   * Windows has no hardware notch, so `displayHasNotch` is false and every
   * scaled* value collapses to the base constant. `liquidGlassActive` is also
   * false (no native material), which is why the resting sliver uses the opaque
   * 4px height rather than the 5.5px glass height, and why the surface veil is
   * painted opaque #000. This is exactly what VoiceOS does on Windows.
   */
  const displayHasNotch = false;
  const liquidGlassActive = false;

  const isRestingIdleNotch = isIdle && !isExpanded;
  const isBareIdleSurface = isRestingIdleNotch && !displayHasNotch;
  const collapsedNotchHidden = false;

  const hoverWidenApplied = hovered && isIdle && !isExpanded;
  const hoverGrowApplied = hoverWidenApplied;

  const bareIdleRestHeight = liquidGlassActive
    ? 5.5
    : NOTCH_IDLE_REST_HEIGHT_PX;

  const surfaceWidth = (() => {
    if (isHidden) return NOTCH_COLLAPSED_WIDTH_PX;
    if (isExpanded) return NOTCH_EXPANDED_BODY_WIDTH_PX;
    if (isListening || isThinking || isResponding || isError)
      return NOTCH_COMPACT_BAND_WIDTH_PX;
    // idle
    return NOTCH_IDLE_WIDTH_PX + (hoverWidenApplied ? NOTCH_HOVER_AFFORDANCE_WIDEN_PX : 0);
  })();

  const bandHeight = (() => {
    if (isExpanded) return NOTCH_TOP_BAND_HEIGHT_PX;
    if (isListening || isThinking || isResponding || isError)
      return NOTCH_RECORDING_BAND_HEIGHT_PX;
    const base = isBareIdleSurface ? bareIdleRestHeight : NOTCH_IDLE_CONTENT_HEIGHT_PX;
    return base + (hoverGrowApplied ? NOTCH_HOVER_AFFORDANCE_GROW_PX : 0);
  })();

  const showRecordingTimeLimitWarning =
    isListening && remainingSeconds !== null && remainingSeconds > 0;

  const surfaceMinHeight = (() => {
    if (isHidden) return NOTCH_TOP_BAND_HEIGHT_PX;
    if (showRecordingTimeLimitWarning)
      return NOTCH_RECORDING_BAND_HEIGHT_PX + AGENT_RECORDING_TIME_LIMIT_WARNING_HEIGHT_PX;
    if (isExpanded) return NOTCH_TOP_BAND_HEIGHT_PX;
    if (isListening || isThinking || isResponding || isError)
      return NOTCH_RECORDING_BAND_HEIGHT_PX;
    // idle
    const base = isBareIdleSurface
      ? bareIdleRestHeight
      : NOTCH_IDLE_CONTENT_HEIGHT_PX;
    return base + (hoverGrowApplied ? NOTCH_HOVER_AFFORDANCE_GROW_PX : 0);
  })();

  const notchViewportMaxHeight =
    typeof window === "undefined"
      ? 800
      : Math.max(0, window.innerHeight - 20);

  const surfaceHeight = Math.min(
    Math.max(
      surfaceMinHeight + (isExpanded ? expandedContentHeight : 0),
      0
    ),
    notchViewportMaxHeight
  );

  const silhouette = getNotchSilhouetteGeometry(surfaceWidth, surfaceHeight);
  const visualSurfaceWidth = silhouette.visualWidth;
  const radii = getNotchSilhouetteRadii(visualSurfaceWidth, surfaceHeight);
  const clipPath = buildNotchClipPath(visualSurfaceWidth, surfaceHeight);

  const isActiveSurface = surfaceWidth > NOTCH_IDLE_WIDTH_PX;
  const surfaceShadow = getAgentNotchSurfaceShadow({
    collapsedNotchHidden,
    isBareIdleSurface,
    isActiveSurface
  });

  // On Windows the renderer owns motion, so the veil and box share the morph.
  const notchTransitionTiming = getNotchTransitionTiming(isExpanded, false);
  const rendererGeometryTransition = getNotchSizeTransition(
    notchTransitionTiming.durationMs,
    notchTransitionTiming.easing
  );
  const activeNotchSilhouetteTransition = `clip-path ${notchTransitionTiming.durationMs}ms ${notchTransitionTiming.easing}, -webkit-clip-path ${notchTransitionTiming.durationMs}ms ${notchTransitionTiming.easing}, opacity 0ms linear`;

  const agentVoice = getAgentVoiceOptionById(voiceId);
  const customIcon = voiceId ? getAgentVoiceCustomIcon(voiceId) : undefined;
  const glowColor = isError ? AGENT_ERROR_GLOW_COLOR : agentVoice.glowColor;
  /** VoiceOS pulses the orb while the agent is speaking (bundle ~253784). */
  const orbActive = isResponding || speaking;

  // deriveAgentNotchActivity (bundle 263841-263849): waveform > loading > orb.
  const indicator: "orb" | "waveform" | "loading" = isListening
    ? "waveform"
    : isThinking
      ? "loading"
      : "orb";
  const showLeftOrb = !isIdle || hovered || isExpanded;

  const previousHoveredRef = useRef(false);
  useEffect(() => {
    previousHoveredRef.current = hovered;
  }, [hovered]);

  /*
   * Expanded-body measurement. VoiceOS measures the laid-out body and feeds its
   * height to the surface silhouette (bundle `expandedContentTargetHeight`,
   * ~270336). We do the same: observe the inner content column, whose height is
   * `auto` and therefore independent of the surface height (no feedback loop),
   * then add the column's own vertical padding back in.
   */
  const expandedBodyContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = expandedBodyContentRef.current;
    if (!node) return;
    const measure = (): void => {
      setExpandedContentHeight(
        node.offsetHeight +
          EXPANDED_SURFACE_CONTENT_TOP_INSET_PX +
          EXPANDED_SURFACE_CONTENT_BOTTOM_INSET_PX
      );
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    onGeometryChange?.({ width: visualSurfaceWidth, height: surfaceHeight });
  }, [onGeometryChange, visualSurfaceWidth, surfaceHeight]);

  const surfaceStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: `${visualSurfaceWidth}px`,
    height: `${surfaceHeight}px`,
    maxHeight: "calc(100vh - 20px)",
    color: "rgba(255,255,255,0.92)",
    pointerEvents: "auto",
    animation: "agent-notch-fade-in 160ms ease-out forwards",
    transition: rendererGeometryTransition,
    overflow: "visible"
  };

  const contentStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: `${surfaceWidth}px`,
    height: `${surfaceHeight}px`,
    maxHeight: "calc(100vh - 20px)",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    borderBottomLeftRadius: `${radii.x}px ${radii.y}px`,
    borderBottomRightRadius: `${radii.x}px ${radii.y}px`,
    background: undefined,
    transition: rendererGeometryTransition,
    overflow: "hidden"
  };

  const bandStyle: CSSProperties = {
    position: "relative",
    height: `${bandHeight}px`,
    display: "flex",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: NOTCH_BAND_EDGE_INSET_PX,
    paddingRight: NOTCH_BAND_EDGE_INSET_PX,
    paddingBottom: 0,
    boxSizing: "border-box",
    gap: 10,
    flexShrink: 0,
    transition: rendererGeometryTransition
  };

  const expandedBottomInsetPx = EXPANDED_SURFACE_CONTENT_BOTTOM_INSET_PX;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none"
      }}
    >
      <style>
        {getVoiceOsNotchStyleSheet(
          notchTransitionTiming.durationMs,
          notchTransitionTiming.easing
        )}
      </style>
      <div
        data-agent-notch-geometry-key={`${surfaceWidth}|${visualSurfaceWidth}|${surfaceHeight}|${bandHeight}`}
        onClick={
          isIdle && onActivate
            ? () => {
                onActivate();
              }
            : undefined
        }
        style={surfaceStyle}
      >
        {/* Shadow layer + opaque veil, clipped to the silhouette. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            filter: surfaceShadow,
            transition: rendererGeometryTransition,
            willChange: "filter"
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: collapsedNotchHidden ? "transparent" : "#000",
              opacity: 1,
              boxShadow: "none",
              clipPath,
              WebkitClipPath: clipPath,
              transition: activeNotchSilhouetteTransition,
              willChange: "opacity"
            }}
          />
        </div>

        <div
          data-popover-boundary
          data-popover-inset-top={bandHeight}
          data-popover-inset-bottom={radii.y}
          className={isExpanded ? "agent-notch-content-focus-layer" : undefined}
          style={contentStyle}
        >
          {/* ---- Top band ---- */}
          <div style={bandStyle}>
            {/* Right controls slot (first child in a row-reverse band). */}
            <div
              style={{
                position: "relative",
                width: NOTCH_BAND_SIDE_SLOT_WIDTH_PX,
                height: NOTCH_BAND_SIDE_SLOT_HEIGHT_PX,
                flexShrink: 0,
                transition: "opacity 180ms ease",
                pointerEvents: "none"
              }}
            >
              {showCancel && (
                <button
                  type="button"
                  className="agent-notch-request-cancel"
                  aria-label="Stop"
                  aria-keyshortcuts="Escape"
                  title="Escape to stop"
                  data-agent-notch-skip-focus
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancel?.();
                  }}
                  style={{
                    right: 0,
                    opacity: 1,
                    pointerEvents: "auto"
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 10 10"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect width="10" height="10" rx="2" />
                  </svg>
                  <span
                    className="agent-notch-request-cancel-tooltip"
                    aria-hidden="true"
                  >
                    esc
                  </span>
                </button>
              )}
            </div>

            {/* Centre spacer. */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 0
              }}
            />

            {/* Left slot placeholder. */}
            <div
              style={{
                width: NOTCH_BAND_SIDE_SLOT_WIDTH_PX,
                height: NOTCH_BAND_SIDE_SLOT_HEIGHT_PX,
                flexShrink: 0
              }}
            />

            {/* Orb / waveform / loading, pinned to the left edge. */}
            <div
              className="agent-notch-voice-control"
              data-agent-notch-skip-focus
              data-enabled={onToggleVoice ? true : undefined}
              style={{
                position: "absolute",
                left: 9,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.95)",
                opacity: showLeftOrb ? 1 : 0,
                pointerEvents: onToggleVoice ? "auto" : "none",
                cursor: onToggleVoice ? "pointer" : "default",
                transition: "opacity 260ms ease, transform 120ms ease",
                zIndex: 3
              }}
            >
              <button
                type="button"
                className="agent-notch-voice-toggle-button"
                disabled={!onToggleVoice}
                aria-hidden={!onToggleVoice}
                aria-label={
                  agentVoiceEnabled ? "Mute agent voice" : "Unmute agent voice"
                }
                aria-pressed={!agentVoiceEnabled}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={onToggleVoice}
              >
                <div
                  style={{
                    position: "relative",
                    width: NOTCH_AGENT_ORB_SIZE_PX,
                    height: NOTCH_AGENT_ORB_SIZE_PX,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {/* Voice-reactive glow halo. */}
                  <div
                    style={{
                      position: "absolute",
                      inset: orbActive ? -10 : -9,
                      borderRadius: "50%",
                      background: `radial-gradient(circle at center, ${rgbaWithAlpha(
                        glowColor,
                        isError ? 0.55 : orbActive ? 0.28 : 0.2
                      )} 0%, ${rgbaWithAlpha(
                        glowColor,
                        isError ? 0.32 : orbActive ? 0.16 : 0.11
                      )} 30%, ${rgbaWithAlpha(
                        glowColor,
                        isError ? 0.13 : orbActive ? 0.07 : 0.04
                      )} 55%, transparent 78%)`,
                      filter: `blur(${orbActive ? 4 : 3}px)`,
                      opacity:
                        indicator === "orb" && (orbActive || isError) ? 1 : 0,
                      animation:
                        indicator === "orb" && (orbActive || isError)
                          ? orbActive
                            ? "agent-notch-voice-avatar-pulse-speaking 2.6s ease-in-out infinite"
                            : "agent-notch-voice-avatar-pulse 2.6s ease-in-out infinite"
                          : "none",
                      transition: "opacity 180ms ease",
                      pointerEvents: "none"
                    }}
                  />
                  <MorphingOrbWaveform
                    mode={indicator}
                    size={NOTCH_AGENT_ORB_SIZE_PX}
                    waveColor="#ffffff"
                    orbColor={glowColor}
                    volumeRef={volumeRef}
                    orbContent={
                      <VoiceVolumePulse
                        volumeRef={volumeRef ?? { current: 0 }}
                        active={orbActive}
                      >
                        <AgentThinkingOrb
                          size={NOTCH_AGENT_ORB_SIZE_PX}
                          animation="none"
                          cloudTone={agentVoice.cloudTone}
                          customIcon={customIcon}
                        />
                      </VoiceVolumePulse>
                    }
                  />
                </div>
              </button>
              {onToggleVoice && (
                <button
                  type="button"
                  role="switch"
                  className="agent-notch-voice-switch"
                  aria-label="Agent voice"
                  aria-checked={agentVoiceEnabled}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={onToggleVoice}
                >
                  <span className="agent-notch-voice-switch-thumb">
                    {agentVoiceEnabled ? (
                      <AgentVoiceUnmutedIcon size={11} />
                    ) : (
                      <AgentVoiceMutedIcon size={11} />
                    )}
                  </span>
                </button>
              )}
            </div>
          </div>

          {showRecordingTimeLimitWarning && (
            <AgentRecordingTimeLimitWarning
              remainingSeconds={remainingSeconds ?? 0}
            />
          )}

          {/* ---- Expanded body ---- */}
          <div
            style={{
              boxSizing: "border-box",
              height: isExpanded ? `${expandedContentHeight}px` : undefined,
              padding: `${EXPANDED_SURFACE_CONTENT_TOP_INSET_PX}px ${EXPANDED_SURFACE_CONTENT_INSET_PX}px ${expandedBottomInsetPx}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? "translateY(0)" : "translateY(-4px)",
              overflowX: "hidden",
              overflowY: isExpanded ? "auto" : "hidden",
              minHeight: 0,
              pointerEvents: isExpanded ? "auto" : "none",
              transition: `opacity ${notchTransitionTiming.durationMs}ms ${notchTransitionTiming.easing}, transform ${notchTransitionTiming.durationMs}ms ${notchTransitionTiming.easing}`
            }}
          >
            <div
              ref={expandedBodyContentRef}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                gap: EXPANDED_SURFACE_CONTENT_INSET_PX,
                width: `${
                  NOTCH_EXPANDED_BODY_WIDTH_PX -
                  EXPANDED_SURFACE_CONTENT_INSET_PX * 2
                }px`
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VoiceOsNotch;
