import { describe, expect, it } from "vitest";
import { auditExtremeScores, computeResidualDiagnostics } from "./residualDiagnostics";
import type { ScorePrediction } from "./types";

function prediction(overrides: Partial<ScorePrediction> = {}): ScorePrediction {
  return {
    gameId: "g1", season: 2020, week: 3, homeTeamExternalId: "A", awayTeamExternalId: "B",
    expectedHomePoints: 28, expectedAwayPoints: 21, projectedMargin: 7, projectedTotal: 49,
    actualHomePoints: 28, actualAwayPoints: 21, actualMargin: 7, actualTotal: 49,
    matchupPopulation: "fbs_vs_fbs",
    ...overrides,
  };
}

describe("computeResidualDiagnostics", () => {
  it("residual mean/SD are zero for perfect predictions", () => {
    const result = computeResidualDiagnostics([prediction(), prediction({ gameId: "g2" })]);
    expect(result.home.mean).toBe(0);
    expect(result.home.sd).toBe(0);
  });

  it("computes a nonzero mean residual for systematically biased predictions", () => {
    const result = computeResidualDiagnostics([
      prediction({ expectedHomePoints: 35, actualHomePoints: 28 }),
      prediction({ gameId: "g2", expectedHomePoints: 30, actualHomePoints: 23 }),
    ]);
    expect(result.home.mean).toBeCloseTo(7, 5);
  });

  it("excludes rows with missing predictions", () => {
    const result = computeResidualDiagnostics([prediction({ expectedHomePoints: null }), prediction({ gameId: "g2" })]);
    expect(result.home.n).toBe(1);
  });

  it("returns null-safe stats for an empty input", () => {
    const result = computeResidualDiagnostics([]);
    expect(result.home.n).toBe(0);
    expect(result.home.mean).toBeNull();
  });
});

describe("auditExtremeScores", () => {
  it("flags a negative expected score", () => {
    const result = auditExtremeScores([prediction({ expectedAwayPoints: -3 })]);
    expect(result.negativeAwayScore).toBe(1);
  });

  it("flags implausibly high totals", () => {
    const result = auditExtremeScores([prediction({ expectedHomePoints: 90, expectedAwayPoints: 60, projectedTotal: 150 })]);
    expect(result.implausiblyHighTotal).toBe(1);
  });

  it("reports zero flags for plausible predictions", () => {
    const result = auditExtremeScores([prediction()]);
    expect(result.negativeHomeScore).toBe(0);
    expect(result.extremeMargin).toBe(0);
  });
});
