import { fitStandardizer, applyStandardizer } from "../phase2/standardize";
import { computeRidgeAdjustment } from "../phase2/ridgeAdjustment";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import type { PriorRatings } from "../phase3/types";
import { computeCurrentEvidencePower } from "./currentEvidenceRating";
import { connectivityLambdaMultiplier } from "./lambdaMultipliers";
import { computeRidgeAdjustmentWithPerTeamLambda } from "./ridgeWithPerTeamLambda";
import { computeStaleness } from "./stalenessDiagnostic";
import { stalenessAdjustmentMultiplier, type StalenessFormParams } from "./stalenessMultiplier";
import type { Phase8CandidateSpec, WeekGraphSnapshot } from "./types";

export type CandidateTeamRatingsResult = {
  ratings: Map<string, { offense: number; defense: number }>;
  stalenessByTeam: Map<string, number | null>; // adjustedStaleness, for downstream diagnostics/artifacts
};

/**
 * Section 5/8/10 — mirrors phase4/ratingProvider.ts's
 * computeCompositeRidgeWithPriorRatings exactly (same standardize-per-metric
 * -then-average blending), but replaces the single scalar λ with a
 * per-team λ_i = baseLambda × connectivityMultiplier_i × stalenessMultiplier_i.
 * GLOBAL_BASELINE + "NONE" staleness reduces both multipliers to 1 for
 * every team, which is BASELINE_RIDGE_PRIOR's exact per-team-constant case.
 */
export function computeCandidateTeamRatings(
  teamIds: readonly string[],
  metricSet: readonly CfbMetricName[],
  observationsByMetric: ReadonlyMap<CfbMetricName, readonly GameObservation[]>,
  priors: ReadonlyMap<string, PriorRatings>,
  graphSnapshot: WeekGraphSnapshot,
  spec: Phase8CandidateSpec,
): CandidateTeamRatingsResult {
  const currentEvidencePower = computeCurrentEvidencePower(teamIds, metricSet, observationsByMetric);
  const stalenessParams: StalenessFormParams = {
    floor: spec.stalenessFloor ?? 0.5,
    thresholdLow: spec.stalenessThresholdLow ?? 0.3,
    thresholdHigh: spec.stalenessThresholdHigh ?? 1.0,
  };

  const lambdaByTeam = new Map<string, number>();
  const stalenessByTeam = new Map<string, number | null>();
  for (const teamId of teamIds) {
    const graph = graphSnapshot.byTeam.get(teamId);
    const connMult = graph ? connectivityLambdaMultiplier(spec.connectivity, graph) : 1;

    const prior = priors.get(teamId);
    const priorPower =
      prior?.priorOffense !== null && prior?.priorOffense !== undefined && prior?.priorDefense !== null && prior?.priorDefense !== undefined
        ? 0.5 * (prior.priorOffense + prior.priorDefense)
        : null;
    const { adjustedStaleness } = computeStaleness(currentEvidencePower.get(teamId) ?? null, priorPower, graph?.weightedDegree ?? 0);
    stalenessByTeam.set(teamId, adjustedStaleness);
    const staleMult = stalenessAdjustmentMultiplier(spec.staleness, adjustedStaleness, stalenessParams);

    lambdaByTeam.set(teamId, spec.baseLambda * connMult * staleMult);
  }

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
      if (prior?.priorOffense !== null && prior?.priorOffense !== undefined) priorOffenseRaw.set(teamId, prior.priorOffense * offStd.std + offStd.mean);
      if (prior?.priorDefense !== null && prior?.priorDefense !== undefined) priorDefenseRaw.set(teamId, prior.priorDefense * defStd.std + defStd.mean);
    }

    const withPrior = computeRidgeAdjustmentWithPerTeamLambda(teamIds, obs, lambdaByTeam, true, priorOffenseRaw, priorDefenseRaw);

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

  const ratings = new Map<string, { offense: number; defense: number }>();
  for (const teamId of teamIds) {
    const off = offenseParts.get(teamId);
    const def = defenseParts.get(teamId);
    if (!off || off.length === 0 || !def || def.length === 0) continue;
    ratings.set(teamId, {
      offense: off.reduce((s, v) => s + v, 0) / off.length,
      defense: def.reduce((s, v) => s + v, 0) / def.length,
    });
  }

  return { ratings, stalenessByTeam };
}
