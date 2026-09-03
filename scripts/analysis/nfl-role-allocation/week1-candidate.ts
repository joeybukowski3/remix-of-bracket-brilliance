/**
 * WU4B S5B — LIVE Week 1 2026 candidate (side-by-side, non-destructive).
 *
 * Reads only committed artifacts:
 *   public/data/nfl/2026/team-opportunity.json   (WU4A, committed)
 *   public/data/nfl/2026/yardage-projections.json (OLD production v1)
 *   data/nfl/props/role-allocation-dataset-2022-2025.json (WU4B research)
 *
 * Produces `data/nfl/props/role-allocation-week1-candidate-2026.json` and a
 * console OLD-vs-NEW comparison. Does NOT write or overwrite any production
 * artifact, archive, or model version.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/week1-candidate.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NflRoleAllocationDataset } from "../../../src/lib/nfl/props/roleAllocation/types";
import {
  buildTeamPriorPoolTendency,
  computePoolLeagueConstants,
  projectRushPools,
  projectTargetablePass,
} from "../../../src/lib/nfl/props/roleAllocation/poolModels";
import { fitShareModel, predictRawShare, type NflShareObservation } from "../../../src/lib/nfl/props/roleAllocation/shareModels";
import { allocatePool, type NflDominantAnchorConfig } from "../../../src/lib/nfl/props/roleAllocation/allocate";
import { buildShareObservations } from "../../../src/lib/nfl/props/roleAllocation/walkForward";
import type { NflNoHistoryCalibration, NflTeamChangeCalibration } from "../../../src/lib/nfl/props/roleAllocation/shareModels";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = join(ROOT, "data", "nfl", "props", "role-allocation-week1-candidate-2026.json");

// --- S5A chosen calibration (selected on 2024, frozen; validated on 2025) ---
const RUSH_DOMINANT_ANCHOR: NflDominantAnchorConfig = { minPriorGamesPlayed: 4, minConcentration: 0.6, minRawShare: 0.5, shareCap: 0.95, usePriorShare: true };
const RUSH_NO_HISTORY_CAL: NflNoHistoryCalibration = { shareMultiplier: 0.55, rankBackoff: 0, rosterCompetitionRef: null };
// S5E role-transition calibration — evaluated below; set to null for the "S5 unchanged" comparison.
const RUSH_TEAM_CHANGE_CAL: NflTeamChangeCalibration | null = { carryover: 0.35, rankPriorBoost: 3, conflictThreshold: 0.08, requireSourced: true };
const SHARE_MODEL = "shrinkageBlend" as const;
const RUSH_K = 1;
const RECEIVING_K = 2;

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T;
}
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw e;
  }
}
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

type TeamOppRow = { team: string; opponent: string; gameId: string; kickoff: string; projectedRushAttempts: number; projectedPassAttempts: number };
type OldRow = {
  gameId: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: "QB" | "RB" | "WR" | "TE";
  market: "rushing" | "receiving" | "passing";
  depthRank: number | null;
  roleConfidence?: string;
  projectedCarries?: number;
  projectedTargets?: number;
  projectedYards: number;
};

const teamOpp = readJson<{ rows: TeamOppRow[] }>("public/data/nfl/2026/team-opportunity.json").rows;
const teamOppByTeam = new Map(teamOpp.map((r) => [r.team, r]));
const oldRows = readJson<{ rows: OldRow[] }>("public/data/nfl/2026/yardage-projections.json").rows;
const dataset = readJson<NflRoleAllocationDataset>("data/nfl/props/role-allocation-dataset-2022-2025.json");
const { rush: rushObsAll, receiving: recObsAll, poolRows } = buildShareObservations(dataset);

// --- fit models on the full 2022-2025 research dataset ---
const trainRush = rushObsAll;
const trainRec = recObsAll;
const rushFit = fitShareModel(trainRush, RUSH_K);
const recFit = fitShareModel(trainRec, RECEIVING_K);
const league = computePoolLeagueConstants(poolRows);
const rushLeagueEff = trainRush.reduce((s, r) => s + r.actualYards, 0) / trainRush.reduce((s, r) => s + r.actualVolume, 0);
const recLeagueEff = trainRec.reduce((s, r) => s + r.actualYards, 0) / trainRec.reduce((s, r) => s + r.actualVolume, 0);

// --- per-player 2025 prior aggregates from the dataset ---
type PriorAgg = { games: number; poolShareMean: number | null; targetShareMean: number | null; ypc: number | null; ypt: number | null; lastTeam: string | null; concentration: number | null };
function agg2025Rush(): Map<string, PriorAgg> {
  const m = new Map<string, PriorAgg>();
  const by = new Map<string, typeof dataset.rushShares>();
  for (const r of dataset.rushShares) if (r.season === 2025) (by.get(r.playerId) ?? by.set(r.playerId, []).get(r.playerId)!).push(r);
  for (const [pid, rows] of by) {
    const sorted = [...rows].sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
    const car = sorted.reduce((s, r) => s + r.carries, 0);
    const yds = sorted.reduce((s, r) => s + r.rushingYards, 0);
    const shares = sorted.map((r) => r.shareOfPositionalPool).filter((v): v is number => v != null);
    const conc = sorted.map((r) => r.role.committeeConcentration).filter((v): v is number => v != null);
    m.set(pid, {
      games: sorted.length,
      poolShareMean: shares.length ? shares.reduce((s, v) => s + v, 0) / shares.length : null,
      targetShareMean: null,
      ypc: car > 0 ? yds / car : null,
      ypt: null,
      lastTeam: sorted.at(-1)?.team ?? null,
      concentration: conc.length ? conc.reduce((s, v) => s + v, 0) / conc.length : null,
    });
  }
  return m;
}
function agg2025Rec(): Map<string, PriorAgg> {
  const m = new Map<string, PriorAgg>();
  const by = new Map<string, typeof dataset.receivingShares>();
  for (const r of dataset.receivingShares) if (r.season === 2025) (by.get(r.playerId) ?? by.set(r.playerId, []).get(r.playerId)!).push(r);
  for (const [pid, rows] of by) {
    const sorted = [...rows].sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
    const tgt = sorted.reduce((s, r) => s + r.targets, 0);
    const yds = sorted.reduce((s, r) => s + r.receivingYards, 0);
    const shares = sorted.map((r) => r.shareOfTargetable).filter((v): v is number => v != null);
    m.set(pid, {
      games: sorted.length,
      poolShareMean: null,
      targetShareMean: shares.length ? shares.reduce((s, v) => s + v, 0) / shares.length : null,
      ypc: null,
      ypt: tgt > 0 ? yds / tgt : null,
      lastTeam: sorted.at(-1)?.team ?? null,
      concentration: null,
    });
  }
  return m;
}
const rushPrior = agg2025Rush();
const recPrior = agg2025Rec();

const RUSH_POOL_OF: Record<OldRow["position"], "qb" | "rb" | "wrTe"> = { QB: "qb", RB: "rb", WR: "wrTe", TE: "wrTe" };

function makeRushObs(o: OldRow, competitionCount: number): NflShareObservation {
  const prior = rushPrior.get(o.playerId);
  const poolKey = RUSH_POOL_OF[o.position];
  const to = teamOppByTeam.get(o.team)!;
  const teamChanged = prior?.lastTeam != null ? prior.lastTeam !== o.team : null;
  return {
    season: 2026,
    week: 1,
    gameId: o.gameId,
    team: o.team,
    playerName: o.playerName,
    playerId: o.playerId,
    poolId: `${o.gameId}|${o.team}|${poolKey}`,
    poolKey,
    rankKey: `rank:${o.depthRank != null ? Math.min(o.depthRank, 6) : "NA"}`,
    depthRankProxy: o.depthRank ?? null,
    isProjectedStarter: o.depthRank === 1,
    priorShare: prior?.poolShareMean ?? null,
    priorGamesPlayed: prior?.games ?? 0,
    noHistory: !prior || prior.games === 0,
    limitedHistory: !!prior && prior.games > 0 && prior.games <= 3,
    teamChanged,
    roleSourced: o.roleConfidence === "sourced",
    // for a team-changed player use the NEW team's recent backfield concentration, not their old games'
    concentration: (teamChanged ? teamConcentration2025.get(o.team) : prior?.concentration) ?? teamConcentration2025.get(o.team) ?? null,
    rosterCompetitionCount: competitionCount,
    priorEfficiency: prior?.ypc ?? null,
    actualShare: null,
    actualVolume: 0,
    actualYards: 0,
    context: { teamDesignedRushes: to.projectedRushAttempts, teamDropbacks: to.projectedPassAttempts, poolActual: 0, gameDateUtc: to.kickoff },
  };
}
function makeRecObs(o: OldRow, competitionCount: number): NflShareObservation {
  const prior = recPrior.get(o.playerId);
  const to = teamOppByTeam.get(o.team)!;
  const teamChanged = prior?.lastTeam != null ? prior.lastTeam !== o.team : null;
  return {
    season: 2026,
    week: 1,
    gameId: o.gameId,
    team: o.team,
    playerName: o.playerName,
    playerId: o.playerId,
    poolId: `${o.gameId}|${o.team}|receiving`,
    poolKey: "receiving",
    rankKey: `${o.position}:${o.depthRank != null ? Math.min(o.depthRank, 6) : "NA"}`,
    depthRankProxy: o.depthRank ?? null,
    isProjectedStarter: o.depthRank === 1,
    priorShare: prior?.targetShareMean ?? null,
    priorGamesPlayed: prior?.games ?? 0,
    noHistory: !prior || prior.games === 0,
    limitedHistory: !!prior && prior.games > 0 && prior.games <= 3,
    teamChanged,
    roleSourced: o.roleConfidence === "sourced",
    concentration: null,
    rosterCompetitionCount: competitionCount,
    priorEfficiency: prior?.ypt ?? null,
    actualShare: null,
    actualVolume: 0,
    actualYards: 0,
    context: { teamDesignedRushes: to.projectedRushAttempts, teamDropbacks: to.projectedPassAttempts, poolActual: 0, gameDateUtc: to.kickoff },
  };
}

// team 2025 concentration fallback
const teamConcentration2025 = new Map<string, number>();
{
  const by = new Map<string, number[]>();
  for (const r of dataset.rushShares) {
    if (r.season !== 2025 || r.role.committeeConcentration == null) continue;
    (by.get(r.team) ?? by.set(r.team, []).get(r.team)!).push(r.role.committeeConcentration);
  }
  for (const [t, v] of by) teamConcentration2025.set(t, v.reduce((s, x) => s + x, 0) / v.length);
}

// --- allocate per team ---
type PlayerCompare = {
  team: string;
  gameId: string;
  playerId: string;
  playerName: string;
  position: string;
  poolKey: string;
  depthRank: number | null;
  teamChanged: boolean | null;
  noHistory: boolean;
  old: { volume: number; yards: number };
  next: { rawShare: number; normalizedShare: number; volume: number; yards: number };
  deltaVolume: number;
  deltaYards: number;
};

const compares: PlayerCompare[] = [];
const teamSummaries: Record<string, unknown> = {};
const sanity: string[] = [];
const teamChangedRbs: Record<string, unknown>[] = [];

for (const to of teamOpp) {
  const teamRush = oldRows.filter((r) => r.team === to.team && r.market === "rushing");
  const teamRec = oldRows.filter((r) => r.team === to.team && r.market === "receiving");
  const tendency = buildTeamPriorPoolTendency(poolRows, to.team, 2026, 1, to.kickoff);
  const rushPools = projectRushPools(to.projectedRushAttempts, tendency, league, 0);
  const targetable = projectTargetablePass("calibratedRatio", to.projectedPassAttempts, tendency, league).projectedTargetable;

  // rush: allocate within each of the 3 sub-pools
  const rushByPool = new Map<"qb" | "rb" | "wrTe", OldRow[]>([["qb", []], ["rb", []], ["wrTe", []]]);
  for (const r of teamRush) rushByPool.get(RUSH_POOL_OF[r.position])!.push(r);

  const teamRushOldTotal = teamRush.reduce((s, r) => s + (r.projectedCarries ?? 0), 0);
  let teamRushNextTotal = 0;
  const poolTotals: Record<string, { pool: number; allocated: number; players: number }> = {};

  for (const [poolKey, rows] of rushByPool) {
    const poolSize = rushPools[poolKey];
    // QB designed rushing is RETAINED on production v1 (WU4A's projected_rush_attempts
    // excludes scrambles, which are ~40-50% of a mobile QB's rushing). The QB designed
    // sub-pool is still carved out of the team pool so it is NOT handed to RBs.
    if (poolKey === "qb") {
      poolTotals.qb = { pool: round(poolSize), allocated: round(rows.reduce((s, r) => s + (r.projectedCarries ?? 0), 0)), players: rows.length };
      for (const r of rows) {
        teamRushNextTotal += r.projectedCarries ?? 0;
        compares.push({
          team: to.team,
          gameId: to.gameId,
          playerId: r.playerId,
          playerName: r.playerName,
          position: r.position,
          poolKey: "qb-retained-v1",
          depthRank: r.depthRank ?? null,
          teamChanged: null,
          noHistory: false,
          old: { volume: r.projectedCarries ?? 0, yards: r.projectedYards },
          next: { rawShare: 0, normalizedShare: 0, volume: r.projectedCarries ?? 0, yards: r.projectedYards },
          deltaVolume: 0,
          deltaYards: 0,
        });
      }
      continue;
    }
    if (rows.length === 0) {
      poolTotals[poolKey] = { pool: round(poolSize), allocated: 0, players: 0 };
      if (poolSize > 0.5) sanity.push(`${to.team} ${poolKey} pool ${round(poolSize)} carries UNALLOCATED (no eligible ${poolKey} rusher in universe)`);
      continue;
    }
    const compCount = new Set(rows.map((r) => r.playerId)).size;
    const obs = rows.map((r) => makeRushObs(r, compCount));
    const anchor = poolKey === "rb" ? RUSH_DOMINANT_ANCHOR : null;
    // S5 candidate (unchanged) vs S5E role-transition refinement, side by side.
    const allocS5 = allocatePool(obs, poolSize, (x) => predictRawShare(SHARE_MODEL, rushFit, x, x.noHistory ? RUSH_NO_HISTORY_CAL : null, null), rushLeagueEff, anchor);
    const alloc = allocatePool(
      obs,
      poolSize,
      (x) => predictRawShare(SHARE_MODEL, rushFit, x, x.noHistory ? RUSH_NO_HISTORY_CAL : null, RUSH_TEAM_CHANGE_CAL),
      rushLeagueEff,
      anchor,
    );
    if (poolKey === "rb") {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        const o = obs[i];
        if (o.teamChanged !== true) continue;
        const s5 = allocS5.players[i];
        const s5e = alloc.players[i];
        const rankPrior = rushFit.rankPrior.get(o.rankKey) ?? rushFit.overallMean;
        teamChangedRbs.push({
          player: r.playerName,
          currentTeam: o.team,
          priorTeam: rushPrior.get(r.playerId)?.lastTeam ?? null,
          currentDepthRank: r.depthRank ?? null,
          roleSourced: o.roleSourced,
          oldTeamPriorShare: round(o.priorShare ?? 0, 3),
          currentRankPrior: round(rankPrior, 3),
          s5CandidateShare: round(s5.normalizedShare, 3),
          s5eAdjustedShare: round(s5e.normalizedShare, 3),
          s5Carries: round(s5.projectedVolume),
          s5eCarries: round(s5e.projectedVolume),
          v1Carries: round(r.projectedCarries ?? 0),
          roleVsUsage:
            o.priorShare == null
              ? "no-usage"
              : Math.abs((o.priorShare ?? 0) - rankPrior) <= 0.08
                ? "agree"
                : (o.priorShare ?? 0) > rankPrior
                  ? "conflict (usage > sourced role)"
                  : "conflict (usage < sourced role)",
          s5eActivated: Math.abs(s5.normalizedShare - s5e.normalizedShare) > 0.005,
        });
      }
    }
    poolTotals[poolKey] = { pool: round(poolSize), allocated: round(alloc.coherence.volumeSum), players: rows.length };
    if (alloc.coherence.anyNegativeShare) sanity.push(`${to.team} ${poolKey}: negative share`);
    if (alloc.coherence.anyShareOverOne) sanity.push(`${to.team} ${poolKey}: share > 1`);
    if (alloc.coherence.duplicatePlayerIds) sanity.push(`${to.team} ${poolKey}: duplicate player`);
    if (Math.abs(alloc.coherence.volumeResidual) > 1e-6) sanity.push(`${to.team} ${poolKey}: residual ${alloc.coherence.volumeResidual}`);
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const p = alloc.players[i];
      teamRushNextTotal += p.projectedVolume;
      compares.push({
        team: to.team,
        gameId: to.gameId,
        playerId: r.playerId,
        playerName: r.playerName,
        position: r.position,
        poolKey,
        depthRank: r.depthRank ?? null,
        teamChanged: p.obs.teamChanged,
        noHistory: p.obs.noHistory,
        old: { volume: r.projectedCarries ?? 0, yards: r.projectedYards },
        next: { rawShare: round(p.rawShare, 4), normalizedShare: round(p.normalizedShare, 4), volume: p.projectedVolume, yards: p.projectedYards },
        deltaVolume: p.projectedVolume - (r.projectedCarries ?? 0),
        deltaYards: p.projectedYards - r.projectedYards,
      });
    }
  }

  // receiving: single pool
  const teamRecOldTotal = teamRec.reduce((s, r) => s + (r.projectedTargets ?? 0), 0);
  let teamRecNextTotal = 0;
  if (teamRec.length > 0) {
    const compByPos = new Map<string, number>();
    for (const r of teamRec) compByPos.set(r.position, (compByPos.get(r.position) ?? 0) + 1);
    const obs = teamRec.map((r) => makeRecObs(r, compByPos.get(r.position) ?? 1));
    const alloc = allocatePool(obs, targetable, (x) => predictRawShare(SHARE_MODEL, recFit, x, x.noHistory ? null : null), recLeagueEff, null);
    if (alloc.coherence.volumeSum > targetable + 1e-6) sanity.push(`${to.team} receiving: allocated ${round(alloc.coherence.volumeSum)} > targetable ${round(targetable)}`);
    for (let i = 0; i < teamRec.length; i += 1) {
      const r = teamRec[i];
      const p = alloc.players[i];
      teamRecNextTotal += p.projectedVolume;
      compares.push({
        team: to.team,
        gameId: to.gameId,
        playerId: r.playerId,
        playerName: r.playerName,
        position: r.position,
        poolKey: "receiving",
        depthRank: r.depthRank ?? null,
        teamChanged: p.obs.teamChanged,
        noHistory: p.obs.noHistory,
        old: { volume: r.projectedTargets ?? 0, yards: r.projectedYards },
        next: { rawShare: round(p.rawShare, 4), normalizedShare: round(p.normalizedShare, 4), volume: p.projectedVolume, yards: p.projectedYards },
        deltaVolume: p.projectedVolume - (r.projectedTargets ?? 0),
        deltaYards: p.projectedYards - r.projectedYards,
      });
    }
  }

  const poolSizesSum = (poolTotals.rb?.pool ?? 0) + (poolTotals.wrTe?.pool ?? 0) + (poolTotals.qb?.pool ?? 0);
  const rbFullyAllocated = poolTotals.rb ? Math.abs(poolTotals.rb.pool - poolTotals.rb.allocated) <= 0.02 : true;
  const unallocatedWrTe = poolTotals.wrTe && poolTotals.wrTe.players === 0 ? poolTotals.wrTe.pool : 0;
  teamSummaries[to.team] = {
    wu4aRushPool: round(to.projectedRushAttempts),
    wu4aDropbacks: round(to.projectedPassAttempts),
    targetablePool: round(targetable),
    rushPools: poolTotals,
    designedPoolSizesSum: round(poolSizesSum),
    designedPoolIdentityHolds: Math.abs(poolSizesSum - to.projectedRushAttempts) <= 0.02,
    rbFullyAllocated,
    unallocatedWrTeCarries: round(unallocatedWrTe),
    rush: { oldTotalCarries: round(teamRushOldTotal), newTotalCarriesInclQbScrambles: round(teamRushNextTotal) },
    receiving: { oldTotalTargets: round(teamRecOldTotal), newTotalTargets: round(teamRecNextTotal) },
  };
}

// --- reports ---
const bigMoves = [...compares].sort((a, b) => Math.abs(b.deltaVolume) - Math.abs(a.deltaVolume)).slice(0, 15);
function findP(name: string, market: "rush" | "rec") {
  return compares.filter((c) => c.playerName.includes(name) && (market === "rush" ? c.poolKey !== "receiving" : c.poolKey === "receiving"));
}
const spotlight = {
  woodyMarks: { rush: findP("Marks", "rush"), receiving: findP("Marks", "rec") },
  davidMontgomery: { rush: findP("Montgomery", "rush"), receiving: findP("Montgomery", "rec") },
  houRb: (teamSummaries.hou as { rushPools: unknown }).rushPools,
  houBackfield: compares.filter((c) => c.team === "hou" && c.poolKey === "rb"),
  noTeamCarries: (teamSummaries.no as { rush: unknown }).rush,
  lvTeamCarries: (teamSummaries.lv as { rush: unknown }).rush,
  targetTotals: {
    tb: (teamSummaries.tb as { receiving: unknown }).receiving,
    den: (teamSummaries.den as { receiving: unknown }).receiving,
    cin: (teamSummaries.cin as { receiving: unknown }).receiving,
  },
};

// S5C structural checks
const teamsGenerated = new Set(compares.map((c) => c.team));
const gamesBothSides = (() => {
  const byGame = new Map<string, Set<string>>();
  for (const c of compares) (byGame.get(c.gameId) ?? byGame.set(c.gameId, new Set()).get(c.gameId)!).add(c.team);
  return [...byGame.values()].every((s) => s.size === 2);
})();
const structural = {
  teamsGenerated: teamsGenerated.size,
  allGamesBothSides: gamesBothSides,
  // designed-rush pool identity: qb + rb + wrTe sub-pool sizes == WU4A projected_rush_attempts, every team
  designedPoolIdentityHoldsAllTeams: Object.values(teamSummaries).every((t) => (t as { designedPoolIdentityHolds: boolean }).designedPoolIdentityHolds),
  rbPoolFullyAllocatedAllTeams: Object.values(teamSummaries).every((t) => (t as { rbFullyAllocated: boolean }).rbFullyAllocated),
  totalUnallocatedWrTeCarriesLeague: round(Object.values(teamSummaries).reduce((s, t) => s + (t as { unallocatedWrTeCarries: number }).unallocatedWrTeCarries, 0)),
  // QB rows retain v1 and may exceed the QB designed sub-pool by their scramble volume (expected, documented)
  qbRetainedV1: true,
  noTeamExceedsTargetablePool: Object.values(teamSummaries).every((t) => {
    const s = t as { receiving: { newTotalTargets: number }; targetablePool: number };
    return s.receiving.newTotalTargets <= s.targetablePool + 1e-6;
  }),
  sanityFlags: sanity,
};

const report = {
  _meta: {
    schemaVersion: "nfl-role-allocation-week1-candidate-v1",
    generatedAt: new Date().toISOString(),
    season: 2026,
    week: 1,
    note: "Side-by-side candidate. No production artifact/archive/version written. Rush uses S5A calibration; receiving uses S4 calibratedRatio.",
    calibration: { model: SHARE_MODEL, rushK: RUSH_K, receivingK: RECEIVING_K, rushDominantAnchor: RUSH_DOMINANT_ANCHOR, rushNoHistoryCal: RUSH_NO_HISTORY_CAL },
  },
  structural,
  spotlight,
  s5eRoleTransition: {
    calibration: RUSH_TEAM_CHANGE_CAL,
    teamChangedRbsWithSourcedDepthChart: teamChangedRbs,
  },
  largest15VolumeChanges: bigMoves,
  teamSummaries,
  players: compares,
};
writeAtomic(OUT, `${JSON.stringify(report, null, 2)}\n`);

console.log("STRUCTURAL:", JSON.stringify(structural, null, 1));
console.log("\nS5E — teamChanged RBs (sourced depth chart):");
for (const t of teamChangedRbs as Record<string, string | number | boolean | null>[]) {
  console.log(
    `  ${String(t.player).padEnd(20)} ${t.priorTeam}→${t.currentTeam} dr${t.currentDepthRank} | oldShare ${t.oldTeamPriorShare} rankPrior ${t.currentRankPrior} | ${t.roleVsUsage} | S5 ${t.s5CandidateShare}(${t.s5Carries}c) → S5E ${t.s5eAdjustedShare}(${t.s5eCarries}c)${t.s5eActivated ? " *ACTIVATED*" : ""}`,
  );
}
console.log("\nMARKS:", JSON.stringify(spotlight.woodyMarks));
console.log("MONTGOMERY:", JSON.stringify(spotlight.davidMontgomery));
console.log("\nHOU RB pool:", JSON.stringify(spotlight.houRb));
console.log("HOU backfield:", spotlight.houBackfield.map((c) => `${c.playerName} dr${c.depthRank} ${round(c.old.volume)}→${round(c.next.volume)}`).join(" | "));
console.log("\nNO carries:", JSON.stringify(spotlight.noTeamCarries), " LV carries:", JSON.stringify(spotlight.lvTeamCarries));
console.log("Target totals:", JSON.stringify(spotlight.targetTotals));
console.log("\nLargest 15 volume changes:");
for (const c of bigMoves) console.log(`  ${c.playerName.padEnd(22)} ${c.team} ${c.poolKey.padEnd(9)} dr${c.depthRank ?? "-"} ${c.noHistory ? "NOHIST " : ""}${c.teamChanged ? "TEAMCHG " : ""} ${round(c.old.volume)} → ${round(c.next.volume)}  (${c.deltaVolume > 0 ? "+" : ""}${round(c.deltaVolume)})`);
console.log(`\nWrote ${OUT}`);
