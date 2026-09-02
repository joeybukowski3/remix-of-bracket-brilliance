import { describe, expect, it } from "vitest";
import {
  allocateReceivingTargetsForTeam,
  fitReceivingShareModel,
  NFL_RECEIVING_V2_MODEL_VERSION,
  type NflReceivingAllocationCandidate,
  type NflReceivingShareModel,
} from "./receivingProduction";
import type { NflRoleAllocationDataset, NflTeamPositionalPoolRow } from "./types";

function poolRow(season: number, week: number, team: string): NflTeamPositionalPoolRow {
  return {
    schemaVersion: "nfl-role-allocation-dataset-v1",
    season,
    week,
    gameId: `${season}_${String(week).padStart(2, "0")}_X_${team}`,
    team,
    opponent: "opp",
    gameDateUtc: `${season}-09-1${week}T17:00:00.000Z`,
    designedRushes: 25,
    dropbacks: 38,
    teamPassAttempts: 32,
    sacks: 3,
    scrambles: 3,
    teamTargets: 31,
    rawCarries: { qb: 3, rb: 21, wrTe: 1 },
    qbDesignedRushes: 3,
    rushPools: { qb: 3, rb: 21, wrTe: 1 },
    poolCoverageRatio: 1,
    residualDesignedRushes: 0,
    rushPoolShares: { qb: 0.12, rb: 0.84, wrTe: 0.04 },
    targetable: { ratioActual: 32 / 38, sackRateActual: 3 / 38, scrambleRateActual: 3 / 38 },
  };
}

const dataset: NflRoleAllocationDataset = {
  schemaVersion: "nfl-role-allocation-dataset-v1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  seasons: [2024, 2025],
  teamPositionalPools: [poolRow(2024, 1, "aaa"), poolRow(2024, 2, "aaa"), poolRow(2025, 1, "aaa"), poolRow(2025, 2, "aaa")],
  rushShares: [],
  receivingShares: [
    ...["2024_01", "2024_02", "2025_01", "2025_02"].flatMap((tag, gi) => {
      const [season, week] = tag.split("_").map(Number);
      return [
        { pid: "wr1", pos: "WR" as const, rank: 1, targets: 10, share: 10 / 32, yds: 130 },
        { pid: "wr2", pos: "WR" as const, rank: 2, targets: 7, share: 7 / 32, yds: 80 },
        { pid: "wr3", pos: "WR" as const, rank: 3, targets: 3, share: 3 / 32, yds: 30 },
        { pid: "te1", pos: "TE" as const, rank: 1, targets: 5, share: 5 / 32, yds: 50 },
        { pid: "te4", pos: "TE" as const, rank: 4, targets: 1, share: 1 / 32, yds: 8 },
        { pid: "rb1", pos: "RB" as const, rank: 1, targets: 4, share: 4 / 32, yds: 30 },
      ].map((p) => ({
        schemaVersion: "nfl-role-allocation-dataset-v1" as const,
        season,
        week,
        gameId: `${season}_${String(week).padStart(2, "0")}_X_aaa`,
        team: "aaa",
        opponent: "opp",
        playerId: p.pid,
        playerName: p.pid,
        gameDateUtc: `${season}-09-1${week}T17:00:00.000Z`,
        targets: p.targets,
        receivingYards: p.yds,
        priorYardsPerTarget: p.yds / p.targets,
        shareOfTargetable: p.share,
        shareOfDropbacks: p.targets / 38,
        role: {
          depthRankProxy: p.rank,
          isProjectedStarter: p.rank === 1,
          position: p.pos,
          currentTeam: "aaa",
          priorTeam: "aaa",
          teamChanged: false,
          priorGamesPlayed: gi,
          noHistory: gi === 0,
          limitedHistory: gi > 0 && gi <= 3,
          priorTargetShare: p.share,
          priorTargetsPerGame: p.targets,
          rosterCompetitionCount: 4,
          concentration: 0.3,
        },
      }));
    }),
  ],
  qa: {} as never,
};

const model: NflReceivingShareModel = fitReceivingShareModel(dataset);

function cand(o: Partial<NflReceivingAllocationCandidate> & Pick<NflReceivingAllocationCandidate, "playerId" | "position" | "depthRank">): NflReceivingAllocationCandidate {
  return {
    playerName: o.playerId,
    roleSourced: true,
    priorTargetShare: 0.15,
    priorGamesPlayed: 10,
    noHistory: false,
    limitedHistory: false,
    teamChanged: false,
    rosterCompetitionCount: 5,
    concentration: 0.3,
    v1YardsPerTarget: 8,
    v1ProjectedTargets: 5,
    ...o,
  } as NflReceivingAllocationCandidate;
}

describe("fitReceivingShareModel", () => {
  it("is deterministic and exposes the v2 version tag", () => {
    const a = fitReceivingShareModel(dataset);
    const b = fitReceivingShareModel(dataset);
    expect(a.leagueYardsPerTarget).toBe(b.leagueYardsPerTarget);
    expect(NFL_RECEIVING_V2_MODEL_VERSION).toBe("nfl-receiving-share-x-efficiency-v2.0.0");
  });
});

describe("allocateReceivingTargetsForTeam", () => {
  const candidates = [
    cand({ playerId: "wr1", position: "WR", depthRank: 1, priorTargetShare: 0.3, v1ProjectedTargets: 9, v1YardsPerTarget: 12 }),
    cand({ playerId: "wr2", position: "WR", depthRank: 2, priorTargetShare: 0.2, v1ProjectedTargets: 6, v1YardsPerTarget: 10 }),
    cand({ playerId: "te1", position: "TE", depthRank: 1, priorTargetShare: 0.16, v1ProjectedTargets: 5, v1YardsPerTarget: 9 }),
    cand({ playerId: "rb1", position: "RB", depthRank: 1, priorTargetShare: 0.1, v1ProjectedTargets: 4, v1YardsPerTarget: 6 }),
  ];

  it("reduces dropbacks to a targetable pool below the dropback count and allocates exactly to it", () => {
    const r = allocateReceivingTargetsForTeam({
      team: "aaa",
      gameId: "2026_01_X_aaa",
      season: 2026,
      week: 1,
      kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: 40,
      candidates,
      model,
    });
    expect(r.projectedTargetablePool!).toBeLessThan(40);
    expect(r.allocatedTargets).toBeCloseTo(r.projectedTargetablePool!, 6);
    expect(Math.abs(r.residualUnallocated)).toBeLessThan(1e-6);
    expect(r.coherenceOk).toBe(true);
    expect(r.usedV1Fallback).toBe(false);
    expect(r.players.reduce((s, p) => s + p.projectedTargets, 0)).toBeCloseTo(r.projectedTargetablePool!, 6);
  });

  it("keeps the v1 efficiency leg exactly (yards = allocated targets × v1 YPT)", () => {
    const r = allocateReceivingTargetsForTeam({
      team: "aaa",
      gameId: "2026_01_X_aaa",
      season: 2026,
      week: 1,
      kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: 40,
      candidates,
      model,
    });
    const wr1 = r.players.find((p) => p.playerId === "wr1")!;
    expect(wr1.projectedYards).toBeCloseTo(wr1.projectedTargets * 12, 9);
  });

  it("falls back to v1 per-player targets when the team opportunity pool is unavailable", () => {
    const r = allocateReceivingTargetsForTeam({
      team: "aaa",
      gameId: "2026_01_X_aaa",
      season: 2026,
      week: 1,
      kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: null,
      candidates,
      model,
    });
    expect(r.usedV1Fallback).toBe(true);
    expect(r.players.every((p) => p.allocationFallbackReason === "noTeamOpportunity")).toBe(true);
    const wr1 = r.players.find((p) => p.playerId === "wr1")!;
    expect(wr1.projectedTargets).toBe(9);
    expect(wr1.projectedYards).toBeCloseTo(9 * 12, 9);
  });

  it("ranks the sourced WR1 above the WR2 and gives depth players near-zero", () => {
    const r = allocateReceivingTargetsForTeam({
      team: "aaa",
      gameId: "2026_01_X_aaa",
      season: 2026,
      week: 1,
      kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: 40,
      candidates: [
        ...candidates,
        cand({ playerId: "te4", position: "TE", depthRank: 4, noHistory: true, priorTargetShare: null, priorGamesPlayed: 0, v1ProjectedTargets: 3.4, v1YardsPerTarget: 7 }),
      ],
      model,
    });
    const wr1 = r.players.find((p) => p.playerId === "wr1")!.projectedTargets;
    const wr2 = r.players.find((p) => p.playerId === "wr2")!.projectedTargets;
    const te4 = r.players.find((p) => p.playerId === "te4")!.projectedTargets;
    expect(wr1).toBeGreaterThan(wr2);
    expect(te4).toBeLessThan(1.5);
  });
});
