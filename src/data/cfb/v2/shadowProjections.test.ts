import { describe, expect, it } from "vitest";
import {
  buildCfbV2ShadowProjection,
  indexCfbV2ProjectionsByGameId,
  validateCfbV2PublicArtifact,
  CfbV2PublicArtifactValidationError,
  type CfbV2PublicProjectionArtifact,
  type CfbV2PublicProjectionRow,
} from "./shadowProjections";
import type { CfbGameModelProjections } from "@/data/cfb/types";

function row(overrides: Partial<CfbV2PublicProjectionRow> = {}): CfbV2PublicProjectionRow {
  return {
    gameId: "g1",
    season: 2026,
    week: 2,
    homeTeamId: "ala",
    awayTeamId: "aub",
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
    expectedHomePoints: 28,
    expectedAwayPoints: 20.5,
    projectedMargin: 7.5,
    projectedTotal: 48.5,
    homeWinProbability: 0.68,
    awayWinProbability: 0.32,
    ...overrides,
  };
}

function artifact(records: readonly CfbV2PublicProjectionRow[], overrides: Partial<CfbV2PublicProjectionArtifact> = {}): CfbV2PublicProjectionArtifact {
  return {
    schemaVersion: "cfb-v2-public-projections-1",
    season: 2026,
    asOfWeek: 2,
    dataAsOf: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T12:00:00.000Z",
    configVersion: "cfb-v2-config-test",
    modelVersion: "cfb-v2.0",
    scoringVersion: "cfb-scoring-v2.0",
    calibrationVersion: "cfb-calibration-v2.0",
    probabilityVersion: "cfb-probability-v2.0",
    ratingsContentHash: "sha-fnv1a-r0000000",
    projectionsContentHash: "sha-fnv1a-p0000000",
    healthState: "HEALTHY",
    degradedFlags: [],
    records,
    ...overrides,
  };
}

describe("WU7A §13 — successful read/join", () => {
  it("validates, joins by gameId, maps legacy fields with correct sign flip, and builds the internal shadow representation", () => {
    const a = artifact([row({ gameId: "g1", projectedMargin: 7.5, projectedTotal: 48.5, homeWinProbability: 0.68, awayWinProbability: 0.32 })]);
    const validated = validateCfbV2PublicArtifact(a, 2026);
    const byGameId = indexCfbV2ProjectionsByGameId(validated);
    const shadow = buildCfbV2ShadowProjection("g1", byGameId);

    expect(shadow.found).toBe(true);
    expect(shadow.matchupPopulation).toBe("fbs_vs_fbs");
    expect(shadow.projectionStatus).toBe("computed");
    expect(shadow.legacy).toEqual<CfbGameModelProjections>({
      jkbProjectedSpread: -7.5,
      jkbProjectedTotal: 48.5,
      homeWinProbability: 0.68,
      awayWinProbability: 0.32,
      neutralPowerDifference: null,
      homeFieldAdjustment: null,
      jkbPowerLine: null,
    });
    expect(shadow.raw?.expectedHomePoints).toBe(28);
    expect(shadow.raw?.expectedAwayPoints).toBe(20.5);
  });
});

describe("WU7A §14 — missing V2 artifact (absence must be safe)", () => {
  it("a gameId with no matching V2 row produces a found:false shadow with no legacy mapping, never a crash", () => {
    const a = artifact([row({ gameId: "g1" })]);
    const byGameId = indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a));
    const shadow = buildCfbV2ShadowProjection("g-does-not-exist", byGameId);
    expect(shadow.found).toBe(false);
    expect(shadow.legacy).toBeNull();
    expect(shadow.raw).toBeNull();
    expect(shadow.matchupPopulation).toBeNull();
  });

  it("an empty records array is a valid (not invalid) artifact — no games projected is not the same as a broken artifact", () => {
    expect(() => validateCfbV2PublicArtifact(artifact([]))).not.toThrow();
  });
});

describe("WU7A §15 — invalid V2 artifact (fail-safe)", () => {
  it("wrong schemaVersion throws", () => {
    const a = { ...artifact([row()]), schemaVersion: "cfb-v2-public-projections-OLD" };
    expect(() => validateCfbV2PublicArtifact(a)).toThrow(CfbV2PublicArtifactValidationError);
  });

  it("duplicate gameId throws", () => {
    const a = artifact([row({ gameId: "dup" }), row({ gameId: "dup" })]);
    expect(() => validateCfbV2PublicArtifact(a)).toThrow(/duplicate gameId/);
  });

  it("non-finite computed value throws", () => {
    const a = artifact([row({ expectedHomePoints: Number.NaN })]);
    expect(() => validateCfbV2PublicArtifact(a)).toThrow(CfbV2PublicArtifactValidationError);
  });

  it("wrong season (against an explicitly expected season) throws", () => {
    const a = artifact([row()], { season: 2025 });
    expect(() => validateCfbV2PublicArtifact(a, 2026)).toThrow(/does not match the expected season/);
  });

  it("margin/total coherence violation throws", () => {
    const a = artifact([row({ projectedMargin: 999 })]);
    expect(() => validateCfbV2PublicArtifact(a)).toThrow(/margin identity mismatch/);
  });

  it("win probabilities not summing to 1 throws", () => {
    const a = artifact([row({ homeWinProbability: 0.9, awayWinProbability: 0.9 })]);
    expect(() => validateCfbV2PublicArtifact(a)).toThrow(/do not sum to 1/);
  });

  it("malformed top-level value (not an object) throws rather than crashing the caller", () => {
    expect(() => validateCfbV2PublicArtifact("not an artifact")).toThrow(CfbV2PublicArtifactValidationError);
    expect(() => validateCfbV2PublicArtifact(null)).toThrow(CfbV2PublicArtifactValidationError);
    expect(() => validateCfbV2PublicArtifact(undefined)).toThrow(CfbV2PublicArtifactValidationError);
  });
});

describe("WU7A §16/§14 — unavailable V2 projection", () => {
  it("an unavailable fbs_vs_fbs row validates cleanly and produces no legacy mapping", () => {
    const a = artifact([row({ projectionStatus: "unavailable", expectedHomePoints: null, expectedAwayPoints: null, projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null })]);
    const byGameId = indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a));
    const shadow = buildCfbV2ShadowProjection("g1", byGameId);
    expect(shadow.found).toBe(true);
    expect(shadow.projectionStatus).toBe("unavailable");
    expect(shadow.legacy).toBeNull(); // no mapped displayed projection for an unavailable row
    expect(shadow.raw).toBeNull();
  });
});

describe("WU7A §16/§14 — FBS-vs-FCS", () => {
  it("an fbs_vs_fcs row (always unavailable) validates and produces no legacy mapping", () => {
    const a = artifact([row({ matchupPopulation: "fbs_vs_fcs", projectionStatus: "unavailable", expectedHomePoints: null, expectedAwayPoints: null, projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null })]);
    const byGameId = indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a));
    const shadow = buildCfbV2ShadowProjection("g1", byGameId);
    expect(shadow.matchupPopulation).toBe("fbs_vs_fcs");
    expect(shadow.legacy).toBeNull();
  });
});

describe("WU7A §17 — sign convention (full Stage-2 path, not just the old unit test)", () => {
  it("positive margin (home better) -> negative UI spread", () => {
    const a = artifact([row({ gameId: "g1", projectedMargin: 7.5 })]);
    const shadow = buildCfbV2ShadowProjection("g1", indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a)));
    expect(shadow.legacy?.jkbProjectedSpread).toBe(-7.5);
  });

  it("negative margin (away better) -> positive UI spread", () => {
    const a = artifact([row({ gameId: "g1", projectedMargin: -3.5, expectedHomePoints: 17, expectedAwayPoints: 20.5, projectedTotal: 37.5 })]);
    const shadow = buildCfbV2ShadowProjection("g1", indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a)));
    expect(shadow.legacy?.jkbProjectedSpread).toBe(3.5);
  });

  it("exactly zero margin (pick'em) -> zero UI spread, not negative zero", () => {
    const a = artifact([row({ gameId: "g1", projectedMargin: 0, expectedHomePoints: 24, expectedAwayPoints: 24, projectedTotal: 48 })]);
    const shadow = buildCfbV2ShadowProjection("g1", indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a)));
    expect(Object.is(shadow.legacy?.jkbProjectedSpread, -0)).toBe(false);
    expect(shadow.legacy?.jkbProjectedSpread).toBe(0);
  });
});

describe("WU7A §6 — game-ID join edge cases", () => {
  it("duplicate V2 gameId is rejected at validation time, before any join is attempted", () => {
    const a = artifact([row({ gameId: "dup" }), row({ gameId: "dup" })]);
    expect(() => indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a))).toThrow();
  });

  it("join never matches on team name/date — two different gameIds with identical teams/week stay distinct", () => {
    const a = artifact([row({ gameId: "g1", homeTeamId: "ala", awayTeamId: "aub" }), row({ gameId: "g2", homeTeamId: "ala", awayTeamId: "aub" })]);
    const byGameId = indexCfbV2ProjectionsByGameId(validateCfbV2PublicArtifact(a));
    expect(byGameId.size).toBe(2);
    expect(byGameId.get("g1")).not.toBe(byGameId.get("g2"));
  });
});
