export enum BloopPaletteName {
  blue = "blue",
  purple = "purple",
  cyan = "cyan",
  emerald = "emerald",
}

export interface BloopPaletteColors {
  main: number[];
  low: number[];
  mid: number[];
  high: number[];
}

export const BLOOP_PALETTES: Record<BloopPaletteName, BloopPaletteColors> = {
  [BloopPaletteName.blue]: {
    main: [0.1, 0.5, 1.0],
    low: [0.1, 0.2, 0.8],
    mid: [0.2, 0.4, 0.9],
    high: [0.5, 0.8, 1.0],
  },
  [BloopPaletteName.purple]: {
    main: [0.6, 0.2, 0.9],
    low: [0.3, 0.1, 0.6],
    mid: [0.5, 0.2, 0.8],
    high: [0.8, 0.5, 1.0],
  },
  [BloopPaletteName.cyan]: {
    main: [0.0, 0.7, 0.8],
    low: [0.0, 0.3, 0.5],
    mid: [0.1, 0.5, 0.7],
    high: [0.4, 0.9, 1.0],
  },
  [BloopPaletteName.emerald]: {
    main: [0.1, 0.8, 0.4],
    low: [0.05, 0.4, 0.2],
    mid: [0.1, 0.6, 0.3],
    high: [0.4, 0.95, 0.6],
  },
};

