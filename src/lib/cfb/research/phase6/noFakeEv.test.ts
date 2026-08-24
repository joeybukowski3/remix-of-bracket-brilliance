import { describe, expect, it } from "vitest";
import { computeSpreadEdgeRows } from "./spreadEdge";
import { computeTotalEdgeRows } from "./totalEdge";
import type { MarketModelJoinRow } from "./types";

function row(overrides: Partial<MarketModelJoinRow>): MarketModelJoinRow {
  return {
    gameId: "g1", season: 2020, week: 1, provider: "Bovada",
    homeTeamExternalId: "A", awayTeamExternalId: "B",
    modelExpectedHome: 28, modelExpectedAway: 21, modelProjectedMargin: 7, modelProjectedTotal: 49, modelPHomeWin: 0.65,
    homeResidualPool: [1, -1, 2, -2], awayResidualPool: [1, -1, 1, -1],
    actualHomePoints: 28, actualAwayPoints: 21, actualMargin: 7, actualTotal: 49,
    spreadOpen: -3, spreadLatestObserved: -3, totalOpen: 50, totalLatestObserved: 50,
    homeMoneyline: null, awayMoneyline: null,
    ...overrides,
  };
}

/**
 * Section 3/16/17: CFBD spread/total rows have no validated price, so no
 * EV/ROI concept is valid for them. This test guards against a future
 * edit accidentally adding an "ev"/"roi" field to spread or total edge
 * rows — only MoneylineEdgeRow (which has real prices) may carry EV.
 */
describe("spread/total edge rows never carry an EV or ROI field", () => {
  it("SpreadEdgeRow has no ev/roi key", () => {
    const [result] = computeSpreadEdgeRows([row({})], "LATEST_OBSERVED");
    expect(Object.keys(result)).not.toContain("ev");
    expect(Object.keys(result)).not.toContain("roi");
    expect(Object.keys(result).join(",")).not.toMatch(/ev|roi/i);
  });

  it("TotalEdgeRow has no ev/roi key", () => {
    const [result] = computeTotalEdgeRows([row({})], "LATEST_OBSERVED");
    expect(Object.keys(result)).not.toContain("ev");
    expect(Object.keys(result)).not.toContain("roi");
    expect(Object.keys(result).join(",")).not.toMatch(/ev|roi/i);
  });
});
