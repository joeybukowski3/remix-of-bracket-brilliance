import { computeRidgeAdjustment } from "../phase2/ridgeAdjustment";
import { fitStandardizer, applyStandardizer } from "../phase2/standardize";
import type { CfbMetricName, GameObservation } from "../phase2/types";

const RIDGE_LAMBDA = 5; // same "plain" reference-distribution lambda phase4/ratingProvider.ts uses internally for standardization

/**
 * Section 7 — currentEvidenceEstimate: a PRIOR-FREE current-season-only
 * Ridge rating (power = 0.5*(offense+defense)), computed the same
 * standardize-per-metric-then-average way as everywhere else in this
 * research tree. This is the "what does the evidence alone say" half of
 * the staleness diagnostic — deliberately never blended with the prior, so
 * staleness isn't circularly defined against itself.
 */
export function computeCurrentEvidencePower(
  teamIds: readonly string[],
  metricSet: readonly CfbMetricName[],
  observationsByMetric: ReadonlyMap<CfbMetricName, readonly GameObservation[]>,
): Map<string, number> {
  const offenseParts = new Map<string, number[]>();
  const defenseParts = new Map<string, number[]>();

  for (const metric of metricSet) {
    const obs = observationsByMetric.get(metric) ?? [];
    const result = computeRidgeAdjustment(teamIds, obs, { lambda: RIDGE_LAMBDA, includeHfa: true });
    const offStd = fitStandardizer(result.teams.map((t) => t.offense).filter((v): v is number => v !== null));
    const defStd = fitStandardizer(result.teams.map((t) => t.defense).filter((v): v is number => v !== null));
    for (const team of result.teams) {
      if (team.offense !== null) {
        const arr = offenseParts.get(team.teamExternalId) ?? [];
        arr.push(applyStandardizer(team.offense, offStd));
        offenseParts.set(team.teamExternalId, arr);
      }
      if (team.defense !== null) {
        const arr = defenseParts.get(team.teamExternalId) ?? [];
        arr.push(applyStandardizer(team.defense, defStd));
        defenseParts.set(team.teamExternalId, arr);
      }
    }
  }

  const power = new Map<string, number>();
  for (const teamId of teamIds) {
    const off = offenseParts.get(teamId);
    const def = defenseParts.get(teamId);
    if (!off || off.length === 0 || !def || def.length === 0) continue;
    const offMean = off.reduce((s, v) => s + v, 0) / off.length;
    const defMean = def.reduce((s, v) => s + v, 0) / def.length;
    power.set(teamId, 0.5 * (offMean + defMean));
  }
  return power;
}
