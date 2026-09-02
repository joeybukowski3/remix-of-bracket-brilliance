/**
 * WU4B — historical positional-pool + player-share dataset builder.
 *
 * Pure functions only. All raw inputs (outcome artifacts, compact
 * play-volume cache, stats_team_week box scores, weekly rosters, schedule
 * join index) are loaded by the calling script and passed in already
 * parsed. Every window is strictly-prior-game by kickoff date — no value
 * from the target game itself enters any role feature. See
 * `roleAllocation/types.ts` for the exact accounting contract.
 */
import type { NflRushingOutcome } from "../types/rushingOutcome";
import type { NflReceivingOutcome } from "../types/receivingOutcome";
import type { NflGameJoinRecord } from "../historicalOutcomes";
import { gameJoinKey } from "../historicalOutcomes";
import {
  NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION,
  type NflRushPoolKey,
  type NflRushShareRoleEvidence,
  type NflReceivingShareRoleEvidence,
  type NflRushShareRow,
  type NflReceivingShareRow,
  type NflTeamPositionalPoolRow,
  type NflRoleAllocationDataset,
  type NflRoleAllocationDatasetQa,
} from "./types";

/** Compact play-volume, keyed `gameId|team`. */
export type NflPoolPlayVolume = { designedRushes: number; dropbacks: number };
/** stats_team_week slice, keyed `gameId|team`. */
export type NflPoolTeamWeek = { teamPassAttempts: number; sacks: number; teamTargets: number };
/** weekly_rosters slice. */
export type NflWeeklyRosterEntry = {
  season: number;
  week: number;
  team: string;
  playerId: string;
  position: string;
  status: string;
};

export const LIMITED_HISTORY_MAX_GAMES = 3;

const RUSH_POOL_OF_POSITION: Record<NflRushingOutcome["position"], NflRushPoolKey> = {
  QB: "qb",
  RB: "rb",
  WR: "wrTe",
  TE: "wrTe",
};

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function mean(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : null;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summary(values: readonly number[]) {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return {
    min: sorted[0] ?? NaN,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    mean: mean(sorted) ?? NaN,
    max: sorted.at(-1) ?? NaN,
  };
}

// ---------------------------------------------------------------------------
// Team positional pools (per resolved team-game)
// ---------------------------------------------------------------------------

type TeamGameKey = string; // `gameId|team`

function tgKey(gameId: string, team: string): TeamGameKey {
  return `${gameId}|${team}`;
}

export function buildTeamPositionalPools(args: {
  rushingOutcomes: readonly NflRushingOutcome[];
  playVolumeByTeamGame: ReadonlyMap<TeamGameKey, NflPoolPlayVolume>;
  teamWeekByTeamGame: ReadonlyMap<TeamGameKey, NflPoolTeamWeek>;
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
}): NflTeamPositionalPoolRow[] {
  const carriesByTeamGame = new Map<TeamGameKey, { qb: number; rb: number; wrTe: number; season: number; week: number; team: string; opponent: string }>();
  for (const o of args.rushingOutcomes) {
    if (!o.gameId) continue;
    const key = tgKey(o.gameId, o.team);
    const acc = carriesByTeamGame.get(key) ?? { qb: 0, rb: 0, wrTe: 0, season: o.season, week: o.week, team: o.team, opponent: o.opponent };
    acc[RUSH_POOL_OF_POSITION[o.position]] += num(o.carries);
    carriesByTeamGame.set(key, acc);
  }

  const rows: NflTeamPositionalPoolRow[] = [];
  for (const [key, raw] of carriesByTeamGame) {
    const pv = args.playVolumeByTeamGame.get(key);
    const tw = args.teamWeekByTeamGame.get(key);
    if (!pv || !tw) continue;
    const join = args.gameJoinIndex.get(gameJoinKey(raw.season, raw.week, raw.team));
    if (!join) continue;

    const designedRushes = num(pv.designedRushes);
    const dropbacks = num(pv.dropbacks);
    if (designedRushes <= 0 || dropbacks <= 0) continue;

    const sacks = Math.max(0, num(tw.sacks));
    const teamPassAttempts = Math.max(0, num(tw.teamPassAttempts));
    const scrambles = Math.max(0, dropbacks - teamPassAttempts - sacks);

    // QB designed rushes = the residual of designed rushes not accounted for by RB / WR-TE
    // carries. RBs and WRs do not scramble, so `designedRushes - rbCarries - wrTeCarries` is
    // a far more robust estimate of QB designed runs than `qbCarries - team_scrambles`, which
    // over-corrects badly for mobile QBs (the derived team-scramble count runs ~2x true).
    // Capped at the QB's own carry count (can't have designed more than they carried).
    const qbDesignedRushes = Math.max(0, Math.min(raw.qb, designedRushes - raw.rb - raw.wrTe));
    const rushPools = { qb: qbDesignedRushes, rb: raw.rb, wrTe: raw.wrTe };
    const allocated = rushPools.qb + rushPools.rb + rushPools.wrTe;
    const poolCoverageRatio = allocated / designedRushes;
    const residualDesignedRushes = designedRushes - allocated;
    const shareDen = allocated > 0 ? allocated : 1;
    const rushPoolShares = {
      qb: rushPools.qb / shareDen,
      rb: rushPools.rb / shareDen,
      wrTe: rushPools.wrTe / shareDen,
    };

    rows.push({
      schemaVersion: NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION,
      season: raw.season,
      week: raw.week,
      gameId: raw.gameId ?? key.split("|")[0],
      team: raw.team,
      opponent: raw.opponent,
      gameDateUtc: join.gameDateUtc,
      designedRushes,
      dropbacks,
      teamPassAttempts,
      sacks,
      scrambles,
      teamTargets: Math.max(0, num(tw.teamTargets)),
      rawCarries: { qb: raw.qb, rb: raw.rb, wrTe: raw.wrTe },
      qbDesignedRushes,
      rushPools,
      poolCoverageRatio,
      residualDesignedRushes,
      rushPoolShares,
      targetable: {
        ratioActual: teamPassAttempts / dropbacks,
        sackRateActual: sacks / dropbacks,
        scrambleRateActual: scrambles / dropbacks,
      },
    });
  }
  return rows.sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc) || a.team.localeCompare(b.team));
}

// ---------------------------------------------------------------------------
// Point-in-time role evidence
// ---------------------------------------------------------------------------

type RushGameLite = { playerId: string; season: number; team: string; gameDateUtc: string; carries: number; rushingYards: number; teamDesignedRushes: number | null; poolCarries: number | null };
type RecGameLite = { playerId: string; season: number; team: string; gameDateUtc: string; targets: number; receivingYards: number; teamPassAttempts: number | null };

function priorGames<T extends { playerId: string; season: number; gameDateUtc: string }>(
  log: readonly T[],
  playerId: string,
  season: number,
  beforeDateUtc: string,
): { thisSeason: T[]; priorSeason: T[] } {
  const thisSeason = log
    .filter((g) => g.playerId === playerId && g.season === season && g.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
  const priorSeason = log.filter((g) => g.playerId === playerId && g.season === season - 1);
  return { thisSeason, priorSeason };
}

/** depth rank among a team-position group by point-in-time share (1 = highest). */
function buildDepthRankProxy(
  entries: readonly { playerId: string; priorShare: number | null }[],
): Map<string, number> {
  const ranked = [...entries]
    .filter((e) => e.priorShare != null)
    .sort((a, b) => (b.priorShare ?? 0) - (a.priorShare ?? 0));
  const out = new Map<string, number>();
  ranked.forEach((e, i) => out.set(e.playerId, i + 1));
  return out;
}

function rosterCompetition(
  rosterByTeamWeek: ReadonlyMap<string, NflWeeklyRosterEntry[]>,
  season: number,
  week: number,
  team: string,
  positions: readonly string[],
): number | null {
  const entries = rosterByTeamWeek.get(`${season}|${week}|${team}`);
  if (!entries) return null;
  const active = entries.filter((e) => positions.includes(e.position) && e.status !== "CUT" && e.status !== "RES");
  return active.length;
}

// ---------------------------------------------------------------------------
// Rushing share rows
// ---------------------------------------------------------------------------

export function buildRushShareRows(args: {
  rushingOutcomes: readonly NflRushingOutcome[];
  pools: readonly NflTeamPositionalPoolRow[];
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
  rosterTeamBySeasonWeekPlayer: ReadonlyMap<string, string>;
  rosterByTeamWeek: ReadonlyMap<string, NflWeeklyRosterEntry[]>;
  teamTopRbCarryShareByGameTeam: ReadonlyMap<string, number>;
}): NflRushShareRow[] {
  const poolByTeamGame = new Map(args.pools.map((p) => [tgKey(p.gameId, p.team), p]));

  const log: RushGameLite[] = [];
  for (const o of args.rushingOutcomes) {
    if (!o.gameId) continue;
    const join = args.gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    const pool = poolByTeamGame.get(tgKey(o.gameId, o.team));
    const poolKey = RUSH_POOL_OF_POSITION[o.position];
    log.push({
      playerId: o.playerId,
      season: o.season,
      team: o.team,
      gameDateUtc: join.gameDateUtc,
      carries: num(o.carries),
      rushingYards: num(o.rushingYards),
      teamDesignedRushes: pool ? pool.designedRushes : null,
      poolCarries: pool ? pool.rushPools[poolKey] : null,
    });
  }

  const rows: NflRushShareRow[] = [];
  // group eligible players per team-position-game for the depth-rank proxy
  const byTeamGamePos = new Map<string, NflRushingOutcome[]>();
  for (const o of args.rushingOutcomes) {
    if (!o.gameId || !o.pregameEligible) continue;
    const k = `${o.gameId}|${o.team}|${RUSH_POOL_OF_POSITION[o.position]}`;
    (byTeamGamePos.get(k) ?? byTeamGamePos.set(k, []).get(k)!).push(o);
  }

  for (const o of args.rushingOutcomes) {
    if (!o.gameId || !o.pregameEligible) continue;
    const join = args.gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    const pool = poolByTeamGame.get(tgKey(o.gameId, o.team));
    const poolKey = RUSH_POOL_OF_POSITION[o.position];

    const { thisSeason, priorSeason } = priorGames(log, o.playerId, o.season, join.gameDateUtc);
    const window = thisSeason.length > 0 ? thisSeason : priorSeason;
    const priorGamesPlayed = thisSeason.length + (thisSeason.length === 0 ? priorSeason.length : 0);
    const priorPoolShare = mean(
      window.filter((g) => g.poolCarries != null && g.poolCarries > 0).map((g) => g.carries / (g.poolCarries as number)),
    );
    const priorDesignedShare = mean(
      window.filter((g) => g.teamDesignedRushes != null && g.teamDesignedRushes > 0).map((g) => g.carries / (g.teamDesignedRushes as number)),
    );
    const priorCarriesPerGame = mean(window.map((g) => g.carries));
    const totalPriorCarries = window.reduce((s, g) => s + g.carries, 0);
    const priorYardsPerCarry = totalPriorCarries > 0 ? window.reduce((s, g) => s + g.rushingYards, 0) / totalPriorCarries : null;
    const priorTeam = window.length > 0 ? window[window.length - 1].team : null;
    const currentTeam = args.rosterTeamBySeasonWeekPlayer.get(`${o.season}|${o.week}|${o.playerId}`) ?? null;
    const teamChanged = currentTeam != null && priorTeam != null ? currentTeam !== priorTeam : priorTeam != null ? priorTeam !== o.team : null;

    // depth-rank proxy within this team-position-game
    const groupKey = `${o.gameId}|${o.team}|${poolKey}`;
    const group = byTeamGamePos.get(groupKey) ?? [o];
    const groupShares = group.map((g) => {
      const gj = args.gameJoinIndex.get(gameJoinKey(g.season, g.week, g.team));
      const w = gj ? priorGames(log, g.playerId, g.season, gj.gameDateUtc) : { thisSeason: [], priorSeason: [] };
      const win = w.thisSeason.length > 0 ? w.thisSeason : w.priorSeason;
      return {
        playerId: g.playerId,
        priorShare: mean(win.filter((x) => x.poolCarries != null && x.poolCarries > 0).map((x) => x.carries / (x.poolCarries as number))),
      };
    });
    const depthMap = buildDepthRankProxy(groupShares);
    const depthRankProxy = depthMap.get(o.playerId) ?? null;

    const positions = poolKey === "qb" ? ["QB"] : poolKey === "rb" ? ["RB"] : ["WR", "TE"];
    const rosterCompetitionCount = rosterCompetition(args.rosterByTeamWeek, o.season, o.week, o.team, positions);

    const noHistory = priorGamesPlayed === 0;
    const role: NflRushShareRoleEvidence = {
      depthRankProxy,
      isProjectedStarter: depthRankProxy === 1,
      position: o.position,
      currentTeam,
      priorTeam,
      teamChanged,
      priorGamesPlayed,
      noHistory,
      limitedHistory: !noHistory && priorGamesPlayed <= LIMITED_HISTORY_MAX_GAMES,
      priorPoolShare,
      priorDesignedShare,
      priorCarriesPerGame,
      rosterCompetitionCount,
      committeeConcentration: args.teamTopRbCarryShareByGameTeam.get(`${o.gameId}|${o.team}`) ?? null,
    };

    rows.push({
      schemaVersion: NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION,
      season: o.season,
      week: o.week,
      gameId: o.gameId,
      team: o.team,
      opponent: o.opponent,
      playerId: o.playerId,
      playerName: o.playerName,
      gameDateUtc: join.gameDateUtc,
      carries: num(o.carries),
      rushingYards: num(o.rushingYards),
      priorYardsPerCarry,
      shareOfDesignedRushes: pool && pool.designedRushes > 0 ? num(o.carries) / pool.designedRushes : null,
      shareOfPositionalPool: pool && pool.rushPools[poolKey] > 0 ? num(o.carries) / pool.rushPools[poolKey] : null,
      poolKey,
      role,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Receiving share rows
// ---------------------------------------------------------------------------

export function buildReceivingShareRows(args: {
  receivingOutcomes: readonly NflReceivingOutcome[];
  pools: readonly NflTeamPositionalPoolRow[];
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>;
  rosterTeamBySeasonWeekPlayer: ReadonlyMap<string, string>;
  rosterByTeamWeek: ReadonlyMap<string, NflWeeklyRosterEntry[]>;
  teamTopTargetShareByGameTeam: ReadonlyMap<string, number>;
}): NflReceivingShareRow[] {
  const poolByTeamGame = new Map(args.pools.map((p) => [tgKey(p.gameId, p.team), p]));

  const log: RecGameLite[] = [];
  for (const o of args.receivingOutcomes) {
    if (!o.gameId) continue;
    const join = args.gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    const pool = poolByTeamGame.get(tgKey(o.gameId, o.team));
    log.push({
      playerId: o.playerId,
      season: o.season,
      team: o.team,
      gameDateUtc: join.gameDateUtc,
      targets: num(o.targets),
      receivingYards: num(o.receivingYards),
      teamPassAttempts: pool ? pool.teamPassAttempts : o.teamPassAttemptsContext ?? null,
    });
  }

  const byTeamGame = new Map<string, NflReceivingOutcome[]>();
  for (const o of args.receivingOutcomes) {
    if (!o.gameId) continue;
    const k = tgKey(o.gameId, o.team);
    (byTeamGame.get(k) ?? byTeamGame.set(k, []).get(k)!).push(o);
  }

  const rows: NflReceivingShareRow[] = [];
  for (const o of args.receivingOutcomes) {
    if (!o.gameId) continue;
    const join = args.gameJoinIndex.get(gameJoinKey(o.season, o.week, o.team));
    if (!join) continue;
    const pool = poolByTeamGame.get(tgKey(o.gameId, o.team));

    const { thisSeason, priorSeason } = priorGames(log, o.playerId, o.season, join.gameDateUtc);
    const window = thisSeason.length > 0 ? thisSeason : priorSeason;
    const priorGamesPlayed = thisSeason.length + (thisSeason.length === 0 ? priorSeason.length : 0);
    const priorTargetShare = mean(
      window.filter((g) => g.teamPassAttempts != null && g.teamPassAttempts > 0).map((g) => g.targets / (g.teamPassAttempts as number)),
    );
    const priorTargetsPerGame = mean(window.map((g) => g.targets));
    const totalPriorTargets = window.reduce((s, g) => s + g.targets, 0);
    const priorYardsPerTarget = totalPriorTargets > 0 ? window.reduce((s, g) => s + g.receivingYards, 0) / totalPriorTargets : null;
    const priorTeam = window.length > 0 ? window[window.length - 1].team : null;
    const currentTeam = args.rosterTeamBySeasonWeekPlayer.get(`${o.season}|${o.week}|${o.playerId}`) ?? null;
    const teamChanged = currentTeam != null && priorTeam != null ? currentTeam !== priorTeam : priorTeam != null ? priorTeam !== o.team : null;

    const group = byTeamGame.get(tgKey(o.gameId, o.team)) ?? [o];
    const groupShares = group
      .filter((g) => g.position === o.position)
      .map((g) => {
        const gj = args.gameJoinIndex.get(gameJoinKey(g.season, g.week, g.team));
        const w = gj ? priorGames(log, g.playerId, g.season, gj.gameDateUtc) : { thisSeason: [], priorSeason: [] };
        const win = w.thisSeason.length > 0 ? w.thisSeason : w.priorSeason;
        return {
          playerId: g.playerId,
          priorShare: mean(win.filter((x) => x.teamPassAttempts != null && x.teamPassAttempts > 0).map((x) => x.targets / (x.teamPassAttempts as number))),
        };
      });
    const depthMap = buildDepthRankProxy(groupShares);
    const depthRankProxy = depthMap.get(o.playerId) ?? null;

    const positions = o.position === "RB" ? ["RB"] : o.position === "TE" ? ["TE"] : ["WR"];
    const rosterCompetitionCount = rosterCompetition(args.rosterByTeamWeek, o.season, o.week, o.team, positions);

    const noHistory = priorGamesPlayed === 0;
    const role: NflReceivingShareRoleEvidence = {
      depthRankProxy,
      isProjectedStarter: depthRankProxy === 1,
      position: o.position,
      currentTeam,
      priorTeam,
      teamChanged,
      priorGamesPlayed,
      noHistory,
      limitedHistory: !noHistory && priorGamesPlayed <= LIMITED_HISTORY_MAX_GAMES,
      priorTargetShare,
      priorTargetsPerGame,
      rosterCompetitionCount,
      concentration: args.teamTopTargetShareByGameTeam.get(`${o.gameId}|${o.team}`) ?? null,
    };

    rows.push({
      schemaVersion: NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION,
      season: o.season,
      week: o.week,
      gameId: o.gameId,
      team: o.team,
      opponent: o.opponent,
      playerId: o.playerId,
      playerName: o.playerName,
      gameDateUtc: join.gameDateUtc,
      targets: num(o.targets),
      receivingYards: num(o.receivingYards),
      priorYardsPerTarget,
      shareOfTargetable: pool && pool.teamPassAttempts > 0 ? num(o.targets) / pool.teamPassAttempts : null,
      shareOfDropbacks: pool && pool.dropbacks > 0 ? num(o.targets) / pool.dropbacks : null,
      role,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

export function summariseDataset(
  seasons: readonly number[],
  pools: readonly NflTeamPositionalPoolRow[],
  rushShares: readonly NflRushShareRow[],
  receivingShares: readonly NflReceivingShareRow[],
  teamGamesExpected: number,
): NflRoleAllocationDatasetQa {
  const coverage = pools.map((p) => p.poolCoverageRatio);
  const ratio = pools.map((p) => p.targetable.ratioActual);

  const rushShareSumByTeamGame = new Map<string, number>();
  for (const r of rushShares) {
    if (r.shareOfDesignedRushes == null) continue;
    const k = tgKey(r.gameId, r.team);
    rushShareSumByTeamGame.set(k, (rushShareSumByTeamGame.get(k) ?? 0) + r.shareOfDesignedRushes);
  }
  const recTargetSumByTeamGame = new Map<string, { targets: number; attempts: number }>();
  const poolByTeamGame = new Map(pools.map((p) => [tgKey(p.gameId, p.team), p]));
  for (const r of receivingShares) {
    const k = tgKey(r.gameId, r.team);
    const acc = recTargetSumByTeamGame.get(k) ?? { targets: 0, attempts: poolByTeamGame.get(k)?.teamPassAttempts ?? 0 };
    acc.targets += r.targets;
    recTargetSumByTeamGame.set(k, acc);
  }

  const rosterCoverageBySeasonPct: Record<string, number> = {};
  for (const s of seasons) {
    const seasonRush = rushShares.filter((r) => r.season === s);
    const withRoster = seasonRush.filter((r) => r.role.currentTeam != null).length;
    rosterCoverageBySeasonPct[String(s)] = seasonRush.length > 0 ? withRoster / seasonRush.length : 0;
  }

  return {
    teamGamesExpected,
    teamGamesResolved: pools.length,
    rushShareRows: rushShares.length,
    receivingShareRows: receivingShares.length,
    rushPoolCoverage: summary(coverage),
    targetableRatio: summary(ratio),
    sackRate: { median: quantile([...pools.map((p) => p.targetable.sackRateActual)].sort((a, b) => a - b), 0.5), mean: mean(pools.map((p) => p.targetable.sackRateActual)) ?? NaN },
    scrambleRate: { median: quantile([...pools.map((p) => p.targetable.scrambleRateActual)].sort((a, b) => a - b), 0.5), mean: mean(pools.map((p) => p.targetable.scrambleRateActual)) ?? NaN },
    teamGamesWithNegativeResidual: pools.filter((p) => p.residualDesignedRushes < -0.5).length,
    rosterCoverageBySeasonPct,
    rushShareSumByTeamGame: summary([...rushShareSumByTeamGame.values()]),
    receivingTargetSumVsAttempts: summary([...recTargetSumByTeamGame.values()].filter((v) => v.attempts > 0).map((v) => v.targets / v.attempts)),
  };
}

export function assembleDataset(args: {
  generatedAt: string;
  seasons: number[];
  pools: NflTeamPositionalPoolRow[];
  rushShares: NflRushShareRow[];
  receivingShares: NflReceivingShareRow[];
  teamGamesExpected: number;
}): NflRoleAllocationDataset {
  return {
    schemaVersion: NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION,
    generatedAt: args.generatedAt,
    seasons: args.seasons,
    teamPositionalPools: args.pools,
    rushShares: args.rushShares,
    receivingShares: args.receivingShares,
    qa: summariseDataset(args.seasons, args.pools, args.rushShares, args.receivingShares, args.teamGamesExpected),
  };
}
