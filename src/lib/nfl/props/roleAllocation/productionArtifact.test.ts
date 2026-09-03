import { describe, expect, it } from "vitest";
import {
  allocateReceivingTargetsForTeam,
  fitReceivingShareModel,
  type NflReceivingAllocationCandidate,
} from "./receivingProduction";
import {
  loadReceivingRoleAllocationModel,
  NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION,
  NflReceivingArtifactLoadError,
  serializeReceivingRoleAllocationModel,
} from "./productionArtifact";
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
        { pid: "te1", pos: "TE" as const, rank: 1, targets: 5, share: 5 / 32, yds: 50 },
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

const candidates = [
  cand({ playerId: "wr1", position: "WR", depthRank: 1, priorTargetShare: 0.3, v1ProjectedTargets: 9, v1YardsPerTarget: 12 }),
  cand({ playerId: "wr2", position: "WR", depthRank: 2, priorTargetShare: 0.2, v1ProjectedTargets: 6, v1YardsPerTarget: 10 }),
  cand({ playerId: "te1", position: "TE", depthRank: 1, priorTargetShare: 0.16, v1ProjectedTargets: 5, v1YardsPerTarget: 9 }),
  cand({ playerId: "rb1", position: "RB", depthRank: 1, priorTargetShare: 0.1, v1ProjectedTargets: 4, v1YardsPerTarget: 6 }),
];

describe("serializeReceivingRoleAllocationModel / loadReceivingRoleAllocationModel", () => {
  it("round-trips: allocation from a loaded artifact matches allocation from the freshly fitted model", () => {
    const fitted = fitReceivingShareModel(dataset);
    const artifact = serializeReceivingRoleAllocationModel(fitted, {
      trainedThroughSeason: 2025,
      datasetFingerprint: "sha256:test-fingerprint",
      generatedAt: "2026-08-01T00:00:00.000Z",
    });

    // The artifact is JSON-plain (no Map, no functions) -- round-trip it through
    // JSON exactly like a fresh CI runner reading the committed file off disk.
    const roundTripped = JSON.parse(JSON.stringify(artifact));
    const loaded = loadReceivingRoleAllocationModel(roundTripped);

    const args = {
      team: "aaa",
      gameId: "2026_01_X_aaa",
      season: 2026,
      week: 1,
      kickoffUtc: "2026-09-13T17:00:00.000Z",
      projectedDropbacks: 40,
      candidates,
    };
    const fromFitted = allocateReceivingTargetsForTeam({ ...args, model: fitted });
    const fromArtifact = allocateReceivingTargetsForTeam({ ...args, model: loaded });

    expect(fromArtifact.usedV1Fallback).toBe(false);
    expect(fromArtifact.coherenceOk).toBe(true);
    expect(fromArtifact.allocatedTargets).toBeCloseTo(fromFitted.allocatedTargets, 9);
    expect(fromArtifact.projectedTargetablePool).toBeCloseTo(fromFitted.projectedTargetablePool!, 9);
    for (const p of fromFitted.players) {
      const match = fromArtifact.players.find((x) => x.playerId === p.playerId)!;
      expect(match.projectedTargets).toBeCloseTo(p.projectedTargets, 9);
      expect(match.projectedYards).toBeCloseTo(p.projectedYards, 9);
    }
  });

  it("carries fitted-artifact provenance (hash + trainedThroughSeason) on the loaded model", () => {
    const fitted = fitReceivingShareModel(dataset);
    const artifact = serializeReceivingRoleAllocationModel(fitted, {
      trainedThroughSeason: 2025,
      datasetFingerprint: "sha256:test-fingerprint",
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
    const loaded = loadReceivingRoleAllocationModel(JSON.parse(JSON.stringify(artifact)));
    expect(loaded.fittedArtifactHash).toBe(artifact.contentHash);
    expect(loaded.trainedThroughSeason).toBe(2025);
  });

  it("is deterministic: fitting the same dataset twice produces an identical contentHash", () => {
    const meta = { trainedThroughSeason: 2025, datasetFingerprint: "sha256:test-fingerprint", generatedAt: "2026-08-01T00:00:00.000Z" };
    const a = serializeReceivingRoleAllocationModel(fitReceivingShareModel(dataset), meta);
    const b = serializeReceivingRoleAllocationModel(fitReceivingShareModel(dataset), { ...meta, generatedAt: "2026-08-02T00:00:00.000Z" });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("FAILS CLOSED on a schema-version mismatch", () => {
    const fitted = fitReceivingShareModel(dataset);
    const artifact = serializeReceivingRoleAllocationModel(fitted, { trainedThroughSeason: 2025, datasetFingerprint: "x", generatedAt: "2026-08-01T00:00:00.000Z" });
    const corrupted = { ...artifact, schemaVersion: "some-other-schema-v1" };
    expect(() => loadReceivingRoleAllocationModel(corrupted)).toThrow(NflReceivingArtifactLoadError);
  });

  it("FAILS CLOSED on a hash mismatch (hand-edited / corrupted artifact)", () => {
    const fitted = fitReceivingShareModel(dataset);
    const artifact = serializeReceivingRoleAllocationModel(fitted, { trainedThroughSeason: 2025, datasetFingerprint: "x", generatedAt: "2026-08-01T00:00:00.000Z" });
    const corrupted = { ...artifact, leagueYardsPerTarget: artifact.leagueYardsPerTarget + 1 };
    expect(() => loadReceivingRoleAllocationModel(corrupted)).toThrow(/hash mismatch/);
  });

  it("FAILS CLOSED on a malformed artifact (missing required fields)", () => {
    expect(() => loadReceivingRoleAllocationModel({ schemaVersion: NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION })).toThrow(NflReceivingArtifactLoadError);
    expect(() => loadReceivingRoleAllocationModel(null)).toThrow(NflReceivingArtifactLoadError);
    expect(() => loadReceivingRoleAllocationModel("not an object")).toThrow(NflReceivingArtifactLoadError);
  });

  it("FAILS CLOSED on a model-version mismatch", () => {
    const fitted = fitReceivingShareModel(dataset);
    const artifact = serializeReceivingRoleAllocationModel(fitted, { trainedThroughSeason: 2025, datasetFingerprint: "x", generatedAt: "2026-08-01T00:00:00.000Z" });
    const corrupted = { ...artifact, modelVersion: "nfl-receiving-share-x-efficiency-v3.0.0" };
    expect(() => loadReceivingRoleAllocationModel(corrupted)).toThrow(NflReceivingArtifactLoadError);
  });
});
