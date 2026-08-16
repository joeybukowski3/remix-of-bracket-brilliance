/**
 * Presentation helpers for the PAR-first research board.
 *
 * These mirror the quantile approach already used by `rankingPresentation.ts`:
 * cutoffs are derived from the values actually on the active position board, so
 * nothing here hardcodes a league-wide constant. None of this touches PAR
 * arithmetic or the approved replacement baselines — it only decides colour.
 */

export type ParPerGameTone = "elite" | "positive" | "near" | "below" | "missing";

export type ParPerGameThresholds = {
  /** Lowest PAR/G still inside the position's elite band. */
  eliteMin: number;
};

/** PAR/G inside this many points of the replacement baseline reads as "near replacement". */
const NEAR_REPLACEMENT_BAND = 1;
/** Share of the position's PAR/G distribution treated as elite (top quartile). */
const ELITE_QUANTILE = 0.75;

/** Derives the elite PAR/G cutoff from the populated values on one position board. */
export function getParPerGameThresholds(
  values: readonly (number | undefined)[],
): ParPerGameThresholds | null {
  const sorted = values
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const eliteIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * ELITE_QUANTILE));
  return { eliteMin: sorted[eliteIndex] };
}

export function getParPerGameTone(
  value: number | undefined,
  thresholds: ParPerGameThresholds | null,
): ParPerGameTone {
  if (!Number.isFinite(value)) return "missing";
  const par = value as number;
  if (thresholds && par > NEAR_REPLACEMENT_BAND && par >= thresholds.eliteMin) return "elite";
  if (Math.abs(par) <= NEAR_REPLACEMENT_BAND) return "near";
  return par > 0 ? "positive" : "below";
}

type Rgb = readonly [number, number, number];

/** emerald-100 → slate-100 → rose-100, matching the board's existing palette. */
const GRADIENT_BEST: Rgb = [209, 250, 229];
const GRADIENT_MID: Rgb = [241, 245, 249];
const GRADIENT_WORST: Rgb = [255, 228, 230];

/** Largest finite rank on the board, used as the gradient's worst-case anchor. */
export function getMaxRank(values: readonly (number | undefined)[]): number | null {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (finite.length === 0) return null;
  return Math.max(...finite);
}

function mix(from: Rgb, to: Rgb, ratio: number): string {
  const channels = from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));
  return `rgb(${channels.join(", ")})`;
}

/**
 * Continuous heat-map background for a rank column. Rank 1 anchors to emerald,
 * the pool midpoint to slate and `maxRank` to rose.
 */
export function getRankGradientColor(
  value: number | undefined,
  maxRank: number | null,
): string | undefined {
  if (!Number.isFinite(value) || maxRank == null || maxRank <= 1) return undefined;
  const position = Math.min(1, Math.max(0, ((value as number) - 1) / (maxRank - 1)));
  return position <= 0.5
    ? mix(GRADIENT_BEST, GRADIENT_MID, position * 2)
    : mix(GRADIENT_MID, GRADIENT_WORST, (position - 0.5) * 2);
}
