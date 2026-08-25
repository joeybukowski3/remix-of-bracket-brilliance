import { describe, expect, it } from "vitest";
import {
  WEEKLY_MATCHUP_COMPONENT_DIRECTIONS,
  WEEKLY_MATCHUP_GRADE_BANDS,
  WEEKLY_MATCHUP_WEIGHTS,
  calculateWeeklyMatchupComposite,
  toFavorableWeeklyMatchupRank,
  weeklyMatchupGrade,
  weeklyMatchupRankScore,
} from "@/lib/fantasy/weekly/matchupComposite";

const all = (rank: number) => ({ fpaSeason: rank, fpaLast5: rank, trenches: rank, epa: rank, success: rank });

describe("weekly fantasy composite matchup rating", () => {
  it("keeps every current weekly authority on the fantasy-favorable-low convention", () => {
    expect(WEEKLY_MATCHUP_COMPONENT_DIRECTIONS).toEqual({
      fpaSeason: "favorable-low",
      fpaLast5: "favorable-low",
      trenches: "favorable-low",
      epa: "favorable-low",
      success: "favorable-low",
    });
  });

  it("keeps pass-catcher weights identical and RB trench/EPA weights distinct", () => {
    expect(WEEKLY_MATCHUP_WEIGHTS.QB).toEqual(WEEKLY_MATCHUP_WEIGHTS.WR);
    expect(WEEKLY_MATCHUP_WEIGHTS.QB).toEqual(WEEKLY_MATCHUP_WEIGHTS.TE);
    expect(WEEKLY_MATCHUP_WEIGHTS.QB).toEqual({
      fpaSeason: 0.30, fpaLast5: 0.15, trenches: 0.20, epa: 0.20, success: 0.15,
    });
    expect(WEEKLY_MATCHUP_WEIGHTS.RB).toEqual({
      fpaSeason: 0.30, fpaLast5: 0.15, trenches: 0.25, epa: 0.15, success: 0.15,
    });
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      const sum = Object.values(WEEKLY_MATCHUP_WEIGHTS[position]).reduce((total, weight) => total + weight, 0);
      expect(sum).toBeCloseTo(1);
    }
  });

  it("normalizes favorable 1-32 ranks linearly and clamps safely", () => {
    expect(weeklyMatchupRankScore(1)).toBe(100);
    expect(weeklyMatchupRankScore(32)).toBe(0);
    expect(weeklyMatchupRankScore(16.5)).toBe(50);
    expect(weeklyMatchupRankScore(-4)).toBe(100);
    expect(weeklyMatchupRankScore(40)).toBe(0);
    expect(weeklyMatchupRankScore(null)).toBeNull();
    expect(toFavorableWeeklyMatchupRank(32, "favorable-high")).toBe(1);
    expect(weeklyMatchupRankScore(toFavorableWeeklyMatchupRank(32, "favorable-high"))).toBe(100);
  });

  it("applies QB/WR/TE weights to strong, weak, and mixed evidence", () => {
    expect(calculateWeeklyMatchupComposite("QB", all(1))).toMatchObject({ score: 100, grade: "Great" });
    expect(calculateWeeklyMatchupComposite("WR", all(32))).toMatchObject({ score: 0, grade: "Very Tough" });
    const mixed = calculateWeeklyMatchupComposite("TE", {
      fpaSeason: 1, fpaLast5: 32, trenches: 1, epa: 32, success: 1,
    });
    // 100*0.30 + 0*0.15 + 100*0.20 + 0*0.20 + 100*0.15 = 65
    expect(mixed.rawScore).toBeCloseTo(65);
    expect(mixed).toMatchObject({ score: 65, grade: "Neutral" });
  });

  it("applies the RB 25/15/15 edge weights", () => {
    const trenchesOnlyStrong = calculateWeeklyMatchupComposite("RB", {
      fpaSeason: 32, fpaLast5: 32, trenches: 1, epa: 32, success: 32,
    });
    const epaOnlyStrong = calculateWeeklyMatchupComposite("RB", {
      fpaSeason: 32, fpaLast5: 32, trenches: 32, epa: 1, success: 32,
    });
    const successOnlyStrong = calculateWeeklyMatchupComposite("RB", {
      fpaSeason: 32, fpaLast5: 32, trenches: 32, epa: 32, success: 1,
    });
    expect(trenchesOnlyStrong.rawScore).toBeCloseTo(25);
    expect(epaOnlyStrong.rawScore).toBeCloseTo(15);
    expect(successOnlyStrong.rawScore).toBeCloseTo(15);
    expect(WEEKLY_MATCHUP_WEIGHTS.RB.trenches).toBe(0.25);
    expect(WEEKLY_MATCHUP_WEIGHTS.RB.epa).toBe(0.15);
    expect(WEEKLY_MATCHUP_WEIGHTS.RB.success).toBe(0.15);
  });

  it("gives RB a larger trenches share than QB for the same mixed ranks", () => {
    const ranks = { fpaSeason: 32, fpaLast5: 32, trenches: 1, epa: 32, success: 32 };
    expect(calculateWeeklyMatchupComposite("RB", ranks).rawScore).toBeCloseTo(25);
    expect(calculateWeeklyMatchupComposite("QB", ranks).rawScore).toBeCloseTo(20);
  });

  it.each([
    [85, "Great"], [84.99, "Good"], [70, "Good"], [69.99, "Neutral"],
    [45, "Neutral"], [44.99, "Tough"], [30, "Tough"], [29.99, "Very Tough"], [0, "Very Tough"],
  ] as const)("maps score %s to %s", (score, label) => {
    expect(weeklyMatchupGrade(score)?.label).toBe(label);
  });

  it("keeps grade bands contiguous from 100 down to 0", () => {
    expect(WEEKLY_MATCHUP_GRADE_BANDS.map((band) => band.minScore)).toEqual([85, 70, 45, 30, 0]);
  });

  it("renormalizes 5/5, 4/5, and 3/5 evidence and withholds a grade below three", () => {
    expect(calculateWeeklyMatchupComposite("QB", all(1))).toMatchObject({ availableComponentCount: 5, score: 100 });
    expect(calculateWeeklyMatchupComposite("QB", { ...all(1), success: null })).toMatchObject({ availableComponentCount: 4, score: 100 });
    expect(calculateWeeklyMatchupComposite("QB", { ...all(1), epa: null, success: null })).toMatchObject({ availableComponentCount: 3, score: 100 });
    expect(calculateWeeklyMatchupComposite("QB", { ...all(1), trenches: null, epa: null, success: null }))
      .toMatchObject({ availableComponentCount: 2, rawScore: null, score: null, grade: "N/A", gradeId: null });

    const fourMixed = calculateWeeklyMatchupComposite("QB", {
      fpaSeason: 1, fpaLast5: 32, trenches: 1, epa: 32, success: null,
    });
    expect(fourMixed.rawScore).toBeCloseTo((30 + 20) / 0.85);

    const missingVsNeutral = calculateWeeklyMatchupComposite("QB", { ...all(1), success: null });
    const substitutedNeutral = calculateWeeklyMatchupComposite("QB", { ...all(1), success: 16.5 });
    expect(missingVsNeutral.rawScore).toBe(100);
    expect(substitutedNeutral.rawScore).toBeLessThan(100);
  });

  it.each(["fpaSeason", "fpaLast5", "trenches", "epa", "success"] as const)(
    "improves when %s becomes more favorable",
    (key) => {
      const difficult = calculateWeeklyMatchupComposite("QB", { ...all(16), [key]: 32 });
      const favorable = calculateWeeklyMatchupComposite("QB", { ...all(16), [key]: 1 });
      expect(favorable.rawScore).toBeGreaterThan(difficult.rawScore!);
    },
  );

  it("does not mutate source research inputs", () => {
    const inputs = Object.freeze({ fpaSeason: 3, fpaLast5: 7, trenches: 11, epa: 15, success: 19 });
    const before = JSON.stringify(inputs);
    calculateWeeklyMatchupComposite("RB", inputs);
    expect(JSON.stringify(inputs)).toBe(before);
  });
});
