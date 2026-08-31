/**
 * JKB Heat — the single site-level entry point for analytical table heat.
 *
 * This module does NOT define new thresholds or percentile math. It consolidates
 * and re-exports the two already-approved source-of-truth implementations so new
 * consumers have one import to reach for:
 *
 * - `src/lib/mlb/percentileColorScale.ts` — the 8-tier favorable-percentile
 *   scale, tier resolution, sample-confidence gating, muted/capped fallbacks,
 *   and the legend array. Owns the full goodness ramp — gold (elite) -> emerald
 *   -> neutral slate -> red (poor) — and the tier math. Its
 *   `computePercentileRanks` is the divide-by-`n` behaviour for large
 *   comparison populations (~100+ rows).
 * - `WeeklyHeatTone` in `src/lib/fantasy/weekly/researchPresentation.ts` — the
 *   canonical ranking-table visual language. It is a tone vocabulary over the
 *   same `PERCENTILE_TIERS` fills (favorable and unfavorable both), plus
 *   rank -> band mapping.
 *
 * Fixed small pools (32-team leagues; ~30-60-row position boards) use the
 * `n - 1` endpoint convention in `computeTeamPercentiles`
 * (`src/lib/fantasy/teamPercentiles.ts`), also re-exported here. The choice of
 * denominator follows docs/TABLE_CONVENTIONS.md section F — it is not left to
 * each caller's taste (KS-011).
 *
 * See docs/TABLE_CONVENTIONS.md sections D-H and docs/DECISIONS.md KS-010/011.
 */

import {
  PERCENTILE_TIERS,
  PERCENTILE_TIER_LEGEND,
  type PercentileTier,
  type PercentileTierId,
  type PercentileTierStyle,
  type PercentileDirection,
  type SampleConfidence,
} from "@/lib/mlb/percentileColorScale";
import {
  weeklyHeatClass,
  weeklyHeatStyle,
  weeklyHeatTextClass,
  type WeeklyHeatTone,
} from "@/lib/fantasy/weekly/researchPresentation";

/* ------------------------------------------------------------------ *
 * Re-exports — the approved primitives, unchanged.
 * ------------------------------------------------------------------ */

export {
  // 8-tier favorable-percentile scale + tier math
  PERCENTILE_TIERS,
  PERCENTILE_TIER_LEGEND,
  getPercentileTier,
  resolvePercentileDisplay,
  resolvePercentileTierForDisplay,
  // percentile computation — large populations (divide-by-n)
  computePercentileRanks,
  buildPercentileLookup,
  lookupPercentile,
  // sample confidence / missing / small-sample / sample-unavailable
  SAMPLE_MINIMUMS,
  SAMPLE_UNAVAILABLE_MAX_TIER_ID,
  SMALL_SAMPLE_STYLE,
  classifySampleConfidence,
  resolveSampleSize,
  isSampleSufficientForStrongColor,
  capTierForSampleUnavailable,
  muteTierStyle,
} from "@/lib/mlb/percentileColorScale";
export type {
  PercentileTier,
  PercentileTierId,
  PercentileTierStyle,
  PercentileDirection,
  PercentileDisplayResult,
  SampleConfidence,
} from "@/lib/mlb/percentileColorScale";

export {
  // WeeklyHeatTone visual language (favorable + red unfavorable half)
  weeklyHeatClass,
  weeklyHeatStyle,
  weeklyHeatTextClass,
  weeklyRankHeatTone,
  weeklyRankHeatClass,
  favorablePercentile,
  weeklyMatchupComponentHeatTone,
  weeklyMatchupDifferenceHeatTone,
  matchupGradeHeatTone,
  matchupGradeHeatClass,
} from "@/lib/fantasy/weekly/researchPresentation";
export type { WeeklyHeatTone } from "@/lib/fantasy/weekly/researchPresentation";

export {
  // Fixed small pools — n-1 endpoint convention (32-team / position boards)
  computeTeamPercentiles,
  formatPercentile,
} from "@/lib/fantasy/teamPercentiles";
export type { TeamMetricValue } from "@/lib/fantasy/teamPercentiles";
export { computePpgPercentiles } from "@/lib/fantasy/ppgPercentile";

/* ------------------------------------------------------------------ *
 * Explicit shared vocabulary.
 * ------------------------------------------------------------------ */

/**
 * Heat direction, stated explicitly at every call site. `higherBetter` uses the
 * favorable percentile directly; `lowerBetter` inverts through the shared
 * direction helper (favorable = 100 - percentile). An inverse palette is never
 * hand-rolled. Alias of `PercentileDirection`.
 */
export type HeatDirection = PercentileDirection;

/**
 * The non-scoring states a heat cell can be in, distinct from a tier. These are
 * never painted with the Average slate wash — a missing value must not fabricate
 * a mid-pack signal.
 *
 * - `missing`            — value absent / non-finite: faint border only, no fill.
 * - `small-sample`       — known sample below threshold: single muted tint, no
 *                          Elite / Excellent paint.
 * - `sample-unavailable` — metric valid but no sample field: muted tier, capped
 *                          at Great, never Elite gold.
 * - `context-only`       — identity / volume / tendency metric with no good-bad
 *                          orientation: no heat at all.
 */
export type HeatNonScoringState =
  | "missing"
  | "small-sample"
  | "sample-unavailable"
  | "context-only";

/**
 * Canonical bridge between the 8 `PercentileTierId`s and the `WeeklyHeatTone`
 * vocabulary. This is the ONLY place the two names for the same bands are
 * reconciled — `researchPresentation.ts` already fills its favorable half from
 * the identical MLB tier styles; this map states the full correspondence so
 * rank-band consumers and percentile consumers can share one legend.
 */
export const TIER_TO_WEEKLY_HEAT_TONE: Record<PercentileTierId, WeeklyHeatTone> = {
  elite: "gold",
  excellent: "dark-green",
  great: "green",
  aboveAverage: "light-green",
  average: "neutral",
  belowAverage: "light-red",
  weak: "red",
  poor: "strong-red",
};

const WEEKLY_HEAT_TONE_TO_TIER: Partial<Record<WeeklyHeatTone, PercentileTierId>> = (() => {
  const out: Partial<Record<WeeklyHeatTone, PercentileTierId>> = {};
  for (const [tierId, tone] of Object.entries(TIER_TO_WEEKLY_HEAT_TONE) as [
    PercentileTierId,
    WeeklyHeatTone,
  ][]) {
    out[tone] = tierId;
  }
  return out;
})();

/** Tier id -> WeeklyHeatTone. `null` (no tier resolved) -> `"missing"`. */
export function tierToWeeklyHeatTone(tierId: PercentileTierId | null | undefined): WeeklyHeatTone {
  if (tierId == null) return "missing";
  return TIER_TO_WEEKLY_HEAT_TONE[tierId];
}

/** WeeklyHeatTone -> tier id. `"missing"` (and any unmapped tone) -> `null`. */
export function weeklyHeatToneToTierId(tone: WeeklyHeatTone | null | undefined): PercentileTierId | null {
  if (tone == null) return null;
  return WEEKLY_HEAT_TONE_TO_TIER[tone] ?? null;
}

/* ------------------------------------------------------------------ *
 * Legend — derived from the SAME tier definitions the cells use.
 * ------------------------------------------------------------------ */

export type JkbHeatLegendEntry = {
  id: PercentileTierId;
  label: string;
  /** Human-readable favorable-percentile range, e.g. "95-97", ">= 98", "< 10". */
  percentileRange: string;
  tone: WeeklyHeatTone;
  style: PercentileTierStyle;
  minFavorablePercentile: number;
};

function percentileRange(index: number): string {
  const tier = PERCENTILE_TIERS[index];
  const min = tier.minFavorablePercentile;
  if (index === 0) return `>= ${min}`;
  if (index === PERCENTILE_TIERS.length - 1) {
    const above = PERCENTILE_TIERS[index - 1].minFavorablePercentile;
    return `< ${above}`;
  }
  const above = PERCENTILE_TIERS[index - 1].minFavorablePercentile;
  return `${min}-${above - 1}`;
}

/**
 * The shared heat legend. Generated directly from `PERCENTILE_TIER_LEGEND`
 * (itself generated from `PERCENTILE_TIERS`), so it cannot drift from the cell
 * thresholds. Any heat-colored table renders a legend built from this — never a
 * hand-copied list (docs/TABLE_CONVENTIONS.md section H).
 */
export const JKB_HEAT_LEGEND: readonly JkbHeatLegendEntry[] = PERCENTILE_TIER_LEGEND.map(
  (entry, index): JkbHeatLegendEntry => ({
    id: entry.id,
    label: entry.label,
    percentileRange: percentileRange(index),
    tone: TIER_TO_WEEKLY_HEAT_TONE[entry.id],
    style: entry.style,
    minFavorablePercentile: entry.minFavorablePercentile,
  }),
);

/** Re-exported so a WeeklyHeatTone consumer can reach these without a second import. */
export { weeklyHeatClass as jkbHeatClass, weeklyHeatStyle as jkbHeatStyle, weeklyHeatTextClass as jkbHeatTextClass };
