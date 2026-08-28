import { describe, expect, it } from "vitest";
import type { NumerologyPerformanceRecord } from "@/types/mlbNumerologyPerformance";
import { buildNumerologySummaryMetrics, filterNumerologyRecords, matchesNumerologyCategory } from "./numerologyTracker";

const TODAY = "2026-08-28";

function record(overrides: Partial<NumerologyPerformanceRecord> = {}): NumerologyPerformanceRecord {
  return {
    id: "over-50|2026-08-27|1|100",
    date: "2026-08-27",
    generatedAt: "2026-08-27T00:00:00Z",
    modelVersion: "mlb-numerology-live-board-v0.2",
    selectionType: "over-50",
    isTopPlay: false,
    qualifiesOver50: true,
    player: "Test Player",
    playerId: 1,
    team: "NYY",
    opponent: "BOS",
    gameId: 100,
    numerologyScore: 65,
    hrScoreRank: 3,
    hrOddsYes: "+280",
    hrOddsBook: "book",
    numerologySignals: [],
    resultStatus: "final",
    hitHomeRun: false,
    stats: { atBats: 4, hits: 1, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 2, totalBases: 1, homeRuns: 0, stolenBases: 0 },
    finalizedAt: "2026-08-28T00:00:00Z",
    source: "mlb-statsapi",
    ...overrides,
  };
}

describe("matchesNumerologyCategory -- top-play population", () => {
  it("topPlay category matches only selectionType top-play, regardless of score", () => {
    const topPlay = record({ selectionType: "top-play", numerologyScore: 49 });
    const over50 = record({ selectionType: "over-50", numerologyScore: 90 });
    expect(matchesNumerologyCategory(topPlay, "topPlay")).toBe(true);
    expect(matchesNumerologyCategory(over50, "topPlay")).toBe(false);
  });
});

describe("matchesNumerologyCategory -- cumulative score bands", () => {
  it("59.9 is excluded from 60+", () => {
    expect(matchesNumerologyCategory(record({ numerologyScore: 59.9 }), "60plus")).toBe(false);
  });

  it("60 qualifies for 60+", () => {
    expect(matchesNumerologyCategory(record({ numerologyScore: 60 }), "60plus")).toBe(true);
  });

  it("69.9 qualifies for 60+ only, not 70+", () => {
    const r = record({ numerologyScore: 69.9 });
    expect(matchesNumerologyCategory(r, "60plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "70plus")).toBe(false);
  });

  it("70 qualifies for both 60+ and 70+", () => {
    const r = record({ numerologyScore: 70 });
    expect(matchesNumerologyCategory(r, "60plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "70plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "80plus")).toBe(false);
  });

  it("79.9 qualifies for 60+ and 70+, not 80+", () => {
    const r = record({ numerologyScore: 79.9 });
    expect(matchesNumerologyCategory(r, "60plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "70plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "80plus")).toBe(false);
  });

  it("80 qualifies for 60+, 70+, and 80+", () => {
    const r = record({ numerologyScore: 80 });
    expect(matchesNumerologyCategory(r, "60plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "70plus")).toBe(true);
    expect(matchesNumerologyCategory(r, "80plus")).toBe(true);
  });

  it("cumulative bands only ever match the over-50 selectionType population", () => {
    const topPlayHighScore = record({ selectionType: "top-play", numerologyScore: 95 });
    expect(matchesNumerologyCategory(topPlayHighScore, "80plus")).toBe(false);
  });
});

describe("filterNumerologyRecords", () => {
  it("excludes non-finalized records", () => {
    const pending = record({ resultStatus: "pending" });
    expect(filterNumerologyRecords([pending], { window: "last30", category: "60plus", referenceDate: TODAY })).toEqual([]);
  });

  it("excludes records outside the window", () => {
    const old = record({ date: "2026-01-01" });
    expect(filterNumerologyRecords([old], { window: "last30", category: "60plus", referenceDate: TODAY })).toEqual([]);
  });

  it("keeps a finalized, in-window, in-category record", () => {
    const r = record({ date: "2026-08-27", numerologyScore: 65 });
    expect(filterNumerologyRecords([r], { window: "last30", category: "60plus", referenceDate: TODAY })).toEqual([r]);
  });
});

describe("buildNumerologySummaryMetrics", () => {
  it("computes HR rate from the exact filtered population", () => {
    const filtered = [record({ hitHomeRun: true }), record({ hitHomeRun: false })];
    const metrics = buildNumerologySummaryMetrics(filtered);
    expect(metrics.find((m) => m.label === "Plays")?.value).toBe("2");
    expect(metrics.find((m) => m.label === "HR Hits")?.value).toBe("1");
    expect(metrics.find((m) => m.label === "HR Rate")?.value).toBe("50%");
  });
});
