/**
 * Shared presentation adapter for the Team Comparison visualizations (The
 * Spine, Rank Towers, Signature Profile).
 *
 * This module invents no new ranking, comparison or direction logic. It only
 * reshapes the already-resolved `MatchupDisplayMetric` rows — the same rows
 * `MatchupComparisonCard` renders in the detailed table — into a flat model a
 * chart can consume without re-deriving "is rank 1 good or bad" or "which
 * side leads" itself. Rank orientation (1 = best) already lives in
 * `rankTier.ts`; winner classification already lives in
 * `matchupCategoryAdvantage.ts`'s `classifyMetricComparison`, captured on
 * every row as `comparison`. Both are read here, never recomputed.
 *
 * A missing rank stays `null` all the way through — it is never coerced to 0
 * or 32, so a chart cannot mistake "no data" for "worst in the league".
 */

import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { MatchupCategoryId, MetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { NFL_TEAM_COUNT } from "@/lib/nfl/rankTier";

/** Which side, if either, leads this metric. Mirrors `MetricComparison` with a flatter vocabulary for chart consumers. */
export type MatchupVisualLeader = "away" | "home" | "tie" | "none";

export type MatchupVisualSide = {
  value: number | null;
  rank: number | null;
  formatted: string;
  /** 0 (rank 1, best) .. 1 (rank 32, worst). Null when the rank is unavailable — never defaulted to an end of the scale. */
  percentile: number | null;
};

export type MatchupVisualMetric = {
  /** Same key as the source `MatchupDisplayMetric` — stable across categories. */
  id: string;
  label: string;
  shortLabel: string;
  categoryId: MatchupCategoryId;
  comparison: MetricComparison;
  leader: MatchupVisualLeader;
  /**
   * False for "context-only" / "none" direction metrics (e.g. time of
   * possession, play-calling rate). Those stay in the detailed table but must
   * never be charted as better/worse.
   */
  isChartEligible: boolean;
  away: MatchupVisualSide;
  home: MatchupVisualSide;
  /** Absolute rank differential, or null when either rank is unavailable. Never used to imply a value on the missing side. */
  rankGap: number | null;
};

function toLeader(comparison: MetricComparison): MatchupVisualLeader {
  if (comparison === "away" || comparison === "home") return comparison;
  if (comparison === "tie") return "tie";
  return "none";
}

/** Rank 1 -> 0 (best), rank 32 -> 1 (worst). Null propagates — a missing rank has no position. */
function rankPercentile(rank: number | null): number | null {
  if (rank == null || !Number.isFinite(rank)) return null;
  return Math.max(0, Math.min(1, (rank - 1) / (NFL_TEAM_COUNT - 1)));
}

function toVisualSide(side: MatchupDisplayMetric["away"]): MatchupVisualSide {
  return {
    value: side.value,
    rank: side.rank,
    formatted: side.formatted,
    percentile: rankPercentile(side.rank),
  };
}

/** Adapt one already-resolved row into the shared visualization model. Pure field mapping — no new comparison logic. */
export function toVisualMetric(
  row: MatchupDisplayMetric,
  categoryId: MatchupCategoryId
): MatchupVisualMetric {
  const away = toVisualSide(row.away);
  const home = toVisualSide(row.home);
  const isChartEligible = row.direction !== "context-only" && row.direction !== "none";

  return {
    id: row.key,
    label: row.label,
    shortLabel: row.shortLabel ?? row.label,
    categoryId,
    comparison: row.comparison,
    leader: toLeader(row.comparison),
    isChartEligible,
    away,
    home,
    rankGap: away.rank != null && home.rank != null ? Math.abs(away.rank - home.rank) : null,
  };
}

/** Adapt every row of one category. */
export function toVisualMetrics(
  rows: readonly MatchupDisplayMetric[],
  categoryId: MatchupCategoryId
): MatchupVisualMetric[] {
  return rows.map((row) => toVisualMetric(row, categoryId));
}

/** Only the metrics a chart is allowed to present as better/worse. */
export function chartEligibleMetrics(
  metrics: readonly MatchupVisualMetric[]
): MatchupVisualMetric[] {
  return metrics.filter((metric) => metric.isChartEligible);
}

/** Look up one resolved row by key, preserving the "N/A slot, not a missing row" contract when absent. */
export function findVisualMetric(
  metrics: readonly MatchupVisualMetric[],
  id: string
): MatchupVisualMetric | undefined {
  return metrics.find((metric) => metric.id === id);
}
