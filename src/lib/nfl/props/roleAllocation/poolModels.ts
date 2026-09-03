/**
 * WU4B S2 — positional / targetable POOL models.
 *
 * These sit between the WU4A team pool and the player share models:
 *   projected_rush_attempts  -> {qb, rb, wrTe} designed-rush sub-pools
 *   projected_dropbacks      -> projected_targetable_pass_attempts
 *
 * All tendencies are point-in-time: a team's own prior games this season,
 * coalesced to its prior season, coalesced to the training-league mean,
 * each shrunk toward the league mean by a games-count prior. No value from
 * the game being projected is ever used.
 *
 * Two targetable-pass reductions are carried and compared downstream (Part
 * 2 fork A). Neither is combined; neither is tuned to Week 1.
 */
import { shrinkTowardLeagueMean } from "../qbPassingBaselines";
import type { NflTeamPositionalPoolRow } from "./types";

export const POOL_SHRINKAGE_PRIOR_GAMES = 6;

/**
 * The exact fields `buildTeamPriorPoolTendency` / `computePoolLeagueConstants`
 * read off a team-game pool row. Deliberately narrower than
 * `NflTeamPositionalPoolRow` (which also carries player-share-fitting-only
 * fields) so a compact production artifact can serialize just this slice —
 * see `roleAllocation/productionArtifact.ts`.
 */
export type NflTeamPoolTendencySourceRow = Pick<
  NflTeamPositionalPoolRow,
  "team" | "season" | "week" | "gameId" | "gameDateUtc" | "dropbacks" | "teamPassAttempts" | "sacks" | "scrambles" | "rushPools"
>;

export type NflTeamPriorPoolTendency = {
  team: string;
  season: number;
  week: number;
  gamesPrior: number;
  /** designed-rush pool shares over the prior window (sum ~1). */
  rushPoolShares: { qb: number; rb: number; wrTe: number } | null;
  /** attempts / dropbacks over the prior window. */
  targetableRatio: number | null;
  /** sacks / dropbacks over the prior window. */
  sackRate: number | null;
  /** scrambles / dropbacks over the prior window. */
  scrambleRate: number | null;
};

export type NflPoolLeagueConstants = {
  rushPoolShares: { qb: number; rb: number; wrTe: number };
  targetableRatio: number;
  sackRate: number;
  scrambleRate: number;
};

function sum(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/** League means over a set of realised team-game pool rows (training only). */
export function computePoolLeagueConstants(trainRows: readonly NflTeamPoolTendencySourceRow[]): NflPoolLeagueConstants {
  const qb = sum(trainRows.map((r) => r.rushPools.qb));
  const rb = sum(trainRows.map((r) => r.rushPools.rb));
  const wrTe = sum(trainRows.map((r) => r.rushPools.wrTe));
  const poolTotal = qb + rb + wrTe || 1;
  const drop = sum(trainRows.map((r) => r.dropbacks)) || 1;
  return {
    rushPoolShares: { qb: qb / poolTotal, rb: rb / poolTotal, wrTe: wrTe / poolTotal },
    targetableRatio: sum(trainRows.map((r) => r.teamPassAttempts)) / drop,
    sackRate: sum(trainRows.map((r) => r.sacks)) / drop,
    scrambleRate: sum(trainRows.map((r) => r.scrambles)) / drop,
  };
}

/**
 * A team's prior-window pool tendency for one target game. `allRows` is the
 * full realised pool history; only rows strictly before `beforeDateUtc`
 * enter, this-season first, else prior season.
 */
export function buildTeamPriorPoolTendency(
  allRows: readonly NflTeamPoolTendencySourceRow[],
  team: string,
  season: number,
  week: number,
  beforeDateUtc: string,
): NflTeamPriorPoolTendency {
  const thisSeason = allRows
    .filter((r) => r.team === team && r.season === season && r.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const priorSeason = allRows.filter((r) => r.team === team && r.season === season - 1);
  const window = thisSeason.length > 0 ? thisSeason : priorSeason;

  if (window.length === 0) {
    return { team, season, week, gamesPrior: 0, rushPoolShares: null, targetableRatio: null, sackRate: null, scrambleRate: null };
  }
  const qb = sum(window.map((r) => r.rushPools.qb));
  const rb = sum(window.map((r) => r.rushPools.rb));
  const wrTe = sum(window.map((r) => r.rushPools.wrTe));
  const poolTotal = qb + rb + wrTe || 1;
  const drop = sum(window.map((r) => r.dropbacks)) || 1;
  return {
    team,
    season,
    week,
    gamesPrior: window.length,
    rushPoolShares: { qb: qb / poolTotal, rb: rb / poolTotal, wrTe: wrTe / poolTotal },
    targetableRatio: sum(window.map((r) => r.teamPassAttempts)) / drop,
    sackRate: sum(window.map((r) => r.sacks)) / drop,
    scrambleRate: sum(window.map((r) => r.scrambles)) / drop,
  };
}

// ---------------------------------------------------------------------------
// Rush 3-pool split
// ---------------------------------------------------------------------------

export type NflProjectedRushPools = {
  qb: number;
  rb: number;
  wrTe: number;
  shares: { qb: number; rb: number; wrTe: number };
  /** true when the team had no prior window and league shares were used. */
  usedLeaguePrior: boolean;
};

/**
 * Split `projectedDesignedRushes` (WU4A `projected_rush_attempts`) three
 * ways. Each raw pool share is shrunk toward the league share by a
 * games-count prior, then the three are renormalised to sum to exactly 1,
 * so the emitted sub-pools always sum back to the input.
 */
export function projectRushPools(
  projectedDesignedRushes: number,
  tendency: NflTeamPriorPoolTendency,
  league: NflPoolLeagueConstants,
  /**
   * S5A calibration: shift `rbShareBoost` of the pool onto RB, taken
   * proportionally from QB + WR-TE. Keeps the three shares summing to 1.
   * 0 = uncalibrated.
   */
  rbShareBoost = 0,
): NflProjectedRushPools {
  const src = tendency.rushPoolShares ?? league.rushPoolShares;
  const g = tendency.gamesPrior;
  const shrink = (obs: number, prior: number) => shrinkTowardLeagueMean(obs, g, prior, POOL_SHRINKAGE_PRIOR_GAMES);
  const raw = {
    qb: Math.max(0, shrink(src.qb, league.rushPoolShares.qb)),
    rb: Math.max(0, shrink(src.rb, league.rushPoolShares.rb)),
    wrTe: Math.max(0, shrink(src.wrTe, league.rushPoolShares.wrTe)),
  };
  const total = raw.qb + raw.rb + raw.wrTe || 1;
  let shares = { qb: raw.qb / total, rb: raw.rb / total, wrTe: raw.wrTe / total };
  if (rbShareBoost > 0) {
    const donorTotal = shares.qb + shares.wrTe;
    const move = Math.min(donorTotal, rbShareBoost);
    if (donorTotal > 0) {
      shares = {
        qb: shares.qb * (1 - move / donorTotal),
        rb: shares.rb + move,
        wrTe: shares.wrTe * (1 - move / donorTotal),
      };
    }
  }
  return {
    qb: projectedDesignedRushes * shares.qb,
    rb: projectedDesignedRushes * shares.rb,
    wrTe: projectedDesignedRushes * shares.wrTe,
    shares,
    usedLeaguePrior: tendency.rushPoolShares == null,
  };
}

// ---------------------------------------------------------------------------
// Targetable pass pool — two candidate reductions
// ---------------------------------------------------------------------------

export type NflTargetablePassApproach = "calibratedRatio" | "sacksScrambles";

export type NflProjectedTargetablePass = {
  approach: NflTargetablePassApproach;
  projectedDropbacks: number;
  projectedTargetable: number;
  /** effective attempts/dropbacks implied by this reduction. */
  impliedRatio: number;
  components: { sackRate: number | null; scrambleRate: number | null; ratio: number | null };
  usedLeaguePrior: boolean;
};

export function projectTargetablePass(
  approach: NflTargetablePassApproach,
  projectedDropbacks: number,
  tendency: NflTeamPriorPoolTendency,
  league: NflPoolLeagueConstants,
): NflProjectedTargetablePass {
  const g = tendency.gamesPrior;
  const shrink = (obs: number | null, prior: number) =>
    shrinkTowardLeagueMean(obs ?? prior, obs == null ? 0 : g, prior, POOL_SHRINKAGE_PRIOR_GAMES);

  let projectedTargetable: number;
  let components: NflProjectedTargetablePass["components"];
  if (approach === "calibratedRatio") {
    const ratio = Math.min(1, Math.max(0.5, shrink(tendency.targetableRatio, league.targetableRatio)));
    projectedTargetable = projectedDropbacks * ratio;
    components = { sackRate: null, scrambleRate: null, ratio };
  } else {
    const sackRate = Math.max(0, shrink(tendency.sackRate, league.sackRate));
    const scrambleRate = Math.max(0, shrink(tendency.scrambleRate, league.scrambleRate));
    const ratio = Math.min(1, Math.max(0.5, 1 - sackRate - scrambleRate));
    projectedTargetable = projectedDropbacks * ratio;
    components = { sackRate, scrambleRate, ratio: null };
  }
  return {
    approach,
    projectedDropbacks,
    projectedTargetable,
    impliedRatio: projectedDropbacks > 0 ? projectedTargetable / projectedDropbacks : 0,
    components,
    usedLeaguePrior: tendency.gamesPrior === 0,
  };
}
