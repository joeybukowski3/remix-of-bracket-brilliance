import { describe, expect, it } from "vitest";
import { buildCfbV2ResidualPool, CFB_V2_MIN_RESIDUAL_POOL_SIZE, CFB_V2_RESIDUAL_ORDER_POLICY } from "./residualPool";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2CalibrationResidualSeedRow } from "./scoringSupportTypes";

function fixtureRow(overrides: Partial<CfbV2CalibrationResidualSeedRow>): CfbV2CalibrationResidualSeedRow {
  return {
    gameId: "g",
    season: 2022,
    week: 5,
    rawExpectedHomePoints: 24,
    rawExpectedAwayPoints: 21,
    rawProjectedMargin: 3,
    rawProjectedTotal: 45,
    calibratedExpectedHomePoints: 25,
    calibratedExpectedAwayPoints: 20,
    calibratedTotal: 45,
    actualHomePoints: 28,
    actualAwayPoints: 17,
    actualTotal: 45,
    homeResidual: 3,
    awayResidual: -3,
    ...overrides,
  };
}

function fixtureArtifact(records: readonly CfbV2CalibrationResidualSeedRow[]): CfbV2CalibrationResidualSeedArtifact {
  return {
    schemaVersion: "s1",
    artifactVersion: "cfb-v2-calibration-residual-seed-2020-2025-v1",
    modelVersion: "cfb-ipr-v2.0",
    configVersion: "cfb-v2-config-test",
    phase9CandidateVersion: "test",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: new Date().toISOString(),
    generatorVersion: "test",
    recordCount: records.length,
    contentHash: "test",
    marketFree: true,
    records,
  };
}

describe("buildCfbV2ResidualPool (§2/§12)", () => {
  const artifact = fixtureArtifact([
    fixtureRow({ gameId: "g1", season: 2020, week: 3, homeResidual: 1, awayResidual: -1 }),
    fixtureRow({ gameId: "g2", season: 2020, week: 5, homeResidual: 2, awayResidual: -2 }),
    fixtureRow({ gameId: "g3", season: 2021, week: 1, homeResidual: 3, awayResidual: -3 }),
  ]);

  it("includes only rows strictly before the cutoff", () => {
    const pool = buildCfbV2ResidualPool(artifact, 2020, 5);
    expect(pool).toEqual([{ home: 1, away: -1 }]);
  });

  it("includes every row from an earlier season", () => {
    const pool = buildCfbV2ResidualPool(artifact, 2021, 1);
    expect(pool).toEqual([{ home: 1, away: -1 }, { home: 2, away: -2 }]);
  });

  it("never includes a future row", () => {
    const pool = buildCfbV2ResidualPool(artifact, 2020, 3);
    expect(pool).toEqual([]);
  });

  it("appends eligible current-season pairs without altering historical membership/values (§11 extension API)", () => {
    const pool = buildCfbV2ResidualPool(artifact, 2021, 1, [{ home: 9, away: -9 }]);
    expect(pool).toEqual([{ home: 1, away: -1 }, { home: 2, away: -2 }, { home: 9, away: -9 }]);
  });

  it("preserves individual pairs — no Gaussian/parametric collapse", () => {
    const pool = buildCfbV2ResidualPool(artifact, 2021, 1);
    expect(pool.length).toBe(2);
    expect(new Set(pool.map((p) => `${p.home}:${p.away}`)).size).toBe(2);
  });

  it("exports a versioned, explicit residual order policy (§2 — never left unresolved)", () => {
    expect(CFB_V2_RESIDUAL_ORDER_POLICY).toBe("GAME_ID_SORTED_v1");
    expect(CFB_V2_MIN_RESIDUAL_POOL_SIZE).toBe(10);
  });
});
