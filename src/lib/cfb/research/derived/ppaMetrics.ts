import { weightedMean } from "./weightedStats";
import type { WeightedPlay } from "./teamGameAggregation.types";

/** Section 5: never impute missing PPA as zero — weightedMean already skips null values entirely. */
export function computePpaPerPlay(rows: readonly WeightedPlay[]): {
  ppaPerPlay: number | null;
  ppaCoveredPlayCount: number;
  ppaCoveragePct: number;
} {
  const covered = rows.filter((row) => row.row.providerPpa !== null && row.weight > 0);
  const { mean } = weightedMean(rows.map((row) => ({ value: row.row.providerPpa, weight: row.weight })));
  const eligibleWithWeight = rows.filter((row) => row.weight > 0).length;
  return {
    ppaPerPlay: mean,
    ppaCoveredPlayCount: covered.length,
    ppaCoveragePct: eligibleWithWeight === 0 ? 0 : Math.round((covered.length / eligibleWithWeight) * 10_000) / 100,
  };
}

/** ypp: yards per play — weighted mean of yardsGained over eligible plays. */
export function computeYardsPerPlay(rows: readonly WeightedPlay[]): number | null {
  return weightedMean(rows.map((row) => ({ value: row.row.yardsGained, weight: row.weight }))).mean;
}

/**
 * ppp: points per play. Preserves JKB V1 compatibility by using the
 * team's final box-score points divided by the (policy-weighted) eligible
 * play count, rather than attempting fragile play-by-play point
 * attribution from offenseScore/defenseScore deltas (see Work Unit 3
 * final report, Section 12 design note).
 */
export function computePointsPerPlay(finalTeamScore: number | null, totalWeight: number): number | null {
  if (finalTeamScore === null || totalWeight <= 0) return null;
  return finalTeamScore / totalWeight;
}
