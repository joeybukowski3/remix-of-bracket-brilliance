/**
 * Data contract for the "Yards vs Avg" view of /nfl/fantasy-points-allowed:
 * how far opponents' yardage against a defense sits above (+, bad for the
 * defense) or below (-, good for the defense) each opponent's own normal
 * production. See docs/features/nfl-fantasy-points-allowed.md.
 *
 * Sample keys and window semantics are shared with Fantasy Points Allowed
 * ("2026" = current season, "2025" = prior season, last5/last8 = the
 * defense's most recent N games across the season boundary).
 */

import type { FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";

export const YARDS_VS_AVERAGE_SCHEMA_VERSION = "nfl-yards-vs-average-v1" as const;
export const YARDS_VS_AVERAGE_ARTIFACT_PATH = "/data/nfl/yards-vs-average-by-position.json";

export type YardsVsAverageSampleKey = FantasyAllowedSampleKey;
export const YARDS_VS_AVERAGE_SAMPLE_KEYS: readonly YardsVsAverageSampleKey[] = ["2026", "2025", "last5", "last8"];

export const YARDS_VS_AVERAGE_METRIC_KEYS = ["pass", "rush", "qbRush", "rbRush", "rbRec", "wrRec", "teRec"] as const;
export type YardsVsAverageMetricKey = (typeof YARDS_VS_AVERAGE_METRIC_KEYS)[number];

export const YARDS_VS_AVERAGE_METRIC_DEFINITIONS: Record<YardsVsAverageMetricKey, string> = {
  pass: "Gross team passing yards (all QB/RB/WR/TE passers; sack yards are not subtracted)",
  rush: "Team rushing yards from QB/RB/WR/TE rows",
  qbRush: "QB rushing yards",
  rbRush: "RB rushing yards",
  rbRec: "RB receiving yards",
  wrRec: "WR receiving yards",
  teRec: "TE receiving yards",
};

/**
 * % mode is withheld when the sampled games' mean baseline is below this many
 * yards per game (tiny denominators produce meaningless percentages), and is
 * never produced for QB rushing, whose baselines are routinely near zero or
 * negative.
 */
export const YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME = 10;
export const YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS: readonly YardsVsAverageMetricKey[] = ["qbRush"];

/** Fewer sampled games than this renders with the shared small-sample styling. */
export const YARDS_VS_AVERAGE_SMALL_SAMPLE_GAMES = 3;

export type YardsVsAverageMetricValues = Record<YardsVsAverageMetricKey, number>;

/**
 * One defense-game: what the offense produced against `defense`, and the
 * offense's normal production for that game (leave-one-out, blended with its
 * prior season early on). `baseline` is null only when the blend needs a
 * prior-season mean that does not exist; such games are excluded from every
 * sample. Game deltas are `actual - baseline` per metric.
 */
export type YardsVsAverageGame = {
  key: string;
  season: number;
  week: number;
  defense: string;
  offense: string;
  /** Offense's other same-season games feeding the leave-one-out component (the blend's completedGames). */
  otherGames: number;
  priorWeight: number;
  currentWeight: number;
  actual: YardsVsAverageMetricValues;
  baseline: YardsVsAverageMetricValues | null;
};

export type YardsVsAverageMetricSample = {
  gamesSampled: number;
  /** Mean per-game delta in yards. */
  deltaYds: number | null;
  /** 100 * sum(actual - baseline) / sum(baseline), one decimal; null when suppressed. */
  deltaPct: number | null;
  /** Rank 1 = most negative delta (best defense). */
  rankYds: number | null;
  rankPct: number | null;
  gamesAbove: number;
  gamesBelow: number;
};

export type YardsVsAverageMetricSamples = Record<YardsVsAverageMetricKey, YardsVsAverageMetricSample>;

export type YardsVsAverageRow = {
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  samples: Record<YardsVsAverageSampleKey, YardsVsAverageMetricSamples>;
};

export type YardsVsAverageArtifact = {
  schemaVersion: typeof YARDS_VS_AVERAGE_SCHEMA_VERSION;
  generatedAt: string;
  season: number;
  week: number | null;
  baselinePolicy: {
    version: string;
    /** Prior-season weight after 0, 1, 2, ... other same-season games (last value applies to every larger count). */
    priorWeights: readonly number[];
    currentComponent: string;
    priorComponent: string;
  };
  percent: {
    formula: string;
    minBaselinePerGame: number;
    suppressedMetrics: readonly YardsVsAverageMetricKey[];
  };
  metrics: Record<YardsVsAverageMetricKey, string>;
  games: readonly YardsVsAverageGame[];
  rows: readonly YardsVsAverageRow[];
};
