/**
 * WU4B S6 — receiving production allocation (`nfl-receiving-share-x-efficiency-v2.0.0`).
 *
 * v2 replaces ONLY the target-VOLUME leg of the v1 receiving model. The
 * efficiency leg is unchanged: projected receiving yards = allocated
 * targets × the exact v1 shrunk yards-per-target. v1
 * (`nfl-receiving-targets-x-shrunk-ypt-production-2022-2025-v1`) remains a
 * valid model for every archived prediction made under it.
 *
 *   projected targets = projected_targetable_pass_pool × projected_target_share
 *   projected_targetable_pass_pool = WU4A projected dropbacks × calibratedRatio reduction
 *   sum(player projected targets) == projected_targetable_pass_pool   (exact, within a team-game)
 *
 * If the WU4A team-opportunity row for a team is unavailable, that team's
 * receivers fall back to the v1 per-player projection, disclosed via
 * `allocationFallbackReason: "noTeamOpportunity"`.
 */
import type { NflRoleAllocationDataset } from "./types";
import { buildShareObservations } from "./walkForward";
import {
  buildTeamPriorPoolTendency,
  computePoolLeagueConstants,
  projectTargetablePass,
  type NflPoolLeagueConstants,
  type NflTeamPoolTendencySourceRow,
} from "./poolModels";
import { fitShareModel, predictRawShare, type NflShareModelFit, type NflShareObservation } from "./shareModels";
import { allocatePool } from "./allocate";

export const NFL_RECEIVING_V2_MODEL_VERSION = "nfl-receiving-share-x-efficiency-v2.0.0" as const;
export const NFL_RECEIVING_V2_ALLOCATION_MODEL = "nfl-receiving-calibrated-ratio-shrinkage-share-v2.0.0" as const;
export const RECEIVING_SHARE_SHRINKAGE_K = 2;

export type NflReceivingShareModel = {
  allocationModelVersion: typeof NFL_RECEIVING_V2_ALLOCATION_MODEL;
  fit: NflShareModelFit;
  league: NflPoolLeagueConstants;
  leagueYardsPerTarget: number;
  poolRows: NflTeamPoolTendencySourceRow[];
  datasetSeasons: number[];
  /** Present only when the model was loaded from a committed production artifact (see `productionArtifact.ts`). */
  fittedArtifactHash?: string;
  trainedThroughSeason?: number;
};

/** Fit the receiving share model from the committed role-allocation research dataset. Deterministic. */
export function fitReceivingShareModel(dataset: NflRoleAllocationDataset): NflReceivingShareModel {
  const { receiving, poolRows } = buildShareObservations(dataset);
  const totalTargets = receiving.reduce((s, r) => s + r.actualVolume, 0);
  const totalYards = receiving.reduce((s, r) => s + r.actualYards, 0);
  return {
    allocationModelVersion: NFL_RECEIVING_V2_ALLOCATION_MODEL,
    fit: fitShareModel(receiving, RECEIVING_SHARE_SHRINKAGE_K),
    league: computePoolLeagueConstants(poolRows),
    leagueYardsPerTarget: totalTargets > 0 ? totalYards / totalTargets : 7.4,
    poolRows: [...poolRows],
    datasetSeasons: [...dataset.seasons],
  };
}

export type NflReceivingAllocationCandidate = {
  playerId: string;
  playerName: string;
  position: "RB" | "WR" | "TE";
  depthRank: number | null;
  roleSourced: boolean;
  priorTargetShare: number | null;
  priorGamesPlayed: number;
  noHistory: boolean;
  limitedHistory: boolean;
  teamChanged: boolean | null;
  rosterCompetitionCount: number | null;
  concentration: number | null;
  /** v1 shrunk yards-per-target for this player — v2 does NOT recompute it. */
  v1YardsPerTarget: number;
  /** v1 per-player projected targets — used only as the fallback when the team pool is unavailable. */
  v1ProjectedTargets: number;
};

export type NflReceivingAllocatedPlayer = {
  playerId: string;
  projectedTargets: number;
  projectedYards: number;
  opportunityShare: number;
  priorOpportunityShare: number | null;
  allocationFallbackReason: "none" | "noTeamOpportunity" | "equalSplit";
};

export type NflReceivingTeamAllocation = {
  team: string;
  gameId: string;
  projectedDropbacks: number | null;
  projectedTargetablePool: number | null;
  impliedTargetableRatio: number | null;
  allocatedTargets: number;
  residualUnallocated: number;
  usedV1Fallback: boolean;
  coherenceOk: boolean;
  players: NflReceivingAllocatedPlayer[];
};

/**
 * Allocate one team-game's receiving targets. `projectedDropbacks` is the
 * WU4A `projected_pass_attempts` for this team; `null` triggers the v1
 * fallback for every receiver on the team.
 */
export function allocateReceivingTargetsForTeam(args: {
  team: string;
  gameId: string;
  season: number;
  week: number;
  kickoffUtc: string;
  projectedDropbacks: number | null;
  candidates: readonly NflReceivingAllocationCandidate[];
  model: NflReceivingShareModel;
}): NflReceivingTeamAllocation {
  const { team, gameId, projectedDropbacks, candidates, model } = args;

  if (projectedDropbacks == null || candidates.length === 0) {
    return {
      team,
      gameId,
      projectedDropbacks,
      projectedTargetablePool: null,
      impliedTargetableRatio: null,
      allocatedTargets: candidates.reduce((s, c) => s + c.v1ProjectedTargets, 0),
      residualUnallocated: 0,
      usedV1Fallback: true,
      coherenceOk: true,
      players: candidates.map((c) => ({
        playerId: c.playerId,
        projectedTargets: c.v1ProjectedTargets,
        projectedYards: c.v1ProjectedTargets * c.v1YardsPerTarget,
        opportunityShare: 0,
        priorOpportunityShare: c.priorTargetShare,
        allocationFallbackReason: "noTeamOpportunity",
      })),
    };
  }

  const tendency = buildTeamPriorPoolTendency(model.poolRows, team, args.season, args.week, args.kickoffUtc);
  const targetable = projectTargetablePass("calibratedRatio", projectedDropbacks, tendency, model.league);

  const obs: NflShareObservation[] = candidates.map((c) => ({
    season: args.season,
    week: args.week,
    gameId,
    team,
    playerId: c.playerId,
    playerName: c.playerName,
    poolId: `${gameId}|${team}|receiving`,
    poolKey: "receiving",
    rankKey: `${c.position}:${c.depthRank != null ? Math.min(c.depthRank, 6) : "NA"}`,
    depthRankProxy: c.depthRank,
    isProjectedStarter: c.depthRank === 1,
    priorShare: c.priorTargetShare,
    priorGamesPlayed: c.priorGamesPlayed,
    noHistory: c.noHistory,
    limitedHistory: c.limitedHistory,
    teamChanged: c.teamChanged,
    roleSourced: c.roleSourced,
    concentration: c.concentration,
    rosterCompetitionCount: c.rosterCompetitionCount,
    priorEfficiency: null,
    actualShare: null,
    actualVolume: 0,
    actualYards: 0,
    context: { teamDesignedRushes: 0, teamDropbacks: projectedDropbacks, poolActual: 0, gameDateUtc: args.kickoffUtc },
  }));

  const alloc = allocatePool(obs, targetable.projectedTargetable, (o) => predictRawShare("shrinkageBlend", model.fit, o), model.leagueYardsPerTarget, null);

  return {
    team,
    gameId,
    projectedDropbacks,
    projectedTargetablePool: targetable.projectedTargetable,
    impliedTargetableRatio: targetable.impliedRatio,
    allocatedTargets: alloc.coherence.volumeSum,
    residualUnallocated: targetable.projectedTargetable - alloc.coherence.volumeSum,
    usedV1Fallback: false,
    coherenceOk:
      !alloc.coherence.anyNegativeShare &&
      !alloc.coherence.anyShareOverOne &&
      alloc.coherence.duplicatePlayerIds === 0 &&
      Math.abs(alloc.coherence.volumeResidual) < 1e-6,
    players: alloc.players.map((p, i) => ({
      playerId: p.obs.playerId,
      projectedTargets: p.projectedVolume,
      // efficiency leg UNCHANGED from v1
      projectedYards: p.projectedVolume * candidates[i].v1YardsPerTarget,
      opportunityShare: p.normalizedShare,
      priorOpportunityShare: candidates[i].priorTargetShare,
      allocationFallbackReason: alloc.coherence.usedEqualSplit ? "equalSplit" : "none",
    })),
  };
}
