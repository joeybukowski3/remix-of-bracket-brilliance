import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import { historySegment, seasonSegment, usageSegment } from "./segments";

describe("segments: deterministic, pregame-only", () => {
  it("buckets weeks into 1-3 / 4-8 / 9+ purely from `week`", () => {
    expect(seasonSegment(makeRow({ season: 2024, week: 1, playerId: "a" }))).toBe("weeks-1-3");
    expect(seasonSegment(makeRow({ season: 2024, week: 3, playerId: "a" }))).toBe("weeks-1-3");
    expect(seasonSegment(makeRow({ season: 2024, week: 4, playerId: "a" }))).toBe("weeks-4-8");
    expect(seasonSegment(makeRow({ season: 2024, week: 8, playerId: "a" }))).toBe("weeks-4-8");
    expect(seasonSegment(makeRow({ season: 2024, week: 9, playerId: "a" }))).toBe("weeks-9-plus");
    expect(seasonSegment(makeRow({ season: 2024, week: 17, playerId: "a" }))).toBe("weeks-9-plus");
  });

  it("assigns history segment purely from the pregame rookieOrNoPriorHistory flag", () => {
    expect(historySegment(makeRow({ season: 2024, week: 1, playerId: "a", rookieOrNoPriorHistory: true }))).toBe("rookie-no-prior");
    expect(historySegment(makeRow({ season: 2024, week: 1, playerId: "a", rookieOrNoPriorHistory: false }))).toBe("prior-history");
  });

  it("never reads target-week fields (actualFantasyPoints) to assign any segment", () => {
    const highScorer = makeRow({ season: 2024, week: 5, playerId: "a", actualFantasyPoints: 40, seasonPpgPrior: 3, gamesPlayedPrior: 4, hasPriorSeason: false });
    const lowScorer = makeRow({ season: 2024, week: 5, playerId: "b", actualFantasyPoints: 0, seasonPpgPrior: 3, gamesPlayedPrior: 4, hasPriorSeason: false });
    // Both rows share identical pregame usage fields but wildly different outcomes; segment must be identical.
    expect(usageSegment(highScorer)).toBe(usageSegment(lowScorer));
    expect(seasonSegment(highScorer)).toBe(seasonSegment(lowScorer));
  });

  it("marks usage as unknown when there is no deterministic pregame usage sample yet", () => {
    const noSignal = makeRow({ season: 2024, week: 1, playerId: "a", seasonPpgPrior: null, priorSeasonPpg: null, gamesPlayedPrior: 0, hasPriorSeason: false });
    expect(usageSegment(noSignal)).toBe("usage-unknown");
  });
});
