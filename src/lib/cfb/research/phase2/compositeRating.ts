import { applyStandardizer, fitStandardizer, type Standardizer } from "./standardize";
import type { CfbMetricName, TeamStrength } from "./types";

export type MetricAdjustmentResult = { metric: CfbMetricName; teams: TeamStrength[] };

export type CompositeTeamRating = {
  teamExternalId: string;
  offensePower: number | null;
  defensePower: number | null;
  power: number | null;
};

/**
 * Blends per-metric opponent-adjusted offense/defense strengths into one
 * composite rating: equal-weight average within offense across metrics,
 * equal-weight average within defense, then 50/50 offense+defense into
 * power. For a 2-metric set (e.g. Section 1's YPP+PPP) this is exactly
 * the specified 50/50 blend; for N metrics it generalizes to 1/N each.
 * Standardization uses training-window-only per-metric statistics (never
 * the held-out week) — see Section 7/11.
 */
export function buildCompositeRatings(
  perMetricResults: readonly MetricAdjustmentResult[],
  teamIds: readonly string[],
): { ratings: CompositeTeamRating[]; standardizers: Record<string, { offense: Standardizer; defense: Standardizer }> } {
  const standardizers: Record<string, { offense: Standardizer; defense: Standardizer }> = {};
  const standardizedByMetric = new Map<string, Map<string, { offense: number | null; defense: number | null }>>();

  for (const result of perMetricResults) {
    const offenseValues = result.teams.map((t) => t.offense).filter((v): v is number => v !== null);
    const defenseValues = result.teams.map((t) => t.defense).filter((v): v is number => v !== null);
    const offenseStd = fitStandardizer(offenseValues);
    const defenseStd = fitStandardizer(defenseValues);
    standardizers[result.metric] = { offense: offenseStd, defense: defenseStd };

    const byTeam = new Map<string, { offense: number | null; defense: number | null }>();
    for (const team of result.teams) {
      byTeam.set(team.teamExternalId, {
        offense: team.offense === null ? null : applyStandardizer(team.offense, offenseStd),
        defense: team.defense === null ? null : applyStandardizer(team.defense, defenseStd),
      });
    }
    standardizedByMetric.set(result.metric, byTeam);
  }

  const ratings: CompositeTeamRating[] = teamIds.map((teamId) => {
    const offenseParts: number[] = [];
    const defenseParts: number[] = [];
    for (const byTeam of standardizedByMetric.values()) {
      const entry = byTeam.get(teamId);
      if (entry?.offense !== null && entry?.offense !== undefined) offenseParts.push(entry.offense);
      if (entry?.defense !== null && entry?.defense !== undefined) defenseParts.push(entry.defense);
    }
    const offensePower = offenseParts.length === 0 ? null : offenseParts.reduce((s, v) => s + v, 0) / offenseParts.length;
    const defensePower = defenseParts.length === 0 ? null : defenseParts.reduce((s, v) => s + v, 0) / defenseParts.length;
    const power = offensePower === null || defensePower === null ? null : 0.5 * offensePower + 0.5 * defensePower;
    return { teamExternalId: teamId, offensePower, defensePower, power };
  });

  return { ratings, standardizers };
}
