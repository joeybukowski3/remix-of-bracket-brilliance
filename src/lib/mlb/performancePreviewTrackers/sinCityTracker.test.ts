import { describe, expect, it } from "vitest";
import type { SinCityPickRecord } from "@/types/mlbSinCity";
import { buildSinCitySummaryMetrics, filterSinCityRecords } from "./sinCityTracker";

const TODAY = "2026-08-28";

function record(overrides: Partial<SinCityPickRecord> = {}): SinCityPickRecord {
  return {
    trackingModelVersion: "sin-city-tracking-v1",
    date: "2026-08-27",
    persistedAt: "2026-08-27T00:00:00Z",
    playerId: 1,
    playerName: "Test Hitter",
    team: "BAL",
    teamId: 1,
    opponent: "STL",
    opponentId: 2,
    gameId: 100,
    qualificationLevel: "5/5",
    matchCount: 5,
    factors: [],
    hrOddsYes: "+400",
    hrOddsBook: "book",
    resultStatus: "hit",
    battingLine: { atBats: 4, hits: 1, doubles: 0, homeRuns: 1, totalBases: 4, rbi: 1, runs: 1, baseOnBalls: 0, strikeOuts: 0 },
    gradedAt: "2026-08-27T00:00:00Z",
    ...overrides,
  };
}

describe("filterSinCityRecords -- mutual exclusivity", () => {
  it("5/5 records never leak into the 4/5 category filter", () => {
    const fiveOfFive = record({ qualificationLevel: "5/5" });
    expect(filterSinCityRecords([fiveOfFive], { window: "last30", category: "fourOfFive", referenceDate: TODAY })).toEqual([]);
    expect(filterSinCityRecords([fiveOfFive], { window: "last30", category: "fiveOfFive", referenceDate: TODAY })).toEqual([fiveOfFive]);
  });

  it("4/5 records never leak into the 5/5 category filter", () => {
    const fourOfFive = record({ qualificationLevel: "4/5" });
    expect(filterSinCityRecords([fourOfFive], { window: "last30", category: "fiveOfFive", referenceDate: TODAY })).toEqual([]);
    expect(filterSinCityRecords([fourOfFive], { window: "last30", category: "fourOfFive", referenceDate: TODAY })).toEqual([fourOfFive]);
  });

  it("excludes records outside the selected window", () => {
    const old = record({ date: "2026-01-01" });
    expect(filterSinCityRecords([old], { window: "last30", category: "fiveOfFive", referenceDate: TODAY })).toEqual([]);
  });
});

describe("buildSinCitySummaryMetrics", () => {
  it("computes hit rate only over graded (hit/miss) records", () => {
    const filtered = [record({ resultStatus: "hit" }), record({ resultStatus: "miss" }), record({ resultStatus: "pending" })];
    const metrics = buildSinCitySummaryMetrics(filtered);
    expect(metrics.find((m) => m.label === "Qualified")?.value).toBe("3");
    expect(metrics.find((m) => m.label === "Graded")?.value).toBe("2");
    expect(metrics.find((m) => m.label === "HR Rate")?.value).toBe("50%");
  });
});
