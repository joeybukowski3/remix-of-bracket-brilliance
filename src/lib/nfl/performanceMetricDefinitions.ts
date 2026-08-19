/**
 * Reusable metric definitions for the Team Performance Analytics artifact
 * (public/data/nfl/{season}/team-performance-analytics.json). Labels,
 * formatters, rank direction, and rating-input vs display-only status live
 * here — not inside any one page — so a future matchup/fantasy surface can
 * reuse the exact same definitions instead of re-deriving them.
 *
 * The artifact stores each metric's underlying RAW component fields (see
 * PerformanceRateBundle in performanceMetricsCore2026.ts); it does not store
 * a pre-combined score for Early Down / Passing / Rushing / Third-Down
 * Performance. Rather than inventing a friendlier composite value that isn't
 * actually in the artifact, each of those four uses its EPA/play component
 * as the single canonical display value (the same "EPA is the primary
 * efficiency currency" convention every other JKB NFL surface already uses),
 * with the metric's Success Rate as a secondary read-only detail.
 */

import type { PerformanceRateBundle } from "@/lib/nfl/performanceMetricsCore2026";
import type { TeamPerformanceWindowMetrics } from "@/lib/nfl/teamPerformanceAnalytics";

export type PerformanceMetricSide = "offense" | "defenseAllowed";
export type PerformanceMetricValueKind = "signedRate" | "percentage" | "decimal";
export type PerformanceMetricFilterVariant = "all" | "filtered";
export type PerformanceMetricRankDirection = "higher-is-better" | "lower-is-better";

export type PerformanceMetricDefinition = {
  /** Stable key, matches the artifact's rank-table keys where applicable. */
  key: string;
  label: string;
  shortLabel: string;
  /** One line of plain-language explanation, no jargon, for a header tooltip. */
  description: string;
  valueKind: PerformanceMetricValueKind;
  /** Which of the two garbage-time variants this metric's displayed value reads from. */
  filterVariant: PerformanceMetricFilterVariant;
  /** Rank direction for OFFENSE-side values. */
  offenseDirection: PerformanceMetricRankDirection;
  /** Rank direction for DEFENSE("allowed"/"generated")-side values. */
  defenseDirection: PerformanceMetricRankDirection;
  /** Whether this metric feeds the OFF/DEF Performance Rating composite (only 3 of 9 do). */
  isRatingInput: boolean;
  /** Secondary read-only value shown alongside the primary one, if any (e.g. Success Rate for an EPA-led metric). */
  secondaryOf?: string;
};

/**
 * The 9 offense metrics, in display order. Defense mirrors are the same 9
 * keys read from the "allowed"/"generated" side (see valueForTeam below) —
 * there is deliberately one shared definition list, not two.
 */
export const PERFORMANCE_METRIC_DEFINITIONS: readonly PerformanceMetricDefinition[] = [
  {
    key: "epaPerPlay",
    label: "EPA / Play",
    shortLabel: "EPA/Play",
    description: "Expected points added per offensive play — the model's core efficiency signal. Garbage-time plays are excluded.",
    valueKind: "signedRate",
    filterVariant: "filtered",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: true,
  },
  {
    key: "successRate",
    label: "Success Rate",
    shortLabel: "Succ. Rate",
    description: "Share of plays that gained enough yardage for the down (40% of yards to go on 1st, 60% on 2nd, 100% on 3rd/4th). Garbage-time plays are excluded.",
    valueKind: "percentage",
    filterVariant: "filtered",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: true,
  },
  {
    key: "explosiveRate",
    label: "Explosive Play Rate",
    shortLabel: "Explosive",
    description: "Share of plays gaining 15+ yards through the air or 10+ yards on the ground.",
    valueKind: "percentage",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: true,
  },
  {
    key: "earlyDownEpaPerPlay",
    label: "Early Down Efficiency",
    shortLabel: "Early Down",
    description: "EPA per play on 1st and 2nd down only.",
    valueKind: "signedRate",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: false,
    secondaryOf: "earlyDownSuccessRate",
  },
  {
    key: "passEpaPerDropback",
    label: "Passing Efficiency",
    shortLabel: "Passing",
    description: "EPA per dropback (includes sacks and scrambles).",
    valueKind: "signedRate",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: false,
    secondaryOf: "passSuccessRate",
  },
  {
    key: "rushEpaPerPlay",
    label: "Rushing Efficiency",
    shortLabel: "Rushing",
    description: "EPA per rushing play.",
    valueKind: "signedRate",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: false,
    secondaryOf: "rushSuccessRate",
  },
  {
    key: "thirdDownEpaPerPlay",
    label: "Third-Down Performance",
    shortLabel: "3rd Down",
    description: "EPA per play on 3rd down only (4th down excluded).",
    valueKind: "signedRate",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: false,
    secondaryOf: "thirdDownRawConversionRate",
  },
  {
    key: "pointsPerDrive",
    label: "Points / Drive",
    shortLabel: "Pts/Drive",
    description: "Average points scored per offensive drive (kneel-only drives excluded; defensive/return touchdowns and safeties are not credited to either side's drive average).",
    valueKind: "decimal",
    filterVariant: "all",
    offenseDirection: "higher-is-better",
    defenseDirection: "lower-is-better",
    isRatingInput: false,
  },
  {
    key: "sackRate",
    label: "Sack Rate",
    shortLabel: "Sack Rate",
    description: "Offense: share of dropbacks ending in a sack (lower is better). Defense: share of opponent dropbacks the defense turned into a sack (higher is better).",
    valueKind: "percentage",
    filterVariant: "all",
    // Sack Rate is the one metric whose OWN direction flips depending on
    // side: an offense taking sacks is bad (lower-is-better), while a
    // defense generating sacks is good (higher-is-better) — the two
    // "directions" below are intentionally NOT mirrors of each other, unlike
    // every other metric in this list.
    offenseDirection: "lower-is-better",
    defenseDirection: "higher-is-better",
    isRatingInput: false,
  },
] as const;

export const RATING_INPUT_METRIC_KEYS: readonly string[] = PERFORMANCE_METRIC_DEFINITIONS.filter(
  (m) => m.isRatingInput
).map((m) => m.key);

function fieldValue(bundle: PerformanceRateBundle, key: string): number | null {
  const record = bundle as unknown as Record<string, number | null>;
  return record[key] ?? null;
}

/** Read one metric's displayed raw value for a team/side/window, respecting its filter treatment. */
export function performanceMetricRawValue(
  window: TeamPerformanceWindowMetrics,
  side: PerformanceMetricSide,
  metric: PerformanceMetricDefinition
): number | null {
  if (metric.key === "pointsPerDrive") {
    return side === "offense" ? window.pointsPerDriveOff : window.pointsPerDriveAllowed;
  }
  const bundle = window[side][metric.filterVariant];
  return fieldValue(bundle, metric.key);
}

/** The secondary (Success Rate / raw conversion) value shown alongside an EPA-led metric, if any. */
export function performanceMetricSecondaryValue(
  window: TeamPerformanceWindowMetrics,
  side: PerformanceMetricSide,
  metric: PerformanceMetricDefinition
): number | null {
  if (!metric.secondaryOf) return null;
  const bundle = window[side][metric.filterVariant];
  return fieldValue(bundle, metric.secondaryOf);
}

export function performanceMetricDirection(
  metric: PerformanceMetricDefinition,
  side: PerformanceMetricSide
): PerformanceMetricRankDirection {
  return side === "offense" ? metric.offenseDirection : metric.defenseDirection;
}

/** Format a raw metric value for display. Never fabricates a value: null stays null in, string out is the caller's job. */
export function formatPerformanceMetricValue(value: number | null, kind: PerformanceMetricValueKind): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (kind === "signedRate") {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(3)}`;
  }
  if (kind === "percentage") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

export const PERFORMANCE_WINDOW_TARGET_SIZE: Readonly<Record<"last4" | "last8" | "fullSeason", number | null>> = {
  last4: 4,
  last8: 8,
  fullSeason: null,
};

/** e.g. "2 of 4" for a team with only 2 completed games in a Last 4 window; "9 games" for Full Season. */
export function formatSampleSizeQualifier(sampleSize: number, windowKey: "last4" | "last8" | "fullSeason"): string {
  const target = PERFORMANCE_WINDOW_TARGET_SIZE[windowKey];
  if (target === null) return `${sampleSize} game${sampleSize === 1 ? "" : "s"}`;
  return `${sampleSize} of ${target}`;
}
