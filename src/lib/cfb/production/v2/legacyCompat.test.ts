import { describe, expect, it } from "vitest";
import { projectedMarginToUiSpread, toLegacyGameModelProjections } from "./legacyCompat";
import { CFB_V2_CALIBRATION_VERSION, CFB_V2_IPR_MODEL_VERSION, CFB_V2_PROBABILITY_VERSION, CFB_V2_SCORING_VERSION } from "./versions";
import type { CfbV2GameProjection } from "./types";

describe("projectedMarginToUiSpread — sign convention (§11)", () => {
  it("home favored: positive margin becomes a negative UI spread", () => {
    expect(projectedMarginToUiSpread(7)).toBe(-7);
  });

  it("away favored: negative margin becomes a positive UI spread", () => {
    expect(projectedMarginToUiSpread(-7)).toBe(7);
  });

  it("pick'em: zero margin stays zero", () => {
    expect(projectedMarginToUiSpread(0)).toBe(0);
  });

  it("null margin stays null", () => {
    expect(projectedMarginToUiSpread(null)).toBeNull();
  });
});

function fixtureProjection(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 3,
    homeTeamId: "home",
    awayTeamId: "away",
    expectedHomePoints: 28,
    expectedAwayPoints: 21,
    projectedMargin: 7,
    projectedTotal: 49,
    homeWinProbability: 0.7,
    awayWinProbability: 0.3,
    marginInterval80: [1, 13],
    totalInterval80: [40, 58],
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    scoringVersion: CFB_V2_SCORING_VERSION,
    calibrationVersion: CFB_V2_CALIBRATION_VERSION,
    probabilityVersion: CFB_V2_PROBABILITY_VERSION,
    configVersion: "cfb-v2-config-deadbeef",
    generatedAt: "2026-08-23T00:00:00.000Z",
    dataAsOf: "2026-08-22T23:00:00.000Z",
    ...overrides,
  };
}

describe("toLegacyGameModelProjections — not wired into any production consumer (§17)", () => {
  it("maps margin/total/probabilities and flips the spread sign", () => {
    const legacy = toLegacyGameModelProjections(fixtureProjection());
    expect(legacy.jkbProjectedSpread).toBe(-7);
    expect(legacy.jkbProjectedTotal).toBe(49);
    expect(legacy.homeWinProbability).toBe(0.7);
    expect(legacy.awayWinProbability).toBe(0.3);
  });

  it("keeps fields not present in V2 as null placeholders (existing null placeholders remain null in WU1)", () => {
    const legacy = toLegacyGameModelProjections(fixtureProjection());
    expect(legacy.neutralPowerDifference).toBeNull();
    expect(legacy.homeFieldAdjustment).toBeNull();
    expect(legacy.jkbPowerLine).toBeNull();
  });

  it("propagates a null projection as a fully-null legacy shape where applicable", () => {
    const legacy = toLegacyGameModelProjections(
      fixtureProjection({ projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null }),
    );
    expect(legacy.jkbProjectedSpread).toBeNull();
    expect(legacy.jkbProjectedTotal).toBeNull();
    expect(legacy.homeWinProbability).toBeNull();
    expect(legacy.awayWinProbability).toBeNull();
  });
});
