import type { CSSProperties, RefObject } from "react";

export enum BloopState {
  idle = "idle",
  listen = "listen",
  think = "think",
  speak = "speak",
}

export interface OrbBloopProps {
  audioMode?: "ambient" | "mic" | "file";
  audioElement?: RefObject<HTMLAudioElement | null>;
  audioSrc?: string;
  state?: BloopState;
  bloopColorMain?: number[];
  bloopColorLow?: number[];
  bloopColorMid?: number[];
  bloopColorHigh?: number[];
  size?: number;
  watercolorStrength?: number;
  watercolorAnimated?: boolean;
  className?: string;
  style?: CSSProperties;
}

