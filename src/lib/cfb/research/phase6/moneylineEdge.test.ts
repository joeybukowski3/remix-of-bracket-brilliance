import { describe, expect, it } from "vitest";
import { computeMoneylineEdgeRows } from "./moneylineEdge";
import { computeMoneylineRoi } from "./roiAnalysis";
import type { MarketModelJoinRow } from "./types";

function row(overrides: Partial<MarketModelJoinRow>): MarketModelJoinRow {
  return {
    gameId: "g1", season: 2020, week: 1, provider: "Bovada",
    homeTeamExternalId: "A", awayTeamExternalId: "B",
    modelExpectedHome: 28, modelExpectedAway: 21, modelProjectedMargin: 7, modelProjectedTotal: 49, modelPHomeWin: 0.65,
    homeResidualPool: [], awayResidualPool: [],
    actualHomePoints: 28, actualAwayPoints: 21, actualMargin: 7, actualTotal: 49,
    spreadOpen: null, spreadLatestObserved: null, totalOpen: null, totalLatestObserved: null,
    homeMoneyline: -150, awayMoneyline: 130,
    ...overrides,
  };
}

describe("computeMoneylineEdgeRows", () => {
  it("skips rows missing either moneyline", () => {
    expect(computeMoneylineEdgeRows([row({ homeMoneyline: null })])).toHaveLength(0);
  });

  it("de-vigged probabilities sum to 1", () => {
    const [result] = computeMoneylineEdgeRows([row({})]);
    expect(result.homeImpliedProbFair + result.awayImpliedProbFair).toBeCloseTo(1, 10);
  });

  it("homeProbabilityEdge = modelPHomeWin - homeImpliedProbFair", () => {
    const [result] = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.7 })]);
    expect(result.homeProbabilityEdge).toBeCloseTo(0.7 - result.homeImpliedProbFair, 10);
  });

  it("EV is finite and consistent with the standard formula", () => {
    const [result] = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.7, homeMoneyline: -150 })]);
    // decimal odds for -150 = 1 + 100/150 = 1.6667; EV = 0.7*1.6667 - 1
    expect(result.homeEv).toBeCloseTo(0.7 * (1 + 100 / 150) - 1, 5);
  });
});

describe("computeMoneylineRoi", () => {
  it("uses a fixed 1-unit stake — units won on a win at -150 is 2/3, lost is -1", () => {
    const rows = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.8, homeMoneyline: -150, homeWon: true })]);
    const result = computeMoneylineRoi(rows, 0.02);
    expect(result.bets).toBe(1);
    expect(result.units).toBeCloseTo(100 / 150, 5);
  });

  it("reports null ROI when no qualifying bets exist", () => {
    const rows = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.51 })]); // near break-even, unlikely to clear a real threshold
    const result = computeMoneylineRoi(rows, 0.5); // deliberately impossible threshold
    expect(result.bets).toBe(0);
    expect(result.roi).toBeNull();
  });

  it("never uses variable stake sizing — units per bet magnitude is bounded by decimal odds only, not by edge size", () => {
    const bigEdgeRows = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.95, homeMoneyline: -150, homeWon: true })]);
    const smallEdgeRows = computeMoneylineEdgeRows([row({ modelPHomeWin: 0.75, homeMoneyline: -150, homeWon: true })]);
    const bigResult = computeMoneylineRoi(bigEdgeRows, 0.02);
    const smallResult = computeMoneylineRoi(smallEdgeRows, 0.02);
    expect(bigResult.units).toBeCloseTo(smallResult.units, 10); // same odds, same stake -> same units won regardless of edge size
  });
});
