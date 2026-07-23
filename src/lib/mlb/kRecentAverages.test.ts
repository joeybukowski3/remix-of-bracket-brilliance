import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain JS module, no type declarations
import { summarizeOpponentLastFiveVsStarters, summarizePitcherLastFiveStarts } from "../../../scripts/lib/mlb-k-recent-averages.mjs";

describe("MLB K recent-average helpers", () => {
  it("summarizes complete pitcher last-five samples", () => {
    const summary = summarizePitcherLastFiveStarts([
      { date: "2026-07-01", opponent: "NYY", inningsPitched: "6.1", strikeouts: 8, battersFaced: 24, pitchCount: 96 },
      { date: "2026-06-25", opponent: "BOS", inningsPitched: "5.2", strikeouts: 7, battersFaced: 23, pitchCount: 92 },
    ]);

    expect(summary.gamesUsed).toBe(2);
    expect(summary.totalOuts).toBe(36);
    expect(summary.averageInnings).toBeCloseTo(36 / 3 / 2, 8);
    expect(summary.averageStrikeouts).toBe(7.5);
    expect(summary.recentK9).toBeCloseTo((15 / (36 / 3)) * 9, 8);
    expect(summary.recentKRate).toBeCloseTo(15 / 47, 8);
    expect(summary.averageBattersFaced).toBe(23.5);
    expect(summary.averagePitchCount).toBe(94);
  });

  it("summarizes partial pitcher samples without treating missing values as zero", () => {
    const summary = summarizePitcherLastFiveStarts([
      { inningsPitched: "4.3", strikeouts: 6, battersFaced: 18, pitchCount: 80 },
      { inningsPitched: "5.0", strikeouts: 5 },
      { inningsPitched: "4.2", strikeouts: null, battersFaced: 19 },
    ]);

    expect(summary.gamesAvailable).toBe(3);
    expect(summary.gamesUsed).toBe(1);
    expect(summary.recentKRate).toBeNull();
    expect(summary.averageBattersFaced).toBeNull();
    expect(summary.averagePitchCount).toBeNull();
  });

  it("returns null pitcher metrics for malformed and empty samples", () => {
    expect(summarizePitcherLastFiveStarts([{ inningsPitched: "bad", strikeouts: 4 }]).gamesUsed).toBe(0);
    expect(summarizePitcherLastFiveStarts([])).toMatchObject({
      gamesUsed: 0,
      totalOuts: null,
      averageInnings: null,
      averageStrikeouts: null,
      recentK9: null,
      recentKRate: null,
    });
  });

  it("summarizes complete opponent last-five vs starter samples", () => {
    const summary = summarizeOpponentLastFiveVsStarters([
      { opposingStarterInningsPitched: "6.0", opposingStarterStrikeouts: 7, teamTotalStrikeouts: 10, teamPlateAppearances: 38, teamWhiffRate: 0.28 },
      { opposingStarterInningsPitched: "5.1", opposingStarterStrikeouts: 6, teamTotalStrikeouts: 8, teamPlateAppearances: 36, teamWhiffRate: 0.3 },
    ]);

    expect(summary.gamesUsed).toBe(2);
    expect(summary.totalOpposingStarterOuts).toBe(34);
    expect(summary.averageOpposingStarterInnings).toBeCloseTo(34 / 3 / 2, 8);
    expect(summary.averageOpposingStarterStrikeouts).toBe(6.5);
    expect(summary.averageTeamStrikeouts).toBe(9);
    expect(summary.recentTeamKRate).toBeCloseTo(18 / 74, 8);
    expect(summary.recentWhiffRate).toBeCloseTo(0.29, 8);
  });

  it("summarizes partial and empty opponent samples safely", () => {
    const partial = summarizeOpponentLastFiveVsStarters([
      { opposingStarterInningsPitched: "4.3", opposingStarterStrikeouts: 4, teamTotalStrikeouts: 9 },
      { opposingStarterInningsPitched: "5.0", opposingStarterStrikeouts: 5 },
    ]);
    const empty = summarizeOpponentLastFiveVsStarters([]);

    expect(partial.gamesUsed).toBe(1);
    expect(partial.recentTeamKRate).toBeNull();
    expect(empty).toMatchObject({
      gamesUsed: 0,
      averageOpposingStarterInnings: null,
      averageOpposingStarterStrikeouts: null,
      averageTeamStrikeouts: null,
      recentTeamKRate: null,
      recentWhiffRate: null,
    });
  });
});
