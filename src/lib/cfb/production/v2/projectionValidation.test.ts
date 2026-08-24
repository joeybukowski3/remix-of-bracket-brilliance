import { describe, expect, it } from "vitest";
import { validateCfbV2GameProjection, validateCfbV2GameProjections, CfbV2ProjectionValidationError } from "./projectionValidation";
import { CFB_V2_IPR_MODEL_VERSION, CFB_V2_CALIBRATION_VERSION, CFB_V2_PROBABILITY_VERSION, CFB_V2_SCORING_VERSION } from "./versions";
import type { CfbV2GameProjection } from "./types";

function computedRow(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 5,
    homeTeamId: "home",
    awayTeamId: "away",
    expectedHomePoints: 28,
    expectedAwayPoints: 21,
    projectedMargin: 7,
    projectedTotal: 49,
    homeWinProbability: 0.7,
    awayWinProbability: 0.3,
    marginInterval50: [4, 10],
    marginInterval80: [1, 13],
    marginInterval90: [-2, 16],
    marginInterval95: [-5, 19],
    totalInterval50: [46, 52],
    totalInterval80: [40, 58],
    totalInterval90: [37, 61],
    totalInterval95: [34, 64],
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    scoringVersion: CFB_V2_SCORING_VERSION,
    calibrationVersion: CFB_V2_CALIBRATION_VERSION,
    probabilityVersion: CFB_V2_PROBABILITY_VERSION,
    configVersion: "cfb-v2-config-test",
    generatedAt: new Date().toISOString(),
    dataAsOf: new Date().toISOString(),
    ...overrides,
  };
}

function unavailableRow(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return computedRow({
    expectedHomePoints: null,
    expectedAwayPoints: null,
    projectedMargin: null,
    projectedTotal: null,
    homeWinProbability: null,
    awayWinProbability: null,
    marginInterval50: null,
    marginInterval80: null,
    marginInterval90: null,
    marginInterval95: null,
    totalInterval50: null,
    totalInterval80: null,
    totalInterval90: null,
    totalInterval95: null,
    projectionStatus: "unavailable",
    ...overrides,
  });
}

describe("validateCfbV2GameProjection", () => {
  it("accepts a well-formed computed row", () => {
    expect(() => validateCfbV2GameProjection(computedRow())).not.toThrow();
  });

  it("accepts a well-formed unavailable row", () => {
    expect(() => validateCfbV2GameProjection(unavailableRow())).not.toThrow();
  });

  it("rejects a computed row with a broken margin identity", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ projectedMargin: 999 }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects a computed row with a broken total identity", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ projectedTotal: 999 }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects win probabilities that don't sum to 1", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ awayWinProbability: 0.1 }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects a probability outside [0, 1]", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ homeWinProbability: 1.2, awayWinProbability: -0.2 }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects a NaN expected-points value", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ expectedHomePoints: NaN, projectedMargin: NaN, projectedTotal: NaN }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects an out-of-order interval", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ marginInterval80: [13, 1] }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects a computed row missing an interval", () => {
    expect(() => validateCfbV2GameProjection(computedRow({ totalInterval95: null }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects an unsupported matchup labeled anything but unavailable", () => {
    expect(() => validateCfbV2GameProjection(unavailableRow({ matchupPopulation: "fbs_vs_fcs", projectionStatus: "computed" }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects an unsupported matchup carrying a fabricated value", () => {
    expect(() => validateCfbV2GameProjection(unavailableRow({ matchupPopulation: "unsupported", expectedHomePoints: 20 }))).toThrow(CfbV2ProjectionValidationError);
  });

  it("rejects an unavailable row that still carries expected points", () => {
    expect(() => validateCfbV2GameProjection(unavailableRow({ expectedHomePoints: 20 }))).toThrow(CfbV2ProjectionValidationError);
  });
});

describe("validateCfbV2GameProjections", () => {
  it("rejects a duplicate gameId across the artifact", () => {
    expect(() => validateCfbV2GameProjections([computedRow(), computedRow()])).toThrow(CfbV2ProjectionValidationError);
  });

  it("accepts a well-formed mixed batch", () => {
    expect(() => validateCfbV2GameProjections([computedRow({ gameId: "g1" }), unavailableRow({ gameId: "g2" })])).not.toThrow();
  });
});
