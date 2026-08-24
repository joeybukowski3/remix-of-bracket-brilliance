import { describe, expect, it } from "vitest";
import { diffCfbV2Shadow, diffCfbV2ShadowProjections, diffCfbV2ShadowRatings } from "./shadowDiff";
import { CFB_V2_IPR_MODEL_VERSION, CFB_V2_VERSIONS } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2GameProjection, CfbV2TeamRating } from "./types";

function rating(overrides: Partial<CfbV2TeamRating> = {}): CfbV2TeamRating {
  return {
    teamId: "alpha",
    season: 2026,
    asOfWeek: 2,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.1,
    defenseRating: 0.2,
    overallRating: 0.15,
    preseasonPriorOffense: 0.1,
    preseasonPriorDefense: 0.2,
    priorTier: "PRIOR_A",
    gamesPlayed: 1,
    classification: "fbs",
    connectivity: { componentSize: 2, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function projection(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 2,
    homeTeamId: "alpha",
    awayTeamId: "beta",
    expectedHomePoints: 28,
    expectedAwayPoints: 21,
    projectedMargin: 7,
    projectedTotal: 49,
    homeWinProbability: 0.65,
    awayWinProbability: 0.35,
    marginInterval50: [2, 12],
    marginInterval80: [-3, 17],
    marginInterval90: [-8, 22],
    marginInterval95: [-12, 26],
    totalInterval50: [42, 56],
    totalInterval80: [36, 62],
    totalInterval90: [30, 68],
    totalInterval95: [26, 72],
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
    modelVersion: CFB_V2_VERSIONS.ipr,
    scoringVersion: CFB_V2_VERSIONS.scoring,
    calibrationVersion: CFB_V2_VERSIONS.calibration,
    probabilityVersion: CFB_V2_VERSIONS.probability,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("diffCfbV2ShadowRatings", () => {
  it("computes per-team delta, median absolute movement, and largest movers", () => {
    const before = [rating({ teamId: "a", overallRating: 0.1 }), rating({ teamId: "b", overallRating: 0.5 })];
    const after = [rating({ teamId: "a", overallRating: 0.3 }), rating({ teamId: "b", overallRating: 0.5 })];
    const diff = diffCfbV2ShadowRatings(before, after);
    expect(diff.comparedTeamCount).toBe(2);
    expect(diff.largestMovers[0].teamId).toBe("a");
    expect(diff.largestMovers[0].absoluteDelta).toBeCloseTo(0.2, 8);
    expect(diff.medianAbsoluteMovement).toBeCloseTo(0.1, 8); // median of [0.2, 0]
  });

  it("flags prior-tier transitions and component-size changes", () => {
    const before = [rating({ teamId: "a", priorTier: "PRIOR_A", connectivity: { componentSize: 1, regularizationMultiplier: 3 } })];
    const after = [rating({ teamId: "a", priorTier: "PRIOR_D", connectivity: { componentSize: 40, regularizationMultiplier: 1.2 } })];
    const diff = diffCfbV2ShadowRatings(before, after);
    expect(diff.priorTierTransitions).toEqual([{ teamId: "a", from: "PRIOR_A", to: "PRIOR_D" }]);
    expect(diff.componentSizeChanges).toEqual([{ teamId: "a", from: 1, to: 40 }]);
  });

  it("reports teams only present in one snapshot, without crashing", () => {
    const before = [rating({ teamId: "a" }), rating({ teamId: "leaving" })];
    const after = [rating({ teamId: "a" }), rating({ teamId: "arriving" })];
    const diff = diffCfbV2ShadowRatings(before, after);
    expect(diff.onlyInBefore).toEqual(["leaving"]);
    expect(diff.onlyInAfter).toEqual(["arriving"]);
    expect(diff.comparedTeamCount).toBe(1);
  });
});

describe("diffCfbV2ShadowProjections", () => {
  it("computes margin/total/probability deltas for games present in both snapshots", () => {
    const before = [projection({ gameId: "g1", projectedMargin: 3, projectedTotal: 45, homeWinProbability: 0.55, awayWinProbability: 0.45 })];
    const after = [projection({ gameId: "g1", projectedMargin: 10, projectedTotal: 50, homeWinProbability: 0.7, awayWinProbability: 0.3 })];
    const diff = diffCfbV2ShadowProjections(before, after);
    expect(diff.comparedGameCount).toBe(1);
    expect(diff.largestMarginMovers[0].marginDelta).toBeCloseTo(7, 8);
    expect(diff.largestMarginMovers[0].totalDelta).toBeCloseTo(5, 8);
    expect(diff.largestMarginMovers[0].homeWinProbabilityDelta).toBeCloseTo(0.15, 8);
  });

  it("flags availability transitions (unavailable -> computed and vice versa)", () => {
    const before = [projection({ gameId: "g1", projectionStatus: "unavailable", expectedHomePoints: null, expectedAwayPoints: null, projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null, marginInterval50: null, marginInterval80: null, marginInterval90: null, marginInterval95: null, totalInterval50: null, totalInterval80: null, totalInterval90: null, totalInterval95: null })];
    const after = [projection({ gameId: "g1", projectionStatus: "computed" })];
    const diff = diffCfbV2ShadowProjections(before, after);
    expect(diff.availabilityTransitions).toEqual([{ gameId: "g1", from: "unavailable", to: "computed" }]);
    // No margin delta computable since "before" had null margin.
    expect(diff.largestMarginMovers).toEqual([]);
  });

  it("handles games only present in one snapshot", () => {
    const before = [projection({ gameId: "g1" }), projection({ gameId: "played-last-week" })];
    const after = [projection({ gameId: "g1" }), projection({ gameId: "new-this-week" })];
    const diff = diffCfbV2ShadowProjections(before, after);
    expect(diff.onlyInBefore).toEqual(["played-last-week"]);
    expect(diff.onlyInAfter).toEqual(["new-this-week"]);
  });
});

describe("diffCfbV2Shadow — determinism", () => {
  it("identical inputs produce byte-identical output", () => {
    const before = { ratings: [rating({ teamId: "a" })], projections: [projection({ gameId: "g1" })] };
    const after = { ratings: [rating({ teamId: "a", overallRating: 0.4 })], projections: [projection({ gameId: "g1", projectedMargin: 12 })] };
    const first = diffCfbV2Shadow(before, after);
    const second = diffCfbV2Shadow(before, after);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
