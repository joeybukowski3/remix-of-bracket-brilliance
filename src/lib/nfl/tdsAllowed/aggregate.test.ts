import { describe, expect, it } from "vitest";
import {
  buildDefenseTouchdownGameLog,
  computeTouchdownPositionSample,
  selectDefenseTouchdownGames,
  touchdownsForPosition,
} from "./aggregate";
import { makeHistoricalPlayerWeek } from "../fantasyAllowed/__fixtures__/historicalPlayerWeek";

describe("touchdownsForPosition", () => {
  it("counts a QB's passing touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "QB",
      stats: { ...makeHistoricalPlayerWeek().stats, passingTouchdowns: 2, rushingTouchdowns: 0 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("counts a QB's rushing touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "QB",
      stats: { ...makeHistoricalPlayerWeek().stats, passingTouchdowns: 0, rushingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });

  it("combines a QB's passing + rushing touchdowns in the same game (Josh Allen example: 2 pass + 1 rush = 3)", () => {
    const row = makeHistoricalPlayerWeek({
      position: "QB",
      stats: { ...makeHistoricalPlayerWeek().stats, passingTouchdowns: 2, rushingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(3);
  });

  it("ignores a QB's receiving touchdowns (should never occur, but the field is not summed)", () => {
    const row = makeHistoricalPlayerWeek({
      position: "QB",
      stats: { ...makeHistoricalPlayerWeek().stats, passingTouchdowns: 1, rushingTouchdowns: 0, receivingTouchdowns: 5 },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });

  it("counts an RB's rushing touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "RB",
      stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 2, receivingTouchdowns: 0 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("counts an RB's receiving touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "RB",
      stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 0, receivingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });

  it("combines an RB's rushing + receiving touchdowns in the same game without double counting either field", () => {
    const row = makeHistoricalPlayerWeek({
      position: "RB",
      stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 1, receivingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("ignores an RB's passing touchdowns (e.g. a trick-play pass is not a rushing/receiving score)", () => {
    const row = makeHistoricalPlayerWeek({
      position: "RB",
      stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 1, receivingTouchdowns: 0, passingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });

  it("counts a WR's receiving touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "WR",
      stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 2 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("counts a WR's rushing touchdowns (jet sweep / end-around scores)", () => {
    const row = makeHistoricalPlayerWeek({
      position: "WR",
      stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });

  it("combines a WR's receiving + rushing touchdowns without double counting", () => {
    const row = makeHistoricalPlayerWeek({
      position: "WR",
      stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 1, rushingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("counts a TE's receiving touchdowns", () => {
    const row = makeHistoricalPlayerWeek({
      position: "TE",
      stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 3 },
    });
    expect(touchdownsForPosition(row)).toBe(3);
  });

  it("combines a TE's receiving + rushing touchdowns without double counting", () => {
    const row = makeHistoricalPlayerWeek({
      position: "TE",
      stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 1, rushingTouchdowns: 1 },
    });
    expect(touchdownsForPosition(row)).toBe(2);
  });

  it("never includes special-teams touchdowns or two-point conversions in any position's count", () => {
    const row = makeHistoricalPlayerWeek({
      position: "WR",
      stats: {
        ...makeHistoricalPlayerWeek().stats,
        receivingTouchdowns: 1,
        specialTeamsTouchdowns: 4,
        receivingTwoPointConversions: 2,
        rushingTwoPointConversions: 1,
      },
    });
    expect(touchdownsForPosition(row)).toBe(1);
  });
});

describe("buildDefenseTouchdownGameLog", () => {
  it("sums multiple players of the same position into one per-game total, without double counting either player", () => {
    const rows = [
      makeHistoricalPlayerWeek({
        position: "RB",
        opponent: "buf",
        season: 2025,
        week: 1,
        stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 1, receivingTouchdowns: 1 },
      }),
      makeHistoricalPlayerWeek({
        position: "RB",
        opponent: "buf",
        season: 2025,
        week: 1,
        stats: { ...makeHistoricalPlayerWeek().stats, rushingTouchdowns: 2 },
      }),
      makeHistoricalPlayerWeek({
        position: "WR",
        opponent: "buf",
        season: 2025,
        week: 1,
        stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 9 },
      }),
    ];
    const log = buildDefenseTouchdownGameLog(rows, "RB");
    expect(log).toHaveLength(1);
    // Player 1: 1 rush + 1 rec = 2. Player 2: 2 rush = 2. Total = 4 (WR row is excluded).
    expect(log[0]).toMatchObject({ team: "buf", season: 2025, week: 1, touchdownsAllowed: 4 });
  });

  it("keeps a QB's passing TD to a WR represented in both the QB and WR game logs (cross-position, not a bug)", () => {
    const rows = [
      makeHistoricalPlayerWeek({
        position: "QB",
        opponent: "buf",
        season: 2025,
        week: 1,
        stats: { ...makeHistoricalPlayerWeek().stats, passingTouchdowns: 1 },
      }),
      makeHistoricalPlayerWeek({
        position: "WR",
        opponent: "buf",
        season: 2025,
        week: 1,
        stats: { ...makeHistoricalPlayerWeek().stats, receivingTouchdowns: 1 },
      }),
    ];
    expect(buildDefenseTouchdownGameLog(rows, "QB")[0].touchdownsAllowed).toBe(1);
    expect(buildDefenseTouchdownGameLog(rows, "WR")[0].touchdownsAllowed).toBe(1);
  });
});

describe("selectDefenseTouchdownGames", () => {
  const gameLog = [
    { team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 },
    { team: "buf", season: 2025, week: 2, touchdownsAllowed: 2 },
    { team: "buf", season: 2026, week: 1, touchdownsAllowed: 3 },
    { team: "mia", season: 2025, week: 1, touchdownsAllowed: 0 },
  ];

  it("filters to one season for a season selector", () => {
    const result = selectDefenseTouchdownGames(gameLog, "buf", { kind: "season", season: 2025 });
    expect(result.map((g) => g.week)).toEqual([1, 2]);
  });

  it("takes the most recent N games across season boundaries for last-n", () => {
    const result = selectDefenseTouchdownGames(gameLog, "buf", { kind: "last-n", n: 2 });
    expect(result).toEqual([
      { team: "buf", season: 2025, week: 2, touchdownsAllowed: 2 },
      { team: "buf", season: 2026, week: 1, touchdownsAllowed: 3 },
    ]);
  });

  it("rolls last-n backward into the prior season when the current one is short", () => {
    const result = selectDefenseTouchdownGames(gameLog, "buf", { kind: "last-n", n: 3 });
    expect(result.map((g) => `${g.season}-${g.week}`)).toEqual(["2025-1", "2025-2", "2026-1"]);
  });
});

describe("computeTouchdownPositionSample", () => {
  it("ranks fewest touchdowns allowed per game as rank 1 (best defense)", () => {
    const gameLog = [
      { team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 },
      { team: "mia", season: 2025, week: 1, touchdownsAllowed: 3 },
      { team: "nyj", season: 2025, week: 1, touchdownsAllowed: 2 },
    ];
    const result = computeTouchdownPositionSample(gameLog, ["buf", "mia", "nyj"], { kind: "season", season: 2025 }, "nflverse-player-week");
    expect(result.get("buf")?.rank).toBe(1);
    expect(result.get("nyj")?.rank).toBe(2);
    expect(result.get("mia")?.rank).toBe(3);
  });

  it("ranks the most touchdowns allowed per game as rank 32 in a full-league sample", () => {
    const teams = Array.from({ length: 32 }, (_, index) => `t${index}`);
    const gameLog = teams.map((team, index) => ({ team, season: 2025, week: 1, touchdownsAllowed: index }));
    const result = computeTouchdownPositionSample(gameLog, teams, { kind: "season", season: 2025 }, "nflverse-player-week");
    expect(result.get("t0")?.rank).toBe(1);
    expect(result.get("t31")?.rank).toBe(32);
  });

  it("breaks exact per-game ties deterministically by total then team abbreviation", () => {
    const tiedLog = [
      { team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 },
      { team: "mia", season: 2025, week: 1, touchdownsAllowed: 1 },
    ];
    const result = computeTouchdownPositionSample(tiedLog, ["mia", "buf"], { kind: "season", season: 2025 }, "nflverse-player-week");
    expect(result.get("buf")?.rank).toBe(1);
    expect(result.get("mia")?.rank).toBe(2);
  });

  it("assigns null rank and null per-game to teams with zero sampled games", () => {
    const gameLog = [{ team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 }];
    const result = computeTouchdownPositionSample(gameLog, ["buf", "mia"], { kind: "season", season: 2025 }, "nflverse-player-week");
    expect(result.get("mia")).toMatchObject({
      rank: null,
      gamesSampled: 0,
      touchdownsAllowedTotal: null,
      touchdownsAllowedPerGame: null,
    });
    expect(result.get("buf")?.rank).toBe(1);
  });

  it("rounds touchdowns allowed per game to one decimal place", () => {
    const gameLog = [
      { team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 },
      { team: "buf", season: 2025, week: 2, touchdownsAllowed: 2 },
      { team: "buf", season: 2025, week: 3, touchdownsAllowed: 1 },
    ];
    const result = computeTouchdownPositionSample(gameLog, ["buf"], { kind: "season", season: 2025 }, "nflverse-player-week");
    expect(result.get("buf")?.touchdownsAllowedPerGame).toBe(1.3); // 4/3 = 1.333... -> 1.3
  });
});
