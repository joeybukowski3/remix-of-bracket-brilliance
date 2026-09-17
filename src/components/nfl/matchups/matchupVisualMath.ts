import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { CategoryAdvantageResult } from "@/lib/nfl/matchupCategoryAdvantage";
import { NFL_TEAM_COUNT } from "@/lib/nfl/rankTier";

const MIN_TOWER_PERCENT = 8;

/** Rank-to-height presentation mapping. Missing ranks remain missing, never worst. */
export function towerHeightFromRank(rank: number | null): number | null {
  if (rank == null || !Number.isFinite(rank)) return null;
  const percentile = Math.max(0, Math.min(1, (rank - 1) / (NFL_TEAM_COUNT - 1)));
  return Math.max(MIN_TOWER_PERCENT, (1 - percentile) * 100);
}

/** Visual magnitude comes directly from the existing category lead counts. */
export function categorySideStrength(
  result: CategoryAdvantageResult,
  side: "away" | "home"
): number {
  if (result.eligible <= 0) return 0;
  const leads = side === "away" ? result.awayLeads : result.homeLeads;
  return Math.max(0, Math.min(100, (leads / result.eligible) * 100));
}

function decimalPlaces(metric: MatchupDisplayMetric): number {
  if (metric.key.toLowerCase().includes("epa")) return 3;
  if (metric.key.toLowerCase().includes("yardsperplay")) return 2;
  return 1;
}

/** Absolute raw-value gap; direction still comes exclusively from metric.comparison. */
export function formatMetricDifference(metric: MatchupDisplayMetric): string | null {
  if (
    (metric.comparison !== "away" && metric.comparison !== "home") ||
    metric.away.value == null ||
    metric.home.value == null ||
    !Number.isFinite(metric.away.value) ||
    !Number.isFinite(metric.home.value)
  ) return null;

  const difference = Math.abs(metric.away.value - metric.home.value);
  const percentage = metric.away.formatted.includes("%") || metric.home.formatted.includes("%");
  return `+${difference.toFixed(percentage ? 1 : decimalPlaces(metric))}${percentage ? " pp" : ""}`;
}
