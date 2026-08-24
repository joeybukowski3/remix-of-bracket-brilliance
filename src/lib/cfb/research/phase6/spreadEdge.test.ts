import { describe, expect, it } from "vitest";
import { computeSpreadEdgeRows } from "./spreadEdge";
import type { MarketModelJoinRow } from "./types";

function row(overrides: Partial<MarketModelJoinRow>): MarketModelJoinRow {
  return {
    gameId: "g1", season: 2020, week: 1, provider: "Bovada",
    homeTeamExternalId: "A", awayTeamExternalId: "B",
    modelExpectedHome: 28, modelExpectedAway: 21, modelProjectedMargin: 7, modelProjectedTotal: 49, modelPHomeWin: 0.65,
    homeResidualPool: Array.from({ length: 50 }, (_, i) => (i % 10) - 5),
    awayResidualPool: Array.from({ length: 50 }, (_, i) => (i % 8) - 4),
    actualHomePoints: 28, actualAwayPoints: 21, actualMargin: 7, actualTotal: 49,
    spreadOpen: null, spreadLatestObserved: -3, totalOpen: null, totalLatestObserved: null,
    homeMoneyline: null, awayMoneyline: null,
    ...overrides,
  };
}

describe("computeSpreadEdgeRows", () => {
  it("marketImpliedHomeMargin is the negation of the market spread", () => {
    const [result] = computeSpreadEdgeRows([row({ spreadLatestObserved: -7 })], "LATEST_OBSERVED");
    expect(result.marketImpliedHomeMargin).toBe(7);
  });

  it("homeSpreadEdgePoints = modelProjectedMargin - marketImpliedHomeMargin", () => {
    const [result] = computeSpreadEdgeRows([row({ modelProjectedMargin: 10, spreadLatestObserved: -3 })], "LATEST_OBSERVED");
    // marketImpliedHomeMargin = 3; edge = 10 - 3 = 7
    expect(result.homeSpreadEdgePoints).toBeCloseTo(7, 10);
  });

  it("skips rows with a null value for the requested semantic rather than fabricating one", () => {
    const rows = computeSpreadEdgeRows([row({ spreadOpen: null, spreadLatestObserved: -3 })], "OPEN");
    expect(rows).toHaveLength(0);
  });

  it("cover probabilities sum to <= 1 and are within [0,1]", () => {
    const [result] = computeSpreadEdgeRows([row({})], "LATEST_OBSERVED");
    expect(result.pHomeCover).toBeGreaterThanOrEqual(0);
    expect(result.pHomeCover).toBeLessThanOrEqual(1);
    expect(result.pHomeCover + result.pAwayCover).toBeLessThanOrEqual(1.0001);
  });

  it("homeCovered reflects the actual result against the market number, not the model", () => {
    // home favored by 3 (spread -3), home wins by 10 -> covered
    const [covered] = computeSpreadEdgeRows([row({ spreadLatestObserved: -3, actualMargin: 10 })], "LATEST_OBSERVED");
    expect(covered.homeCovered).toBe(true);
    // home favored by 3, home wins by only 1 -> did not cover
    const [notCovered] = computeSpreadEdgeRows([row({ spreadLatestObserved: -3, actualMargin: 1 })], "LATEST_OBSERVED");
    expect(notCovered.homeCovered).toBe(false);
    // exact push
    const [push] = computeSpreadEdgeRows([row({ spreadLatestObserved: -3, actualMargin: 3 })], "LATEST_OBSERVED");
    expect(push.homeCovered).toBeNull();
  });

  it("produces no NaN/Infinity", () => {
    const rows = computeSpreadEdgeRows([row({})], "LATEST_OBSERVED");
    for (const r of rows) {
      expect(Number.isFinite(r.homeSpreadEdgePoints)).toBe(true);
      expect(Number.isFinite(r.pHomeCover)).toBe(true);
    }
  });
});
