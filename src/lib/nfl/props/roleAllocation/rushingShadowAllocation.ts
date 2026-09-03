/**
 * WU4D.3 — SHADOW rushing-v2 role allocation. Computes what the rushing-v2
 * finite-pool allocator WOULD project for RB carries this week, from the
 * compact committed artifact (`rushingShadowArtifact.ts`) plus this week's
 * ALREADY-COMPUTED live feature snapshot for each player (no second heavy
 * dataset load) and WU4A's own team-opportunity designed-rush pool (one
 * source of truth, never recomputed independently -- see poolModels.ts's
 * `projectRushPools`).
 *
 * NEVER used to alter `projectedCarries`/`projectedYardsPerCarry`/
 * `projectedYards` on a production row -- every function here is read-only
 * with respect to production state and returns a DIAGNOSTIC-ONLY
 * `NflRushingAllocationDiagnostics` per player (see
 * types/currentWeekProjection.ts). The dominant-anchor and team-change
 * calibrations below are the exact S5A/S5E constants already validated and
 * used by the existing (dev-machine-only) `week1-candidate.ts` research
 * script -- reused, not reinvented.
 */
import { buildTeamPriorPoolTendency, projectRushPools } from "./poolModels";
import { predictRawShare, type NflNoHistoryCalibration, type NflShareObservation, type NflTeamChangeCalibration } from "./shareModels";
import { allocatePool, type NflDominantAnchorConfig } from "./allocate";
import type { NflRushingShadowModel } from "./rushingShadowArtifact";
import { buildRushingRoleTransitionSnapshot } from "../../research/rushingRoleTransitionSnapshot";
import type { NflRushingAllocationDiagnostics } from "../types/currentWeekProjection";

/** S5A dominant-anchor calibration, frozen (selected on 2024, validated on 2025) -- see calibrate-role-transition.ts. */
export const RUSH_SHADOW_DOMINANT_ANCHOR: NflDominantAnchorConfig = { minPriorGamesPlayed: 4, minConcentration: 0.6, minRawShare: 0.5, shareCap: 0.95, usePriorShare: true };
/** S5A no-history calibration, frozen. */
export const RUSH_SHADOW_NO_HISTORY_CAL: NflNoHistoryCalibration = { shareMultiplier: 0.55, rankBackoff: 0, rosterCompetitionRef: null };
/** S5E role-transition calibration, frozen -- activates only for a sourced-role team-changed player whose usage materially conflicts with their current role. */
export const RUSH_SHADOW_TEAM_CHANGE_CAL: NflTeamChangeCalibration = { carryover: 0.35, rankPriorBoost: 3, conflictThreshold: 0.08, requireSourced: true };

const RANK_CAP = 6;
function rankBucket(rank: number | null): string {
  if (rank == null) return "NA";
  return String(Math.min(rank, RANK_CAP));
}

/** One live player's role evidence -- built by the caller from ALREADY-COMPUTED current-week row/feature-snapshot fields, never from the 34MB research dataset. */
export type NflLiveRbRoleEvidence = {
  playerId: string;
  playerName: string;
  team: string;
  gameId: string;
  gameDateUtc: string;
  poolKey: "qb" | "rb" | "wrTe";
  depthRankProxy: number | null;
  isProjectedStarter: boolean;
  priorShare: number | null;
  priorGamesPlayed: number;
  noHistory: boolean;
  limitedHistory: boolean;
  teamChanged: boolean | null;
  roleSourced: boolean;
  concentration: number | null;
  rosterCompetitionCount: number | null;
};

function toShareObservation(e: NflLiveRbRoleEvidence, season: number, week: number): NflShareObservation {
  return {
    season, week, gameId: e.gameId, team: e.team, playerId: e.playerId, playerName: e.playerName,
    poolId: `${e.gameId}|${e.team}|${e.poolKey}`, poolKey: e.poolKey, rankKey: `rank:${rankBucket(e.depthRankProxy)}`,
    depthRankProxy: e.depthRankProxy, isProjectedStarter: e.isProjectedStarter, priorShare: e.priorShare,
    priorGamesPlayed: e.priorGamesPlayed, noHistory: e.noHistory, limitedHistory: e.limitedHistory, teamChanged: e.teamChanged,
    roleSourced: e.roleSourced, concentration: e.concentration, rosterCompetitionCount: e.rosterCompetitionCount, priorEfficiency: null,
    actualShare: null, actualVolume: 0, actualYards: 0,
    context: { teamDesignedRushes: 0, teamDropbacks: 0, poolActual: 0, gameDateUtc: e.gameDateUtc },
  };
}

export type NflRushingShadowTeamResult = {
  poolSizes: { qb: number; rb: number; wrTe: number };
  players: { playerId: string; poolKey: "qb" | "rb" | "wrTe"; diagnostics: NflRushingAllocationDiagnostics }[];
};

/**
 * Allocates ALL of one team's live RB-room (and, if provided, QB/WR-TE
 * designed-rush) evidence for one game against the shadow model, sized by
 * WU4A's own `projectedDesignedRushes` for that team (the single source of
 * truth for pool size -- never recomputed here).
 */
export function computeShadowRushingAllocationForTeam(args: {
  team: string;
  season: number;
  week: number;
  gameDateUtc: string;
  projectedDesignedRushes: number;
  liveEvidence: readonly NflLiveRbRoleEvidence[];
  model: NflRushingShadowModel;
}): NflRushingShadowTeamResult {
  const tendency = buildTeamPriorPoolTendency(args.model.poolRows, args.team, args.season, args.week, args.gameDateUtc);
  const poolSizes = projectRushPools(args.projectedDesignedRushes, tendency, args.model.league, 0);

  const observations = args.liveEvidence.map((e) => toShareObservation(e, args.season, args.week));
  const byPool = new Map<"qb" | "rb" | "wrTe", NflShareObservation[]>();
  for (const o of observations) (byPool.get(o.poolKey as "qb" | "rb" | "wrTe") ?? byPool.set(o.poolKey as "qb" | "rb" | "wrTe", []).get(o.poolKey as "qb" | "rb" | "wrTe")!).push(o);

  const players: NflRushingShadowTeamResult["players"] = [];
  for (const [poolKey, obs] of byPool) {
    if (obs.length === 0) continue;
    const allocation = allocatePool(
      obs, poolSizes[poolKey],
      (o) => predictRawShare("shrinkageBlend", args.model.fit, o, o.noHistory ? RUSH_SHADOW_NO_HISTORY_CAL : null, RUSH_SHADOW_TEAM_CHANGE_CAL),
      args.model.leagueEfficiency, RUSH_SHADOW_DOMINANT_ANCHOR,
    );
    for (const p of allocation.players) {
      const rankPrior = args.model.fit.rankPrior.get(p.obs.rankKey) ?? args.model.fit.noHistoryPrior;
      const calibrationApplied = p.obs.teamChanged === true && p.obs.priorShare != null && p.obs.depthRankProxy != null
        && RUSH_SHADOW_TEAM_CHANGE_CAL.requireSourced ? p.obs.roleSourced : false;
      players.push({
        playerId: p.obs.playerId, poolKey,
        diagnostics: buildRushingRoleTransitionSnapshot({
          observation: p.obs, rankPrior, finalProjectedShare: p.normalizedShare, projectedCarries: p.projectedVolume,
          teamChangeCalibrationApplied: calibrationApplied, allocationModelVersion: args.model.fittedArtifactHash ? "nfl-rushing-role-allocation-shadow-v1.0.0" : null,
          conflictThreshold: RUSH_SHADOW_TEAM_CHANGE_CAL.conflictThreshold,
        }),
      });
    }
  }
  return { poolSizes, players };
}
