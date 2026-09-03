import { describe, expect, it } from "vitest";
import {
  loadRushingShadowModel, serializeRushingShadowModel, NflRushingShadowArtifactLoadError,
  NFL_RUSHING_SHADOW_ALLOCATION_MODEL, type NflRushingShadowModel,
} from "./rushingShadowArtifact";

function model(): NflRushingShadowModel {
  return {
    allocationModelVersion: NFL_RUSHING_SHADOW_ALLOCATION_MODEL,
    fit: { rankPrior: new Map([["rank:1", 0.5], ["rank:2", 0.25]]), noHistoryPrior: 0.15, overallMean: 0.3, shrinkageK: 1, teamChangeRetainedGames: 1 },
    league: { rushPoolShares: { qb: 0.16, rb: 0.8, wrTe: 0.04 }, targetableRatio: 0.85, sackRate: 0.06, scrambleRate: 0.09 },
    leagueEfficiency: 4.2,
    poolRows: [{ team: "DAL", season: 2024, week: 1, gameId: "2024_01_DAL_X", gameDateUtc: "2024-09-08T17:00:00.000Z", dropbacks: 34, teamPassAttempts: 30, sacks: 2, scrambles: 2, rushPools: { qb: 4, rb: 20, wrTe: 1 } }],
    datasetSeasons: [2022, 2023, 2024, 2025],
  };
}
const meta = { trainedThroughSeason: 2025, datasetFingerprint: "abc123", generatedAt: "2026-09-03T00:00:00.000Z" };

describe("serializeRushingShadowModel / loadRushingShadowModel round-trip", () => {
  it("round-trips fit/league/poolRows exactly through JSON", () => {
    const artifact = serializeRushingShadowModel(model(), meta);
    const loaded = loadRushingShadowModel(JSON.parse(JSON.stringify(artifact)));
    expect([...loaded.fit.rankPrior.entries()]).toEqual([...model().fit.rankPrior.entries()]);
    expect(loaded.league).toEqual(model().league);
    expect(loaded.leagueEfficiency).toBe(4.2);
    expect(loaded.poolRows).toEqual(model().poolRows);
    expect(loaded.trainedThroughSeason).toBe(2025);
    expect(loaded.fittedArtifactHash).toBe(artifact.contentHash);
  });

  it("is deterministic (identical model+meta -> identical contentHash) modulo generatedAt", () => {
    const a = serializeRushingShadowModel(model(), meta);
    const b = serializeRushingShadowModel(model(), { ...meta, generatedAt: "2099-01-01T00:00:00.000Z" });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("fails closed on a corrupted/hand-edited artifact (hash mismatch)", () => {
    const artifact = serializeRushingShadowModel(model(), meta);
    const corrupted = { ...artifact, league: { ...artifact.league, targetableRatio: 0.99 } };
    expect(() => loadRushingShadowModel(corrupted)).toThrow(NflRushingShadowArtifactLoadError);
    expect(() => loadRushingShadowModel(corrupted)).toThrow(/hash mismatch/);
  });

  it("fails closed on a schemaVersion mismatch", () => {
    const artifact = serializeRushingShadowModel(model(), meta);
    expect(() => loadRushingShadowModel({ ...artifact, schemaVersion: "wrong-v0" })).toThrow(/schemaVersion mismatch/);
  });

  it("fails closed on a modelVersion mismatch", () => {
    const artifact = serializeRushingShadowModel(model(), meta);
    expect(() => loadRushingShadowModel({ ...artifact, modelVersion: "wrong-v0" })).toThrow(/modelVersion mismatch/);
  });

  it("fails closed on a non-object payload", () => {
    expect(() => loadRushingShadowModel(null)).toThrow(/not a JSON object/);
    expect(() => loadRushingShadowModel("garbage")).toThrow(/not a JSON object/);
  });

  it("fails closed on missing required fields", () => {
    const artifact = serializeRushingShadowModel(model(), meta);
    const { poolRows: _drop, ...withoutPoolRows } = artifact;
    expect(() => loadRushingShadowModel(withoutPoolRows)).toThrow(/missing required fields/);
  });
});
