// CFB Model V2 — production team-rating generator (Phase 10 §9/§13, WU2).
// Orchestrates: team resolution → prior-season rating → preseason prior →
// leakage-safe schedule graph → connectivity-aware Ridge → CfbV2TeamRating[].
// No game projections, no scoring, no probabilities (WU2 stop condition).

import { getJkbTeamIdForCfbdName } from "@/data/cfb/externalTeamMapping";
import { normalizeCfbdGames } from "../../pipeline/normalizeCfbd";
import {
  buildTeamGamePerformances,
  buildV2Observations,
  resolveTeamsAndGames,
  type CfbdGame,
  type CfbdGameTeamStats,
  type CfbdReturningProduction,
  type CfbdTalent,
  type CfbdTeam,
  type CfbV2Observation,
} from "./ratingInputs";
import { computeCfbV2PrevSeasonRatings } from "./prevSeasonRating";
import { applyCfbV2PriorModel, type CfbV2PriorRawInputs } from "./priorModel";
import { buildCfbV2ScheduleGraph } from "./scheduleGraph";
import { effectiveConnectivityLambda } from "./connectivity";
import { computeCfbV2CandidateRatings } from "./candidateRatings";
import { CFB_V2_CONFIG_VERSION, CFB_V2_RATING_CONFIG } from "./config";
import { CFB_V2_IPR_MODEL_VERSION } from "./versions";
import { CFB_V2_PRIOR_COEFFICIENTS_VERSION } from "./priorCoefficients";
import type { CfbV2Connectivity, CfbV2RatingStatus, CfbV2TeamRating } from "./types";

export type CfbV2BuildRatingsInput = {
  season: number;
  /** ISO timestamp of the last completed game folded in. */
  dataAsOf: string;
  /** ISO timestamp this build actually ran — injected explicitly (never Date.now() internally) so the builder is pure and deterministic (§21). */
  generatedAt: string;
  /** Completed-game-set cutoff — ratings reflect games with week < asOfWeek only (0 = preseason, no games folded in yet). */
  asOfWeek: number;
  /** Current-season FBS team roster (used once to resolve CFBD-id → JKB-id for both seasons). */
  teams: readonly CfbdTeam[];
  currentSeasonGames: readonly CfbdGame[];
  currentSeasonTeamGameStats: readonly CfbdGameTeamStats[];
  priorSeasonGames: readonly CfbdGame[];
  priorSeasonTeamGameStats: readonly CfbdGameTeamStats[];
  returningProduction: readonly CfbdReturningProduction[];
  talent: readonly CfbdTalent[];
};

const METRICS = CFB_V2_RATING_CONFIG.coreMetrics;

function mapByJkbName<T extends { team: string }>(rows: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const teamId = getJkbTeamIdForCfbdName(row.team);
    if (teamId) map.set(teamId, row);
  }
  return map;
}

function isFinite2(v: number): boolean {
  return Number.isFinite(v);
}

export function buildCfbV2TeamRatings(input: CfbV2BuildRatingsInput): CfbV2TeamRating[] {
  const { mappings, normalizedGames: normalizedCurrentGames } = resolveTeamsAndGames(input.teams, input.currentSeasonGames);
  const fbsTeamIds = mappings.map((m) => m.jkbTeamId);
  const currentPerformances = buildTeamGamePerformances(input.currentSeasonTeamGameStats, normalizedCurrentGames, mappings);

  const normalizedPriorGames = normalizeCfbdGames(input.priorSeasonGames, mappings);
  const priorPerformances = buildTeamGamePerformances(input.priorSeasonTeamGameStats, normalizedPriorGames, mappings);
  const prevSeasonRatings = computeCfbV2PrevSeasonRatings(fbsTeamIds, priorPerformances, normalizedPriorGames);

  const returningByTeam = mapByJkbName(input.returningProduction);
  const talentByTeam = mapByJkbName(input.talent);

  const priorRawInputs: CfbV2PriorRawInputs[] = fbsTeamIds.map((teamId) => {
    const prev = prevSeasonRatings.get(teamId);
    return {
      teamId,
      prevSeasonOffense: prev?.offense ?? null,
      prevSeasonDefense: prev?.defense ?? null,
      returningProductionOffense: returningByTeam.get(teamId)?.percentPPA ?? null,
      talent: talentByTeam.get(teamId)?.talent ?? null,
    };
  });
  const priorByTeam = new Map(priorRawInputs.map((row) => [row.teamId, applyCfbV2PriorModel(row)]));

  const graph = buildCfbV2ScheduleGraph(input.season, input.asOfWeek, fbsTeamIds, normalizedCurrentGames);

  const cutoffGameIds = new Set(
    normalizedCurrentGames.filter((g) => g.season === input.season && g.status === "final" && g.week < input.asOfWeek).map((g) => g.gameId),
  );
  const cutoffPerformances = currentPerformances.filter((p) => cutoffGameIds.has(p.gameId));

  const observationsByMetric = new Map<(typeof METRICS)[number], readonly CfbV2Observation[]>();
  for (const metric of METRICS) observationsByMetric.set(metric, buildV2Observations(cutoffPerformances, normalizedCurrentGames, metric));

  const priorOffenseByTeam = new Map(fbsTeamIds.map((id) => [id, priorByTeam.get(id)!.priorOffense]));
  const priorDefenseByTeam = new Map(fbsTeamIds.map((id) => [id, priorByTeam.get(id)!.priorDefense]));
  const lambdaByTeam = new Map(fbsTeamIds.map((id) => [id, effectiveConnectivityLambda(graph.byTeam.get(id)?.componentSize ?? 1)]));

  const candidateRatings = computeCfbV2CandidateRatings(fbsTeamIds, METRICS, observationsByMetric, priorOffenseByTeam, priorDefenseByTeam, lambdaByTeam);

  return fbsTeamIds.map((teamId): CfbV2TeamRating => {
    const prior = priorByTeam.get(teamId)!;
    const graphMetrics = graph.byTeam.get(teamId);
    const candidate = candidateRatings.get(teamId);
    // No current-season evidence yet (e.g. asOfWeek=0/preseason, or a
    // team with zero games entering this cutoff): the correct limiting
    // behavior of a prior-centered Ridge with no observations IS the
    // prior itself — not an absent rating (WU2 §26).
    const offenseRating = candidate?.offenseRating ?? prior.priorOffense;
    const defenseRating = candidate?.defenseRating ?? prior.priorDefense;
    const overallRating = 0.5 * (offenseRating + defenseRating);
    const connectivity: CfbV2Connectivity = {
      componentSize: graphMetrics?.componentSize ?? 1,
      regularizationMultiplier: (lambdaByTeam.get(teamId) ?? CFB_V2_RATING_CONFIG.connectivity.baseLambda) / CFB_V2_RATING_CONFIG.connectivity.baseLambda,
    };
    const ratingStatus: CfbV2RatingStatus = isFinite2(offenseRating) && isFinite2(defenseRating) ? "computed" : "insufficient-data";

    return {
      teamId,
      season: input.season,
      asOfWeek: input.asOfWeek,
      modelVersion: CFB_V2_IPR_MODEL_VERSION,
      offenseRating,
      defenseRating,
      overallRating,
      preseasonPriorOffense: prior.priorOffense,
      preseasonPriorDefense: prior.priorDefense,
      priorTier: prior.priorTier,
      gamesPlayed: graphMetrics?.gamesPlayed ?? 0,
      classification: "fbs",
      connectivity,
      ratingStatus,
      configVersion: `${CFB_V2_CONFIG_VERSION}+${CFB_V2_PRIOR_COEFFICIENTS_VERSION}`,
      generatedAt: input.generatedAt,
      dataAsOf: input.dataAsOf,
    };
  });
}
