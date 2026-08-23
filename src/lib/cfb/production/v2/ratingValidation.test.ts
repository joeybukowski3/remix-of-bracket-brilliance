import { describe, expect, it } from "vitest";
import { validateCfbV2TeamRatings, CfbV2RatingValidationError } from "./ratingValidation";
import { CFB_V2_IPR_MODEL_VERSION } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2TeamRating } from "./types";

function fixture(overrides: Partial<CfbV2TeamRating> = {}): CfbV2TeamRating {
  return {
    teamId: "alpha",
    season: 2026,
    asOfWeek: 1,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.2,
    defenseRating: 0.1,
    overallRating: 0.15,
    preseasonPriorOffense: 0.2,
    preseasonPriorDefense: 0.1,
    priorTier: "PRIOR_D",
    gamesPlayed: 0,
    classification: "fbs",
    connectivity: { componentSize: 1, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateCfbV2TeamRatings", () => {
  it("passes for a valid single-team ratings array", () => {
    expect(() => validateCfbV2TeamRatings([fixture()], new Set(["alpha"]))).not.toThrow();
  });

  it("throws on an empty ratings array", () => {
    expect(() => validateCfbV2TeamRatings([], new Set())).toThrow(CfbV2RatingValidationError);
  });

  it("throws on a duplicate teamId", () => {
    expect(() => validateCfbV2TeamRatings([fixture(), fixture()], new Set(["alpha"]))).toThrow(/duplicate/);
  });

  it("throws on a non-finite offenseRating", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ offenseRating: NaN })], new Set(["alpha"]))).toThrow(/offenseRating/);
  });

  it("throws on an Infinity defenseRating", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ defenseRating: Infinity })], new Set(["alpha"]))).toThrow(/defenseRating/);
  });

  it("throws on componentSize below 1", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ connectivity: { componentSize: 0, regularizationMultiplier: 3 } })], new Set(["alpha"]))).toThrow(/componentSize/);
  });

  it("throws on a regularizationMultiplier outside [1, cap]", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ connectivity: { componentSize: 5, regularizationMultiplier: 0.5 } })], new Set(["alpha"]))).toThrow(/regularizationMultiplier/);
    expect(() => validateCfbV2TeamRatings([fixture({ connectivity: { componentSize: 5, regularizationMultiplier: 3.5 } })], new Set(["alpha"]))).toThrow(/regularizationMultiplier/);
  });

  it("throws on negative gamesPlayed", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ gamesPlayed: -1 })], new Set(["alpha"]))).toThrow(/gamesPlayed/);
  });

  it("throws when provenance fields are missing", () => {
    expect(() => validateCfbV2TeamRatings([fixture({ configVersion: "" })], new Set(["alpha"]))).toThrow(/provenance/);
  });

  it("throws when dataAsOf is after generatedAt (stale-fetch detector)", () => {
    expect(() =>
      validateCfbV2TeamRatings([fixture({ dataAsOf: "2026-08-21T00:00:00.000Z", generatedAt: "2026-08-20T00:00:00.000Z" })], new Set(["alpha"])),
    ).toThrow(/dataAsOf/);
  });

  it("throws when an expected FBS team is missing from the output (unresolved team)", () => {
    expect(() => validateCfbV2TeamRatings([fixture()], new Set(["alpha", "bravo"]))).toThrow(/unresolved\/missing/);
  });
});
