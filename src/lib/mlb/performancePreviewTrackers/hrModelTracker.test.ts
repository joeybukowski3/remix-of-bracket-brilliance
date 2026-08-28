import { describe, expect, it } from "vitest";
import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import { buildHrSummaryMetrics, filterHrRecords, matchesHrScoreBand } from "./hrModelTracker";

const TODAY = "2026-08-28";

function record(overrides: Partial<HrPredictionRecord> = {}): HrPredictionRecord {
  return {
    date: "2026-08-27",
    generatedAt: "2026-08-27T00:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    playerId: 1,
    playerName: "Test Hitter",
    teamId: 1,
    team: "NYY",
    opponentId: 2,
    opponent: "BOS",
    opposingPitcherId: null,
    opposingPitcherName: null,
    lineupStatus: "confirmed",
    battingOrder: 3,
    gameId: 100,
    hrQualityScore: 65,
    hrRank: 1,
    hrOddsYes: "+300",
    hrOddsBook: "book",
    marketImpliedProbability: 0.2,
    confidenceLevel: "high",
    result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-08-27T00:00:00Z", resolutionReason: null, attemptCount: 1 },
    ...overrides,
  };
}

describe("matchesHrScoreBand", () => {
  it("80.0 lands in 80+", () => {
    expect(matchesHrScoreBand(80.0, "80plus")).toBe(true);
    expect(matchesHrScoreBand(80.0, "70to79")).toBe(false);
  });

  it("79.9 lands in 70-79, not 80+", () => {
    expect(matchesHrScoreBand(79.9, "70to79")).toBe(true);
    expect(matchesHrScoreBand(79.9, "80plus")).toBe(false);
  });

  it("70.0 lands in 70-79", () => {
    expect(matchesHrScoreBand(70.0, "70to79")).toBe(true);
    expect(matchesHrScoreBand(70.0, "60to69")).toBe(false);
  });

  it("69.9 lands in 60-69", () => {
    expect(matchesHrScoreBand(69.9, "60to69")).toBe(true);
    expect(matchesHrScoreBand(69.9, "70to79")).toBe(false);
  });

  it("60.0 lands in 60-69", () => {
    expect(matchesHrScoreBand(60.0, "60to69")).toBe(true);
    expect(matchesHrScoreBand(60.0, "50to59")).toBe(false);
  });

  it("59.9 lands in 50-59", () => {
    expect(matchesHrScoreBand(59.9, "50to59")).toBe(true);
    expect(matchesHrScoreBand(59.9, "60to69")).toBe(false);
  });

  it("50.0 lands in 50-59", () => {
    expect(matchesHrScoreBand(50.0, "50to59")).toBe(true);
  });

  it("49.9 matches no exposed band", () => {
    expect(matchesHrScoreBand(49.9, "50to59")).toBe(false);
    expect(matchesHrScoreBand(49.9, "60to69")).toBe(false);
    expect(matchesHrScoreBand(49.9, "70to79")).toBe(false);
    expect(matchesHrScoreBand(49.9, "80plus")).toBe(false);
  });

  it("null score matches nothing", () => {
    expect(matchesHrScoreBand(null, "50to59")).toBe(false);
  });
});

describe("filterHrRecords", () => {
  it("excludes ungraded (pending) records regardless of band/window", () => {
    const pending = record({ result: { ...record().result, status: "pending" } });
    expect(filterHrRecords([pending], { window: "last30", band: "60to69", referenceDate: TODAY })).toEqual([]);
  });

  it("excludes records outside the selected window even if the band matches", () => {
    const old = record({ date: "2026-01-01", hrQualityScore: 65 });
    expect(filterHrRecords([old], { window: "last30", band: "60to69", referenceDate: TODAY })).toEqual([]);
  });

  it("excludes records outside the selected band even if the window matches", () => {
    const wrongBand = record({ date: "2026-08-27", hrQualityScore: 45 });
    expect(filterHrRecords([wrongBand], { window: "last30", band: "60to69", referenceDate: TODAY })).toEqual([]);
  });

  it("keeps a record that is graded, in-window, and in-band", () => {
    const match = record({ date: "2026-08-27", hrQualityScore: 65 });
    expect(filterHrRecords([match], { window: "last30", band: "60to69", referenceDate: TODAY })).toEqual([match]);
  });
});

describe("buildHrSummaryMetrics", () => {
  it("derives plays/hits/rate from the exact filtered population passed in (no all-time leakage)", () => {
    const filtered = [
      record({ result: { ...record().result, status: "hit" } }),
      record({ result: { ...record().result, status: "miss" }, hrOddsYes: null }),
    ];
    const metrics = buildHrSummaryMetrics(filtered);
    const plays = metrics.find((m) => m.label === "Plays");
    const hits = metrics.find((m) => m.label === "HR Hits");
    expect(plays?.value).toBe("2");
    expect(hits?.value).toBe("1");
  });

  it("returns zero-play metrics for an empty filtered population rather than throwing", () => {
    const metrics = buildHrSummaryMetrics([]);
    expect(metrics.find((m) => m.label === "Plays")?.value).toBe("0");
  });
});
