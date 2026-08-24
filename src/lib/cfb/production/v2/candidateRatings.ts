// CFB Model V2 — connectivity-aware Ridge team ratings (Phase 10 §5/§10,
// WU2 §10/§12). Faithful port of
// src/lib/cfb/research/phase8/candidateRatings.ts's computeCandidateTeamRatings,
// specialized to the frozen finalist (COMPONENT_SIZE connectivity, no
// staleness — see connectivity.ts/config.ts): for each metric (YPP, PPP),
// fit a plain, weakly-regularized Ridge to establish a raw-scale
// standardizer, convert the prior (already on a standardized scale) into
// that metric's raw units as the penalty center, then fit the real
// per-team-λ prior-centered Ridge. Offense/defense are standardized per
// metric and averaged across YPP+PPP — never re-derived or re-scaled
// beyond this (§12 identifiability).

import { fitStandardizer, applyStandardizer } from "./standardize";
import { computeCfbV2Ridge, computeCfbV2RidgeWithPerTeamLambda } from "./ridge";
import type { CfbV2MetricName, CfbV2Observation } from "./ratingInputs";

/** Reference-scale Ridge lambda (Phase 8 §8 — weak, not the production penalty). */
const REFERENCE_RIDGE_LAMBDA = 5;

export type CfbV2CandidateTeamRating = { teamId: string; offenseRating: number; defenseRating: number };

export function computeCfbV2CandidateRatings(
  teamIds: readonly string[],
  metricSet: readonly CfbV2MetricName[],
  observationsByMetric: ReadonlyMap<CfbV2MetricName, readonly CfbV2Observation[]>,
  priorOffenseByTeam: ReadonlyMap<string, number>,
  priorDefenseByTeam: ReadonlyMap<string, number>,
  lambdaByTeam: ReadonlyMap<string, number>,
): Map<string, CfbV2CandidateTeamRating> {
  const offenseParts = new Map<string, number[]>();
  const defenseParts = new Map<string, number[]>();

  for (const metric of metricSet) {
    const obs = observationsByMetric.get(metric) ?? [];
    const plain = computeCfbV2Ridge(teamIds, obs, REFERENCE_RIDGE_LAMBDA, true);
    const offStd = fitStandardizer(plain.teams.map((t) => t.offense).filter((v): v is number => v !== null));
    const defStd = fitStandardizer(plain.teams.map((t) => t.defense).filter((v): v is number => v !== null));

    const priorOffenseRaw = new Map<string, number>();
    const priorDefenseRaw = new Map<string, number>();
    for (const teamId of teamIds) {
      const priorOffense = priorOffenseByTeam.get(teamId);
      const priorDefense = priorDefenseByTeam.get(teamId);
      if (priorOffense !== undefined) priorOffenseRaw.set(teamId, priorOffense * offStd.std + offStd.mean);
      if (priorDefense !== undefined) priorDefenseRaw.set(teamId, priorDefense * defStd.std + defStd.mean);
    }

    const withPrior = computeCfbV2RidgeWithPerTeamLambda(teamIds, obs, lambdaByTeam, true, priorOffenseRaw, priorDefenseRaw);

    for (const team of withPrior.teams) {
      if (team.offense !== null) {
        const arr = offenseParts.get(team.teamId) ?? [];
        arr.push(applyStandardizer(team.offense, offStd));
        offenseParts.set(team.teamId, arr);
      }
      if (team.defense !== null) {
        const arr = defenseParts.get(team.teamId) ?? [];
        arr.push(applyStandardizer(team.defense, defStd));
        defenseParts.set(team.teamId, arr);
      }
    }
  }

  const ratings = new Map<string, CfbV2CandidateTeamRating>();
  for (const teamId of teamIds) {
    const off = offenseParts.get(teamId);
    const def = defenseParts.get(teamId);
    if (!off || off.length === 0 || !def || def.length === 0) continue;
    ratings.set(teamId, {
      teamId,
      offenseRating: off.reduce((s, v) => s + v, 0) / off.length,
      defenseRating: def.reduce((s, v) => s + v, 0) / def.length,
    });
  }
  return ratings;
}
