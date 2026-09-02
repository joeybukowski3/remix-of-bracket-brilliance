/**
 * WU4B S4 — walk-forward evaluation core for the share/allocation
 * architecture. Pure functions; the script wires seasons/folds and IO.
 */
import { computeMetrics, type NflOpportunityPredictionPair } from "../qbOpportunityEvaluation";
import type { NflRoleAllocationDataset, NflTeamPositionalPoolRow } from "./types";
import {
  buildTeamPriorPoolTendency,
  computePoolLeagueConstants,
  projectRushPools,
  projectTargetablePass,
  type NflPoolLeagueConstants,
  type NflTargetablePassApproach,
} from "./poolModels";
import {
  fitShareModel,
  predictRawShare,
  type NflNoHistoryCalibration,
  type NflShareModelFit,
  type NflShareModelKey,
  type NflShareObservation,
  type NflTeamChangeCalibration,
} from "./shareModels";
import {
  allocatePool,
  classifyRoleCohort,
  measureNormalizationDistortion,
  type NflDominantAnchorConfig,
  type NflPoolAllocation,
  type NflRoleCohort,
} from "./allocate";

const RANK_CAP = 6;

function rankBucket(rank: number | null): string {
  if (rank == null) return "NA";
  return String(Math.min(rank, RANK_CAP));
}

export function buildShareObservations(dataset: NflRoleAllocationDataset): {
  rush: NflShareObservation[];
  receiving: NflShareObservation[];
  poolRows: NflTeamPositionalPoolRow[];
} {
  const poolByTeamGame = new Map(dataset.teamPositionalPools.map((p) => [`${p.gameId}|${p.team}`, p]));

  const rush: NflShareObservation[] = [];
  for (const r of dataset.rushShares) {
    const pool = poolByTeamGame.get(`${r.gameId}|${r.team}`);
    if (!pool) continue;
    const poolActual = pool.rushPools[r.poolKey];
    rush.push({
      season: r.season,
      week: r.week,
      gameId: r.gameId,
      team: r.team,
      playerId: r.playerId,
      playerName: r.playerName,
      poolId: `${r.gameId}|${r.team}|${r.poolKey}`,
      poolKey: r.poolKey,
      rankKey: `rank:${rankBucket(r.role.depthRankProxy)}`,
      depthRankProxy: r.role.depthRankProxy,
      isProjectedStarter: r.role.isProjectedStarter,
      priorShare: r.role.priorPoolShare,
      priorGamesPlayed: r.role.priorGamesPlayed,
      noHistory: r.role.noHistory,
      limitedHistory: r.role.limitedHistory,
      teamChanged: r.role.teamChanged,
      roleSourced: false,
      concentration: r.role.committeeConcentration,
      rosterCompetitionCount: r.role.rosterCompetitionCount,
      priorEfficiency: r.priorYardsPerCarry,
      actualShare: r.shareOfPositionalPool,
      actualVolume: r.carries,
      actualYards: r.rushingYards,
      context: { teamDesignedRushes: pool.designedRushes, teamDropbacks: pool.dropbacks, poolActual, gameDateUtc: r.gameDateUtc },
    });
  }

  const receiving: NflShareObservation[] = [];
  for (const r of dataset.receivingShares) {
    const pool = poolByTeamGame.get(`${r.gameId}|${r.team}`);
    if (!pool) continue;
    receiving.push({
      season: r.season,
      week: r.week,
      gameId: r.gameId,
      team: r.team,
      playerId: r.playerId,
      playerName: r.playerName,
      poolId: `${r.gameId}|${r.team}|receiving`,
      poolKey: "receiving",
      rankKey: `${r.role.position}:${rankBucket(r.role.depthRankProxy)}`,
      depthRankProxy: r.role.depthRankProxy,
      isProjectedStarter: r.role.isProjectedStarter,
      priorShare: r.role.priorTargetShare,
      priorGamesPlayed: r.role.priorGamesPlayed,
      noHistory: r.role.noHistory,
      limitedHistory: r.role.limitedHistory,
      teamChanged: r.role.teamChanged,
      roleSourced: false,
      concentration: r.role.concentration,
      rosterCompetitionCount: r.role.rosterCompetitionCount,
      priorEfficiency: r.priorYardsPerTarget,
      actualShare: r.shareOfTargetable,
      actualVolume: r.targets,
      actualYards: r.receivingYards,
      context: { teamDesignedRushes: pool.designedRushes, teamDropbacks: pool.dropbacks, poolActual: pool.teamPassAttempts, gameDateUtc: r.gameDateUtc },
    });
  }
  return { rush, receiving, poolRows: dataset.teamPositionalPools };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type NflAllocationEvalConfig = {
  model: NflShareModelKey;
  /** "actual" isolates the share model; "projected" injects the S2 pool model. */
  poolSource: "actual" | "projected";
  /** only used for receiving. */
  targetableApproach: NflTargetablePassApproach;
};

export type NflMetricTriple = {
  share: ReturnType<typeof computeMetrics>;
  volume: ReturnType<typeof computeMetrics>;
  yards: ReturnType<typeof computeMetrics>;
};

export type NflAllocationEvalResult = {
  config: NflAllocationEvalConfig;
  leg: "rush" | "receiving";
  n: number;
  overall: NflMetricTriple;
  byCohort: Record<string, NflMetricTriple>;
  byTransitionCohort: Record<string, NflMetricTriple>;
  coherence: {
    pools: number;
    meanShareSum: number;
    meanVolumeResidual: number;
    poolsWithNegativeShare: number;
    poolsWithShareOverOne: number;
    poolsWithDuplicates: number;
    poolsEqualSplit: number;
  };
  rankQuality: { pairs: number; concordantPairRate: number };
  distortion: ReturnType<typeof measureNormalizationDistortion>;
};

function metricTriple(rows: readonly { actualShare: number | null; actualVolume: number; actualYards: number; predShare: number; predVolume: number; predYards: number }[]): NflMetricTriple {
  const sharePairs: NflOpportunityPredictionPair[] = rows.filter((r) => r.actualShare != null).map((r) => ({ actual: r.actualShare as number, predicted: r.predShare }));
  return {
    share: computeMetrics(sharePairs),
    volume: computeMetrics(rows.map((r) => ({ actual: r.actualVolume, predicted: r.predVolume }))),
    yards: computeMetrics(rows.map((r) => ({ actual: r.actualYards, predicted: r.predYards }))),
  };
}

/** Fraction of within-pool player pairs whose predicted volume order matches actual order. */
function concordantPairRate(allocations: readonly NflPoolAllocation[]): { pairs: number; rate: number } {
  let pairs = 0;
  let concordant = 0;
  for (const a of allocations) {
    const ps = a.players;
    for (let i = 0; i < ps.length; i += 1) {
      for (let j = i + 1; j < ps.length; j += 1) {
        const da = ps[i].obs.actualVolume - ps[j].obs.actualVolume;
        const dp = ps[i].projectedVolume - ps[j].projectedVolume;
        if (Math.abs(da) < 1e-9) continue;
        pairs += 1;
        if (Math.sign(da) === Math.sign(dp)) concordant += 1;
      }
    }
  }
  return { pairs, rate: pairs > 0 ? concordant / pairs : NaN };
}

export function evaluateAllocation(args: {
  leg: "rush" | "receiving";
  trainObs: readonly NflShareObservation[];
  validateObs: readonly NflShareObservation[];
  trainPoolRows: readonly NflTeamPositionalPoolRow[];
  allPoolRows: readonly NflTeamPositionalPoolRow[];
  config: NflAllocationEvalConfig;
  shrinkageK: number;
  leagueEfficiency: number;
  /** S5A calibration; null = S4 behaviour. */
  dominantAnchor?: NflDominantAnchorConfig | null;
  noHistoryCal?: NflNoHistoryCalibration | null;
  /** S5E role-transition calibration; null = S5A behaviour. */
  teamChangeCal?: NflTeamChangeCalibration | null;
  /** S5A: additive/multiplicative RB-pool-share correction learned on train. */
  rbPoolShareBoost?: number;
}): NflAllocationEvalResult {
  const league: NflPoolLeagueConstants = computePoolLeagueConstants(args.trainPoolRows);
  const fit: NflShareModelFit = fitShareModel(args.trainObs, args.shrinkageK);
  const anchor = args.dominantAnchor ?? null;
  const noHistoryCal = args.noHistoryCal ?? null;
  const teamChangeCal = args.teamChangeCal ?? null;
  const rbBoost = args.rbPoolShareBoost ?? 0;

  // group validate observations by poolId
  const byPool = new Map<string, NflShareObservation[]>();
  for (const o of args.validateObs) (byPool.get(o.poolId) ?? byPool.set(o.poolId, []).get(o.poolId)!).push(o);

  const allocations: NflPoolAllocation[] = [];
  for (const [, obs] of byPool) {
    const any = obs[0];
    let poolSize: number;
    if (args.config.poolSource === "actual") {
      poolSize = any.context.poolActual;
    } else if (args.leg === "rush") {
      const tendency = buildTeamPriorPoolTendency(args.allPoolRows, any.team, any.season, any.week, any.context.gameDateUtc);
      const pools = projectRushPools(any.context.teamDesignedRushes, tendency, league, rbBoost);
      poolSize = pools[any.poolKey as "qb" | "rb" | "wrTe"];
    } else {
      const tendency = buildTeamPriorPoolTendency(args.allPoolRows, any.team, any.season, any.week, any.context.gameDateUtc);
      poolSize = projectTargetablePass(args.config.targetableApproach, any.context.teamDropbacks, tendency, league).projectedTargetable;
    }
    allocations.push(
      allocatePool(
        obs,
        poolSize,
        (o) => predictRawShare(args.config.model, fit, o, o.noHistory ? noHistoryCal : null, teamChangeCal),
        args.leagueEfficiency,
        anchor,
      ),
    );
  }

  const flat = allocations.flatMap((a) =>
    a.players.map((p) => ({
      cohort: classifyRoleCohort(p.obs),
      actualShare: p.obs.actualShare,
      actualVolume: p.obs.actualVolume,
      actualYards: p.obs.actualYards,
      predShare: p.normalizedShare,
      predVolume: p.projectedVolume,
      predYards: p.projectedYards,
    })),
  );

  const cohorts: NflRoleCohort[] = ["dominantRb1", "committee1A1B", "lowVolumeBackup", "newTeamStarter", "rookieNoHistory", "other"];
  const byCohort: Record<string, NflMetricTriple> = {};
  for (const c of cohorts) {
    const subset = flat.filter((r) => r.cohort === c);
    if (subset.length > 0) byCohort[c] = metricTriple(subset);
  }

  // evidence-keyed transition cohorts (a row can appear in several)
  const flatWithObs = allocations.flatMap((a) => a.players);
  const transitionTags: Record<string, (p: (typeof flatWithObs)[number]) => boolean> = {
    teamChanged: (p) => p.obs.teamChanged === true,
    sameTeam: (p) => p.obs.teamChanged === false,
    noHistory: (p) => p.obs.noHistory,
    limitedHistory: (p) => p.obs.limitedHistory,
    projectedStarter: (p) => p.obs.isProjectedStarter,
    projectedBackup: (p) => p.obs.depthRankProxy != null && p.obs.depthRankProxy >= 2,
    highCommittee: (p) => (p.obs.concentration ?? 1) < 0.6,
    lowCommittee: (p) => (p.obs.concentration ?? 0) >= 0.7,
  };
  const byTransitionCohort: Record<string, NflMetricTriple> = {};
  for (const [tag, pred] of Object.entries(transitionTags)) {
    const subset = flatWithObs.filter(pred).map((p) => ({
      actualShare: p.obs.actualShare,
      actualVolume: p.obs.actualVolume,
      actualYards: p.obs.actualYards,
      predShare: p.normalizedShare,
      predVolume: p.projectedVolume,
      predYards: p.projectedYards,
    }));
    if (subset.length >= 20) byTransitionCohort[tag] = metricTriple(subset);
  }

  const cpr = concordantPairRate(allocations);
  return {
    config: args.config,
    leg: args.leg,
    n: flat.length,
    overall: metricTriple(flat),
    byCohort,
    byTransitionCohort,
    coherence: {
      pools: allocations.length,
      meanShareSum: mean(allocations.map((a) => a.coherence.shareSum)),
      meanVolumeResidual: mean(allocations.map((a) => a.coherence.volumeResidual)),
      poolsWithNegativeShare: allocations.filter((a) => a.coherence.anyNegativeShare).length,
      poolsWithShareOverOne: allocations.filter((a) => a.coherence.anyShareOverOne).length,
      poolsWithDuplicates: allocations.filter((a) => a.coherence.duplicatePlayerIds > 0).length,
      poolsEqualSplit: allocations.filter((a) => a.coherence.usedEqualSplit).length,
    },
    rankQuality: { pairs: cpr.pairs, concordantPairRate: cpr.rate },
    distortion: measureNormalizationDistortion(allocations),
  };
}

function mean(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : NaN;
}
