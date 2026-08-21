import { describe, expect, it } from "vitest";
import {
  selectWeeklyFantasyBaseline,
  summarizeRankTransition,
  weeklyFantasyBaselineSchema,
} from "./baseline";

const hash = "a".repeat(64);
const source = (rank: number, projectedPpg: number | null, name = "source") => ({
  rank,
  projectedPpg,
  source: name,
  sourceVersion: "v1",
  sourceHash: hash,
  inputAsOf: "2026-08-20T00:00:00.000Z",
});
const input = (overrides: Record<string, unknown> = {}) => ({
  season: 2026,
  week: 1,
  playerId: "gsis:rookie",
  position: "WR" as const,
  historyGames: 0,
  minimumHistoryGames: 3,
  preseasonRos: source(18, 13.2, "2026-par-consensus"),
  currentSeason: null,
  historicalFallback: null,
  generatedAt: "2026-08-21T00:00:00.000Z",
  ...overrides,
});

describe("WeeklyFantasyBaseline", () => {
  it("uses the preseason authority for Week 1 and rookies", () => {
    const result = selectWeeklyFantasyBaseline(input());
    expect(result).toMatchObject({ sourceAuthority: "preseason-ros", confidence: "medium", historyGames: 0 });
  });

  it.each([1, 2])("retains preseason authority with %i prior games", (historyGames) => {
    const result = selectWeeklyFantasyBaseline(input({ week: historyGames + 1, historyGames, currentSeason: source(9, 15) }));
    expect(result?.sourceAuthority).toBe("preseason-ros");
  });

  it("switches to current-season strength at the configured player-game threshold", () => {
    const result = selectWeeklyFantasyBaseline(input({ week: 5, historyGames: 3, currentSeason: source(7, 16.1, "current") }));
    expect(result).toMatchObject({ sourceAuthority: "current-season", baselineRank: 7, baselineProjectedPpg: null, confidence: "high" });
  });

  it("uses actual player games rather than NFL week or team", () => {
    const result = selectWeeklyFantasyBaseline(input({ week: 8, historyGames: 1, playerId: "gsis:traded", currentSeason: source(4, 17) }));
    expect(result?.sourceAuthority).toBe("preseason-ros");
  });

  it("does not require prior-season data when a rookie has a production prior", () => {
    expect(selectWeeklyFantasyBaseline(input({ historicalFallback: null }))).not.toBeNull();
  });

  it("falls back deterministically when preseason and qualified current-season inputs are unavailable", () => {
    const result = selectWeeklyFantasyBaseline(input({ preseasonRos: null, historicalFallback: source(22, null, "prior-season-actual") }));
    expect(result).toMatchObject({ sourceAuthority: "fallback", confidence: "low", baselineProjectedPpg: null });
    expect(result?.fallbackReason).toBe("missing-preseason-ros-and-current-season-authority");
  });

  it("returns unranked when no player-strength authority exists", () => {
    expect(selectWeeklyFantasyBaseline(input({ preseasonRos: null }))).toBeNull();
  });

  it("keeps eligibility and experimental adjustments outside the strict contract", () => {
    const baseline = selectWeeklyFantasyBaseline(input())!;
    expect(() => weeklyFantasyBaselineSchema.parse({ ...baseline, eligible: false })).toThrow();
    expect(() => weeklyFantasyBaselineSchema.parse({ ...baseline, weeklyScore: 20 })).toThrow();
    expect(() => weeklyFantasyBaselineSchema.parse({ ...baseline, usageAdjustment: 2 })).toThrow();
  });

  it("rejects target-week and future-week-shaped provenance fields", () => {
    const baseline = selectWeeklyFantasyBaseline(input())!;
    expect(() => weeklyFantasyBaselineSchema.parse({ ...baseline, targetWeekOutcome: 10 })).toThrow();
  });

  it("requires stable identity and valid provenance", () => {
    expect(() => selectWeeklyFantasyBaseline(input({ playerId: "" }))).toThrow();
    expect(() => selectWeeklyFantasyBaseline(input({ preseasonRos: source(1, 10, "") }))).toThrow();
  });

  it("summarizes deterministic rank-transition movement", () => {
    expect(summarizeRankTransition([
      { priorRank: 1, currentRank: 2 },
      { priorRank: 5, currentRank: 5 },
      { priorRank: 8, currentRank: 12 },
      { priorRank: 12, currentRank: 20 },
    ])).toEqual({ rows: 4, medianAbsoluteMovement: 1, p75AbsoluteMovement: 4, p90AbsoluteMovement: 8, maximumAbsoluteMovement: 8 });
  });
});
