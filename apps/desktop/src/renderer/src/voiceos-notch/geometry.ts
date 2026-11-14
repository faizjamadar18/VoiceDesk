/*
 * VoiceOS notch geometry - VERBATIM PORT.
 *
 * Every constant and formula below is copied from VoiceOS 0.1.40
 * `out/renderer/assets/index-BKi3REhQ.js` (the minified Vite production bundle
 * of the renderer). Line references are to that bundle so the values can be
 * re-audited against the shipped artifact.
 *
 * Nothing here talks to a backend, the network, or IPC. It is pure math and
 * constants: the same numbers VoiceOS feeds its notch surface, so the silhouette,
 * corner radii, hover affordances and transition clocks are identical.
 */

/* ------------------------------------------------------------------------- *
 * Core surface constants - bundle lines 267979-268060.
 * ------------------------------------------------------------------------- */

/** Width of the fully collapsed (hidden/off) surface. 267979 */
export const NOTCH_COLLAPSED_WIDTH_PX = 220;
/** Reference display width that the notch scale is normalized against. 267980 */
export const NOTCH_BASE_DISPLAY_WIDTH_PX = 1512;
/** Upper clamp for the display-scale multiplier. 267981 */
export const NOTCH_MAX_DISPLAY_SCALE = 1.24;
/** Height of the band while recording / listening. 267982 */
export const NOTCH_TOP_BAND_HEIGHT_PX = 37;
/** Compact recording band height. 267983 */
export const NOTCH_RECORDING_BAND_HEIGHT_PX = 32;
/** Width of the compact (listening / working) band. 267984 */
export const NOTCH_COMPACT_BAND_WIDTH_PX = 270;
/** Idle width once the hover attach affordance is showing. 267985 */
export const NOTCH_IDLE_ATTACH_WIDTH_PX = 320;
/** Idle height once the hover attach affordance is showing. 267986 */
export const NOTCH_IDLE_ATTACH_HEIGHT_PX = 44;
/** Width of each side slot inside the band (orb / controls). 267987 */
export const NOTCH_BAND_SIDE_SLOT_WIDTH_PX = 68;
/** Height of each side slot inside the band. 267988 */
export const NOTCH_BAND_SIDE_SLOT_HEIGHT_PX = 22;
/** Horizontal inset of the band's contents from its edges. 267989 */
export const NOTCH_BAND_EDGE_INSET_PX = 14;
/** Diameter of the agent voice orb. 267990 */
export const NOTCH_AGENT_ORB_SIZE_PX = 18;
/** Expanded surface *content* width (excludes corner shoulders). 267991 */
export const NOTCH_EXPANDED_WIDTH_PX = 480;

/** Width of the expanded body (the content column). 201610 */
export const NOTCH_EXPANDED_BODY_WIDTH_PX = 440;
/** Inner radius of the expanded body. 201639 */
export const NOTCH_COMPACT_CORNER_RADIUS_PX = 13;
/** Composer pill radius. 201615 */
export const COMPOSER_PILL_RADIUS_PX = 19;
/** Expanded surface corner radius = pill radius + content inset. 201637 */
export const NOTCH_EXPANDED_CORNER_RADIUS_PX =
  COMPOSER_PILL_RADIUS_PX + 12;
/** Full visual width of the expanded surface incl. both shoulders. 201638 */
export const NOTCH_EXPANDED_VISUAL_WIDTH_PX =
  NOTCH_EXPANDED_BODY_WIDTH_PX + NOTCH_EXPANDED_CORNER_RADIUS_PX * 2;

/** Width of the resting idle sliver. 268016 */
export const NOTCH_IDLE_WIDTH_PX = 150;
/** Rest height of the resting sliver (opaque material). 268017 */
export const NOTCH_IDLE_REST_HEIGHT_PX = 4;
/** Rest height of the resting sliver when the liquid-glass material is on. 268018 */
export const NOTCH_IDLE_GLASS_REST_HEIGHT_PX = 5.5;
/** Height of the idle sliver once it shows content. 268019 */
export const NOTCH_IDLE_CONTENT_HEIGHT_PX = 29;
/** Extra hit padding while targeting the idle sliver. 268020 */
export const NOTCH_IDLE_HOVER_TARGET_PADDING_PX = 2;
/** Padding after leaving the idle sliver before hover drops. 268021 */
export const NOTCH_IDLE_HOVER_EXIT_PADDING_PX = 8;
/** Hover cooldown before the haptic fires again. 268022 */
export const NOTCH_HOVER_HAPTIC_COOLDOWN_MS = 750;
/** How much the idle sliver grows vertically on hover. 268023 */
export const NOTCH_HOVER_AFFORDANCE_GROW_PX = 6;
/** How much the idle sliver widens on hover. 268024 */
export const NOTCH_HOVER_AFFORDANCE_WIDEN_PX = 16;
/** How much the idle sliver widens on hover when merged with a hardware notch. 268025 */
export const NOTCH_HOVER_AFFORDANCE_WIDEN_NOTCHED_PX = 52;

/** Inset of expanded content from the body edge. 268026 */
export const EXPANDED_SURFACE_CONTENT_INSET_PX = 12;
/** Top inset of expanded content. 268027 */
export const EXPANDED_SURFACE_CONTENT_TOP_INSET_PX = 2;
/** Bottom inset of expanded content. 268028 */
export const EXPANDED_SURFACE_CONTENT_BOTTOM_INSET_PX = 8;

/* ------------------------------------------------------------------------- *
 * Transition clocks - bundle lines 201495-201606.
 * ------------------------------------------------------------------------- */

/** Master size-transition duration. 201497 */
export const AGENT_NOTCH_SIZE_TRANSITION_MS = 340;
/** Max width of the notch BrowserWindow. 201495 */
export const AGENT_NOTCH_WINDOW_MAX_WIDTH_PX = 720;
/** Max height of the notch BrowserWindow. 201496 */
export const AGENT_NOTCH_WINDOW_MAX_HEIGHT_PX = 800;
/** Horizontal shadow gutter reserved around the surface. 201498 */
export const AGENT_NOTCH_WINDOW_SHADOW_GUTTER_X_PX = 110;
/** Vertical shadow gutter reserved around the surface. 201499 */
export const AGENT_NOTCH_WINDOW_SHADOW_GUTTER_Y_PX = 90;
/** Inset of the notch window from the screen bottom. 201500 */
export const AGENT_NOTCH_SCREEN_BOTTOM_INSET_PX = 20;

/**
 * Maximum height the notch surface can grow to, clamped by screen bounds and shadow gutter.
 * Shipped VoiceOS bundle index-BKi3REhQ.js:
 * screenCeiling = availHeight - AGENT_NOTCH_SCREEN_BOTTOM_INSET_PX (20)
 * windowCeiling = AGENT_NOTCH_WINDOW_MAX_HEIGHT_PX (800) - AGENT_NOTCH_WINDOW_SHADOW_GUTTER_Y_PX (90) = 710
 */
export function agentNotchSurfaceMaxHeight(availHeight: number): number {
  const screenCeiling = availHeight - AGENT_NOTCH_SCREEN_BOTTOM_INSET_PX;
  const windowCeiling =
    AGENT_NOTCH_WINDOW_MAX_HEIGHT_PX - AGENT_NOTCH_WINDOW_SHADOW_GUTTER_Y_PX;
  return Math.max(0, Math.min(screenCeiling, windowCeiling));
}

/** The master size-transition cubic bezier. 201580-201585 */
export const NOTCH_SIZE_TRANSITION_BEZIER: readonly number[] = [0.45, 0, 0.55, 1];
/** CSS form of the master easing. 201586 */
export const NOTCH_SIZE_TRANSITION_EASING = `cubic-bezier(${NOTCH_SIZE_TRANSITION_BEZIER.join(
  ", "
)})`;
/** Closing (expanded -> compact) uses the master bezier at 200ms. 201595 */
export const CLOSING_TIMING = {
  durationMs: 200,
  bezier: NOTCH_SIZE_TRANSITION_BEZIER,
  easing: NOTCH_SIZE_TRANSITION_EASING
} as const;
/** Opening (compact -> expanded) eases out faster: 280ms [0.2,0.8,0.2,1]. 201589 */
export const OPENING_TIMING = {
  durationMs: 280,
  bezier: [0.2, 0.8, 0.2, 1] as readonly number[],
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
} as const;
/** Feature-tour resize easing: 600ms [0.32,0,0.2,1]. 201600 */
export const TOUR_TIMING = {
  durationMs: 600,
  bezier: [0.32, 0, 0.2, 1] as readonly number[],
  easing: "cubic-bezier(0.32, 0, 0.2, 1)"
} as const;

export interface NotchTransitionTiming {
  durationMs: number;
  bezier: readonly number[];
  easing: string;
}

/**
 * getNotchTransitionTiming(expanded, featureTour) - 201606.
 * Opening uses the out-easing; closing uses the symmetric master bezier.
 */
export function getNotchTransitionTiming(
  expanded: boolean,
  featureTour = false
): NotchTransitionTiming {
  if (featureTour && expanded) return TOUR_TIMING;
  return expanded ? OPENING_TIMING : CLOSING_TIMING;
}

/**
 * getNotchSizeTransition(durationMs, easing) - 201619.
 * The 8-property transition string the surface and its layout wrappers share.
 */
export function getNotchSizeTransition(
  durationMs: number = AGENT_NOTCH_SIZE_TRANSITION_MS,
  easing: string = NOTCH_SIZE_TRANSITION_EASING
): string {
  return `
  width ${durationMs}ms ${easing},
  min-height ${durationMs}ms ${easing},
  max-height ${durationMs}ms ${easing},
  height ${durationMs}ms ${easing},
  left ${durationMs}ms ${easing},
  right ${durationMs}ms ${easing},
  border-radius ${durationMs}ms ${easing},
  padding ${durationMs}ms ${easing},
  opacity 180ms ease,
  transform ${durationMs}ms ${easing}
`;
}

/** Pre-built master size transition. 201631 */
export const NOTCH_SIZE_TRANSITION = getNotchSizeTransition();

/* ------------------------------------------------------------------------- *
 * Colors / material - bundle lines 201658-201662, 268112.
 * ------------------------------------------------------------------------- */

/** Opaque solid-black surface fill (the `solidBlack` material). 201658 */
export const NOTCH_SOLID_BACKGROUND = "rgba(0, 0, 2, 0.98)";
/** Glass tint laid over the surface. 201659 */
export const NOTCH_GLASS_TINT = "rgba(0, 0, 5, 0.18)";
/** Stop percentage where the glass gradient darkens. 201660 */
export const NOTCH_GLASS_DARK_STOP_PCT = 48;
/** Idle drop shadow. 201661 */
export const NOTCH_SURFACE_SHADOW_IDLE =
  "drop-shadow(0 2px 6px rgba(0,0,0,0.25))";
/** Active drop shadow (double drop-shadow with a hairline light rim). 201662 */
export const NOTCH_SURFACE_SHADOW_ACTIVE =
  "drop-shadow(0 5px 12px rgba(0,0,0,0.28)) drop-shadow(0 0 0.9px rgba(235,245,255,0.22))";
/** Error-state orb glow color. 268112 */
export const AGENT_ERROR_GLOW_COLOR = "rgb(255, 69, 58)";

/**
 * getAgentNotchSurfaceShadow({collapsedNotchHidden, isBareIdleSurface,
 * isActiveSurface}) - 265810.
 */
export function getAgentNotchSurfaceShadow(args: {
  collapsedNotchHidden: boolean;
  isBareIdleSurface: boolean;
  isActiveSurface: boolean;
}): string {
  if (args.collapsedNotchHidden || args.isBareIdleSurface) return "none";
  return args.isActiveSurface
    ? NOTCH_SURFACE_SHADOW_ACTIVE
    : NOTCH_SURFACE_SHADOW_IDLE;
}

/** rgbaWithAlpha(color, alpha, whiteMix) - 268093. */
export function rgbaWithAlpha(
  color: string,
  alpha: number,
  whiteMix = 0
): string {
  const mixWithWhite = (value: number): number =>
    Math.round(value + (255 - value) * whiteMix);
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${mixWithWhite(Number(r))}, ${mixWithWhite(
      Number(g)
    )}, ${mixWithWhite(Number(b))}, ${alpha})`;
  }
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = mixWithWhite(parseInt(hex.slice(0, 2), 16));
    const g = mixWithWhite(parseInt(hex.slice(2, 4), 16));
    const b = mixWithWhite(parseInt(hex.slice(4, 6), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(18, 111, 246, ${alpha})`;
}

/* ------------------------------------------------------------------------- *
 * Silhouette + clip paths - bundle lines 201640-201717, 185696-185738.
 * ------------------------------------------------------------------------- */

export interface NotchSilhouetteRadii {
  x: number;
  y: number;
}

/**
 * getNotchSilhouetteRadii(visualWidth, height) - 201640.
 * The corner radius is the expanded radius only when the surface is at full
 * expanded width; otherwise the compact radius, clamped by width/4 and height/2.
 */
export function getNotchSilhouetteRadii(
  visualWidth: number,
  height: number
): NotchSilhouetteRadii {
  const radius = Math.min(
    visualWidth >= NOTCH_EXPANDED_VISUAL_WIDTH_PX - 0.01
      ? NOTCH_EXPANDED_CORNER_RADIUS_PX
      : NOTCH_COMPACT_CORNER_RADIUS_PX,
    Math.max(0, visualWidth) / 4,
    Math.max(0, height) / 2
  );
  return { x: radius, y: radius };
}

export interface NotchSilhouetteGeometry {
  visualWidth: number;
  radiusX: number;
  radiusY: number;
}

/**
 * getNotchSilhouetteGeometry(bodyWidth, height) - 201648.
 * The visual width is the body width plus a "shoulder" on each side; the
 * shoulder is the compact radius (13) until the body reaches the full expanded
 * width, at which point it becomes the expanded radius (31).
 */
export function getNotchSilhouetteGeometry(
  bodyWidth: number,
  height: number
): NotchSilhouetteGeometry {
  const width = Math.max(0, bodyWidth);
  const shoulder = Math.min(
    width >= NOTCH_EXPANDED_BODY_WIDTH_PX - 0.01
      ? NOTCH_EXPANDED_CORNER_RADIUS_PX
      : NOTCH_COMPACT_CORNER_RADIUS_PX,
    width / 2
  );
  const visualWidth = width + shoulder * 2;
  const radii = getNotchSilhouetteRadii(visualWidth, height);
  return { visualWidth, radiusX: radii.x, radiusY: radii.y };
}

const CORNER_SAMPLES = 12;
/** 201663 */
const sampleNotchCorner = (progress: number): [number, number] => {
  const angle = (progress * Math.PI) / 2;
  return [Math.sin(angle), 1 - Math.cos(angle)];
};

/**
 * buildNotchPolygonPoints(visualWidth, height) - 201668.
 * Percentage-based polygon points for the full notch silhouette.
 */
function buildNotchPolygonPoints(
  visualWidth: number,
  height: number
): Array<[string, string]> {
  const points: Array<[string, string]> = [];
  const radii = getNotchSilhouetteRadii(visualWidth, height);
  const radiusX = visualWidth > 0 ? (radii.x / visualWidth) * 100 : 0;
  const radiusY = height > 0 ? (radii.y / height) * 100 : 0;
  const pct = (value: number): string => `${value.toFixed(5)}%`;
  points.push([pct(0), pct(0)], [pct(100), pct(0)]);
  for (let index = 1; index <= CORNER_SAMPLES; index++) {
    const [x, y] = sampleNotchCorner(index / (CORNER_SAMPLES + 1));
    points.push([pct(100 - radiusX * x), pct(radiusY * y)]);
  }
  points.push(
    [pct(100 - radiusX), pct(radiusY)],
    [pct(100 - radiusX), pct(100 - radiusY)]
  );
  for (let index = 1; index <= CORNER_SAMPLES; index++) {
    const [x, y] = sampleNotchCorner(index / (CORNER_SAMPLES + 1));
    points.push([
      pct(100 - radiusX - radiusX * y),
      pct(100 - radiusY + radiusY * x)
    ]);
  }
  points.push(
    [pct(100 - radiusX * 2), pct(100)],
    [pct(radiusX * 2), pct(100)]
  );
  for (let index = 1; index <= CORNER_SAMPLES; index++) {
    const [x, y] = sampleNotchCorner(index / (CORNER_SAMPLES + 1));
    points.push([
      pct(radiusX * 2 - radiusX * x),
      pct(100 - radiusY * y)
    ]);
  }
  points.push(
    [pct(radiusX), pct(100 - radiusY)],
    [pct(radiusX), pct(radiusY)]
  );
  for (let index = 1; index <= CORNER_SAMPLES; index++) {
    const [x, y] = sampleNotchCorner(index / (CORNER_SAMPLES + 1));
    points.push([
      pct(radiusX - radiusX * y),
      pct(radiusY - radiusY * x)
    ]);
  }
  return points;
}

/**
 * buildNotchClipPath(visualWidth, height) - 201714.
 * The silhouette used for the surface veil.
 */
export function buildNotchClipPath(
  visualWidth: number,
  height: number
): string {
  const points = buildNotchPolygonPoints(visualWidth, height);
  return `polygon(${points.map(([x, y]) => `${x} ${y}`).join(", ")})`;
}

const NOTCH_ARC_SAMPLES = 8;

/**
 * buildNotchClipPath$2(shoulderX, shoulderY, bottomRadius) - 185697.
 * The pixel-precise "hardware notch" silhouette used for the fixed presets.
 */
function buildNotchPresetClipPath(
  shoulderX: number,
  shoulderY: number,
  bottomRadius: number
): string {
  const points: Array<[string, string]> = [];
  const px = (value: number): string => `${value.toFixed(3)}px`;
  const fromRight = (value: number): string =>
    `calc(100% - ${value.toFixed(3)}px)`;
  const fromBottom = (value: number): string =>
    `calc(100% - ${value.toFixed(3)}px)`;
  points.push([px(0), px(0)], ["100%", px(0)]);
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -Math.PI / 2 - (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2);
    points.push([
      fromRight(-shoulderX * Math.cos(theta)),
      px(shoulderY + shoulderY * Math.sin(theta))
    ]);
  }
  points.push([fromRight(shoulderX), fromBottom(bottomRadius)]);
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2);
    points.push([
      fromRight(shoulderX + bottomRadius - bottomRadius * Math.cos(theta)),
      fromBottom(bottomRadius - bottomRadius * Math.sin(theta))
    ]);
  }
  points.push([px(shoulderX + bottomRadius), "100%"]);
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = Math.PI / 2 + (i / NOTCH_ARC_SAMPLES) * (Math.PI / 2);
    points.push([
      px(shoulderX + bottomRadius + bottomRadius * Math.cos(theta)),
      fromBottom(bottomRadius - bottomRadius * Math.sin(theta))
    ]);
  }
  points.push([px(shoulderX), px(shoulderY)]);
  for (let i = 1; i <= NOTCH_ARC_SAMPLES; i++) {
    const theta = -(i / NOTCH_ARC_SAMPLES) * (Math.PI / 2);
    points.push([
      px(shoulderX * Math.cos(theta)),
      px(shoulderY + shoulderY * Math.sin(theta))
    ]);
  }
  return `polygon(${points.map(([x, y]) => `${x} ${y}`).join(", ")})`;
}

/** The three fixed presets VoiceOS ships. 185736-185738 */
export const COLLAPSED_NOTCH_CLIP = buildNotchPresetClipPath(10, 10, 11);
export const LISTENING_NOTCH_CLIP = buildNotchPresetClipPath(14, 14, 17);
export const EXPANDED_NOTCH_CLIP = buildNotchPresetClipPath(18, 18, 24);

/* ------------------------------------------------------------------------- *
 * Waveform / orb animation constants - bundle lines 201199-201228.
 * ------------------------------------------------------------------------- */

export const WAVEFORM_BAR_COUNT = 4;
export const WAVEFORM_BAR_WIDTH_PX = 2.5;
export const WAVEFORM_BAR_GAP_PX = 1.5;
export const WAVEFORM_WIDTH_PX =
  WAVEFORM_BAR_COUNT * (WAVEFORM_BAR_WIDTH_PX + 2 * WAVEFORM_BAR_GAP_PX);
export const WAVE_TICK_MS = 58;
export const WAVE_MIN_BAR_H = 2;
export const WAVE_MAX_BAR_H = 17;
export const DOT_HOP_PERIOD_MS = 1150;
export const DOT_HOP_STAGGER = 0.13;
export const DOT_STRETCH_MAX = 0.16;
export const DOT_SQUASH_MAX = 0.14;
export const DOT_GREY_FLOOR = 110;
export const LOADING_HOLD_MS = 130;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const fract = (x: number): number => x - Math.floor(x);

const BOUNCE_RISE_END = 0.4;
const BOUNCE_HANG_END = 0.52;
const BOUNCE_FALL_END = 0.92;
const BOUNCE_MAX_SPEED = 7.5;

const easeOutCubic = (u: number): number => 1 - Math.pow(1 - u, 3);
const easeInCubic = (u: number): number => u * u * u;

/** bounceHeight(phase) - 201220 */
export function bounceHeight(phase: number): number {
  if (phase < BOUNCE_RISE_END) return easeOutCubic(phase / BOUNCE_RISE_END);
  if (phase < BOUNCE_HANG_END) return 1;
  if (phase < BOUNCE_FALL_END)
    return (
      1 -
      easeInCubic((phase - BOUNCE_HANG_END) / (BOUNCE_FALL_END - BOUNCE_HANG_END))
    );
  return 0;
}

/** bounceSquash(phase) - 201228 */
export function bounceSquash(phase: number): number {
  return Math.exp(-((phase - 0.94) * (phase - 0.94)) / (2 * 0.05 * 0.05));
}

/** parseRgb(color) - 201229 */
export function parseRgb(color: string): [number, number, number] {
  if (typeof color !== "string" || color.length === 0) return [255, 255, 255];
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.match(/\d+(\.\d+)?/g);
  if (parts && parts.length >= 3)
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  return [255, 255, 255];
}

export const BOUNCE_CONSTANTS = {
  BOUNCE_RISE_END,
  BOUNCE_HANG_END,
  BOUNCE_FALL_END,
  BOUNCE_MAX_SPEED
} as const;

/** clampNumber(value, min, max) - 268061 */
export const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
