import { describe, expect, it } from "vitest";
import { buildExtremeDisagreementValidation } from "./extremeDisagreementValidation";
import type { MarketModelJoinRow } from "../phase6/types";

function row(overrides: Partial<MarketModelJoinRow>): MarketModelJoinRow {
  return {
    gameId: "g",
    season: 2022,
    week: 5,
    provider: "consensus",
    homeTeamExternalId: "A",
    awayTeamExternalId: "B",
    modelExpectedHome: 30,
    modelExpectedAway: 20,
    modelProjectedMargin: 10,
    modelProjectedTotal: 50,
    modelPHomeWin: 0.7,
    homeResidualPool: [],
    awayResidualPool: [],
    actualHomePoints: 28,
    actualAwayPoints: 24,
    actualMargin: 4,
    actualTotal: 52,
    spreadOpen: null,
    spreadLatestObserved: -3, // marketMargin = 3
    totalOpen: null,
    totalLatestObserved: null,
    homeMoneyline: null,
    awayMoneyline: null,
    ...overrides,
  };
}

describe("buildExtremeDisagreementValidation", () => {
  it("reports null (never fabricated) for a bin below MIN_BUCKET_SAMPLE_SIZE", () => {
    const rows = [row({ gameId: "g1", modelProjectedMargin: 20, spreadLatestObserved: 0 })]; // disagreement = 20, but n=1
    const result = buildExtremeDisagreementValidation(rows);
    const bin7 = result.find((r) => r.binLabel === ">=7")!;
    expect(bin7.n).toBe(1);
    expect(bin7.modelCloserRate).toBeNull();
  });

  it("correctly classifies model-closer vs market-closer once sample size is met", () => {
    // model=20 (implied market from spread=0 -> marketMargin=0), actual=4: modelError=16, marketError=4 -> market closer.
    const rows = Array.from({ length: 25 }, (_, i) => row({ gameId: `g${i}`, modelProjectedMargin: 20, spreadLatestObserved: 0, actualMargin: 4 }));
    const result = buildExtremeDisagreementValidation(rows);
    const bin7 = result.find((r) => r.binLabel === ">=7")!;
    expect(bin7.n).toBe(25);
    expect(bin7.marketCloserRate).toBe(1);
    expect(bin7.modelCloserRate).toBe(0);
  });

  it("excludes rows with no latestObserved spread", () => {
    const rows = [row({ spreadLatestObserved: null })];
    const result = buildExtremeDisagreementValidation(rows);
    expect(result.every((r) => r.n === 0)).toBe(true);
  });
});
