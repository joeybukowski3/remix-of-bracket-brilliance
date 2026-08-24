import { fitStandardizer, applyStandardizer } from "../phase2/standardize";
import { computeRidgeAdjustment } from "../phase2/ridgeAdjustment";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import { computeRidgeAdjustmentWithPrior } from "../phase3/ridgeWithPrior";
import type { PriorRatings } from "../phase3/types";

export type TeamRatings = { offense: number; defense: number };

/**
 * Computes per-team composite offense/defense Ridge+prior ratings at one
 * walk-forward cutoff — factored out of
 * phase3/phase3WalkForwardCore.ts's RIDGE_WITH_PRIOR branch so Phase 4 can
 * consume the raw offense/defense pair (Phase 3 only exposed the already-
 * blended power rating, since margin translation was its only consumer).
 * Same standardize-per-metric-then-average convention as Phase 2/3.
 */
export function computeCompositeRidgeWithPriorRatings(
  teamIds: readonly string[],
  metricSet: readonly CfbMetricName[],
  observationsByMetric: ReadonlyMap<CfbMetricName, readonly GameObservation[]>,
  priors: ReadonlyMap<string, PriorRatings>,
  lambda: number,
): Map<string, TeamRatings> {
  const offenseParts = new Map<string, number[]>();
  const defenseParts = new Map<string, number[]>();

  for (const metric of metricSet) {
    const obs = observationsByMetric.get(metric) ?? [];
    const plain = computeRidgeAdjustment(teamIds, obs, { lambda: 5, includeHfa: true });
    const offStd = fitStandardizer(plain.teams.map((t) => t.offense).filter((v): v is number => v !== null));
    const defStd = fitStandardizer(plain.teams.map((t) => t.defense).filter((v): v is number => v !== null));

    const priorOffenseRaw = new Map<string, number>();
    const priorDefenseRaw = new Map<string, number>();
    for (const teamId of teamIds) {
      const prior = priors.get(teamId);
      if (prior?.priorOffense !== null && prior?.priorOffense !== undefined) {
        priorOffenseRaw.set(teamId, prior.priorOffense * offStd.std + offStd.mean);
      }
      if (prior?.priorDefense !== null && prior?.priorDefense !== undefined) {
        priorDefenseRaw.set(teamId, prior.priorDefense * defStd.std + defStd.mean);
      }
    }

    const withPrior = computeRidgeAdjustmentWithPrior(teamIds, obs, { lambda, includeHfa: true }, priorOffenseRaw, priorDefenseRaw);

    for (const team of withPrior.teams) {
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

  const result = new Map<string, TeamRatings>();
  for (const teamId of teamIds) {
    const off = offenseParts.get(teamId);
    const def = defenseParts.get(teamId);
    if (!off || off.length === 0 || !def || def.length === 0) continue;
    result.set(teamId, {
      offense: off.reduce((s, v) => s + v, 0) / off.length,
      defense: def.reduce((s, v) => s + v, 0) / def.length,
    });
  }
  return result;
}
