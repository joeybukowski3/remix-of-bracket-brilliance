import { describe, expect, it } from "vitest";
import type { TopKPickRecord } from "@/types/mlbTopKPerformance";
import { buildTopKSummaryMetrics, filterTopKRecords, isTopKCategoryAvailable, TOP_K_CATEGORIES } from "./topKTracker";

const TODAY = "2026-08-28";

function record(overrides: Partial<TopKPickRecord> = {}): TopKPickRecord {
  return {
    trackingModelVersion: "top-k-tracking-v1",
    date: "2026-08-27",
    persistedAt: "2026-08-27T00:00:00Z",
    pitcherId: 1,
    pitcherName: "Test Pitcher",
    team: "NYY",
    opponent: "BOS",
    gameId: 100,
    gameKey: "BOS@NYY",
    side: "over",
    slot: 1,
    line: 5.5,
    odds: "-120",
    oddsBook: "book",
    projectedKs: 6.5,
    projectionEdge: 1,
    kScore: 55,
    valueScore: 60,
    projectedIP: 5.5,
    workloadConfidenceGrade: "A",
    modelVersion: "mlb-k-projection-v2-shadow",
    resultStatus: "final",
    actualStrikeOuts: 7,
    actualInningsPitched: "6.0",
    battersFaced: 24,
    result: "WIN",
    gradedAt: "2026-08-27T00:00:00Z",
    ...overrides,
  };
}

describe("Top K Phase 1 rank-bucket safety", () => {
  it("only the 'all' category is marked available -- rank buckets are not", () => {
    expect(isTopKCategoryAvailable("all")).toBe(true);
    expect(isTopKCategoryAvailable("top5")).toBe(false);
    expect(isTopKCategoryAvailable("sixTo10")).toBe(false);
    expect(isTopKCategoryAvailable("elevenPlus")).toBe(false);
  });

  it("declares exactly the four categories the eventual UI needs, none silently added", () => {
    expect(TOP_K_CATEGORIES.map((c) => c.id)).toEqual(["all", "top5", "sixTo10", "elevenPlus"]);
  });
});

describe("filterTopKRecords", () => {
  it("filters by window only -- no rank dimension exists in Phase 1", () => {
    const inWindow = record({ date: "2026-08-27" });
    const outOfWindow = record({ date: "2026-01-01" });
    expect(filterTopKRecords([inWindow, outOfWindow], { window: "last30", referenceDate: TODAY })).toEqual([inWindow]);
  });
});

describe("buildTopKSummaryMetrics", () => {
  it("computes win rate only over decided (WIN/LOSS) picks, excluding pushes", () => {
    const filtered = [record({ result: "WIN" }), record({ result: "LOSS" }), record({ result: "PUSH" }), record({ result: null, resultStatus: "pending" })];
    const metrics = buildTopKSummaryMetrics(filtered);
    expect(metrics.find((m) => m.label === "Picks")?.value).toBe("4");
    expect(metrics.find((m) => m.label === "Wins")?.value).toBe("1");
    expect(metrics.find((m) => m.label === "Losses")?.value).toBe("1");
    expect(metrics.find((m) => m.label === "Win Rate")?.value).toBe("50%");
  });
});
