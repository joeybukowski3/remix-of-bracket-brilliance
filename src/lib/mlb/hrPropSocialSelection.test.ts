import { describe, expect, it } from "vitest";
import { selectTopSocialHrRows } from "./hrPropSocialSelection";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

function batter(overrides: Partial<HrDashboardBatter> & { player: string; hrScore: number }): HrDashboardBatter {
  return {
    gameKey: "TOR@WSH",
    playerId: null,
    gameId: null,
    lineupStatus: "projected",
    battingOrder: null,
    starterConfirmed: null,
    position: null,
    team: "WSH",
    opponent: "TOR",
    opposingPitcher: "Some Pitcher",
    opposingPitcherId: null,
    pitcherHand: "R",
    ballpark: "Nationals Park",
    parkFactor: 0.98,
    atBats: 200,
    barrelRate: 10,
    hardHitRate: 40,
    exitVelo: 90,
    iso: 0.2,
    hrFBRatio: 12,
    pullRate: 40,
    xba: 0.25,
    kRate: 22,
    bbRate: 9,
    whiffRate: 25,
    last7HR: 1,
    last30HR: 4,
    opposingPitcherHrVs: 50,
    opposingPitcherHitsVs: 50,
    opposingPitcherKVs: 50,
    weatherBoost: 0,
    hrScoreRank: 1,
    angleTags: [],
    ...overrides,
  } as HrDashboardBatter;
}

describe("selectTopSocialHrRows", () => {
  it("sorts by hrScore descending and caps at max", () => {
    const batters = [
      batter({ player: "Low", hrScore: 50 }),
      batter({ player: "High", hrScore: 90 }),
      batter({ player: "Mid", hrScore: 70 }),
    ];
    const result = selectTopSocialHrRows(batters, { max: 2 });
    expect(result.map((r) => r.player)).toEqual(["High", "Mid"]);
  });

  it("excludes batters with barrel rate above 25", () => {
    const batters = [
      batter({ player: "Elite Contact", hrScore: 95, barrelRate: 30 }),
      batter({ player: "Normal", hrScore: 60, barrelRate: 15 }),
    ];
    const result = selectTopSocialHrRows(batters, { max: 8 });
    expect(result.map((r) => r.player)).toEqual(["Normal"]);
  });

  it("excludes batters with fewer than 50 at-bats", () => {
    const batters = [
      batter({ player: "Small Sample", hrScore: 95, atBats: 10 }),
      batter({ player: "Normal", hrScore: 60, atBats: 200 }),
    ];
    const result = selectTopSocialHrRows(batters, { max: 8 });
    expect(result.map((r) => r.player)).toEqual(["Normal"]);
  });

  it("does not filter on null barrelRate/atBats (never a false exclusion)", () => {
    const batters = [batter({ player: "Unknown Sample", hrScore: 60, barrelRate: null, atBats: null })];
    const result = selectTopSocialHrRows(batters, { max: 8 });
    expect(result).toHaveLength(1);
  });

  it("defaults max to 8", () => {
    const batters = Array.from({ length: 10 }, (_, i) => batter({ player: `P${i}`, hrScore: 100 - i }));
    expect(selectTopSocialHrRows(batters)).toHaveLength(8);
  });

  it("does not mutate the input array", () => {
    const batters = [batter({ player: "A", hrScore: 10 }), batter({ player: "B", hrScore: 90 })];
    const original = [...batters];
    selectTopSocialHrRows(batters, { max: 8 });
    expect(batters).toEqual(original);
  });

  it("a smaller max is always a strict prefix of a larger max's result (same order, no reranking on truncation)", () => {
    const batters = Array.from({ length: 10 }, (_, i) => batter({ player: `P${i}`, hrScore: 100 - i }));
    const top6 = selectTopSocialHrRows(batters, { max: 6 });
    const top8 = selectTopSocialHrRows(batters, { max: 8 });
    expect(top8.slice(0, 6)).toEqual(top6);
  });
});
