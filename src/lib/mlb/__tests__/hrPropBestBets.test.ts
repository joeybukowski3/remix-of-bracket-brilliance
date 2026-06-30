import { describe, expect, it } from "vitest";
import { buildHrPropBestBets } from "@/lib/mlb/hrPropBestBets";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

function batter(overrides: Partial<HrDashboardBatter> = {}): HrDashboardBatter {
  return {
    gameKey: "AAA@BBB",
    player: "Test Hitter",
    team: "AAA",
    opponent: "BBB",
    opposingPitcher: "Test Pitcher",
    opposingPitcherId: 1,
    pitcherHand: "R",
    ballpark: "Test Park",
    parkFactor: 1.1,
    atBats: 100,
    barrelRate: 15,
    hardHitRate: 48,
    exitVelo: 91,
    iso: 0.22,
    hrFBRatio: 18,
    pullRate: 44,
    xba: 0.26,
    kRate: 22,
    bbRate: 9,
    whiffRate: 25,
    last7HR: 2,
    last30HR: 6,
    opposingPitcherHrVs: 68,
    opposingPitcherHitsVs: 55,
    opposingPitcherKVs: 40,
    weatherBoost: 3,
    hrScore: 72,
    hrScoreRank: 4,
    bats: "R",
    hrOddsYes: "+375",
    hrOddsNo: "-500",
    hrOddsBook: "draftkings",
    confidenceLevel: "high",
    angleTags: [],
    ...overrides,
  };
}

describe("buildHrPropBestBets", () => {
  it("selects a strong model play with available odds", () => {
    const result = buildHrPropBestBets([batter()]);
    expect(result.modelPlays).toHaveLength(1);
    expect(result.modelPlays[0]).toMatchObject({ player: "Test Hitter", category: "model", odds: "+375" });
  });

  it("selects a qualifying longshot at +350 or longer", () => {
    const result = buildHrPropBestBets([batter({ hrOddsYes: "+450" })]);
    expect(result.longshots).toHaveLength(1);
    expect(result.longshots[0].category).toBe("longshot");
  });

  it("does not label a shorter price as a longshot", () => {
    const result = buildHrPropBestBets([batter({ hrOddsYes: "+300" })]);
    expect(result.modelPlays).toHaveLength(1);
    expect(result.longshots).toHaveLength(0);
  });

  it("does not force a play without HR odds", () => {
    const result = buildHrPropBestBets([batter({ hrOddsYes: null })]);
    expect(result.modelPlays).toHaveLength(0);
    expect(result.longshots).toHaveLength(0);
  });

  it("does not select incomplete or sub-threshold rows", () => {
    const result = buildHrPropBestBets([
      batter({ player: "Incomplete", confidenceLevel: "incomplete" }),
      batter({ player: "Low Score", hrScore: 54.9 }),
    ]);
    expect(result.modelPlays).toHaveLength(0);
  });

  it("limits each category to the requested maximum", () => {
    const rows = [
      batter({ player: "One", hrScore: 78, hrScoreRank: 1 }),
      batter({ player: "Two", hrScore: 76, hrScoreRank: 2 }),
      batter({ player: "Three", hrScore: 74, hrScoreRank: 3 }),
      batter({ player: "Four", hrScore: 72, hrScoreRank: 4 }),
    ];
    const result = buildHrPropBestBets(rows, 3);
    expect(result.modelPlays).toHaveLength(3);
    expect(result.longshots).toHaveLength(3);
  });

  it("uses deterministic ordering for tied rows", () => {
    const result = buildHrPropBestBets([
      batter({ player: "Zulu", hrScoreRank: 5 }),
      batter({ player: "Alpha", hrScoreRank: 5 }),
    ]);
    expect(result.modelPlays.map((play) => play.player)).toEqual(["Alpha", "Zulu"]);
  });
});
