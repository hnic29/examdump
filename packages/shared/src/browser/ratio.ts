export const DEFAULT_RATIO = 0.6;
export const MIN_RATIO = 0.25;
export const MAX_RATIO = 0.75;

export function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}
