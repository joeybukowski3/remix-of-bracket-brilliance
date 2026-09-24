import { describe, expect, it } from "vitest";
import {
  TDS_ALLOWED_CATEGORIES,
  buildDefenseTouchdownGameLog,
  computeTouchdownPositionSample,
  selectDefenseTouchdownGames,
  touchdownsForCategory,
  type TdsAllowedCategory,
} from "./aggregate";
import type { TdsAllowedCategoryKey } from "./types";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { makeHistoricalPlayerWeek } from "../fantasyAllowed/__fixtures__/historicalPlayerWeek";

const category = (key: TdsAllowedCategoryKey): TdsAllowedCategory => TDS_ALLOWED_CATEGORIES.find((entry) => entry.key === key)!;

/** A player-week with every touchdown-bearing stat set to a distinct value, so any mis-routed field shows up as a wrong count. */
function playerWeek(position: HistoricalPlayerWeek["position"], stats: Partial<HistoricalPlayerWeek["stats"]>): HistoricalPlayerWeek {
  return makeHistoricalPlayerWeek({
    position,
    stats: {
      ...makeHistoricalPlayerWeek().stats,
      passingTouchdowns: 0,
      rushingTouchdowns: 0,
      receivingTouchdowns: 0,
      specialTeamsTouchdowns: 0,
      passingTwoPointConversions: 0,
      rushingTwoPointConversions: 0,
      receivingTwoPointConversions: 0,
      ...stats,
    },
  });
}

/** Touchdowns one player-week contributes to every category, keyed by category. */
function contributions(row: HistoricalPlayerWeek): Record<TdsAllowedCategoryKey, number> {
  return Object.fromEntries(TDS_ALLOWED_CATEGORIES.map((entry) => [entry.key, touchdownsForCategory(row, entry)])) as Record<
    TdsAllowedCategoryKey,
    number
  >;
}

const NONE: Record<TdsAllowedCategoryKey, number> = { qbPass: 0, qbRush: 0, rbRush: 0, rbRec: 0, wrRec: 0, teRec: 0 };

describe("TDS_ALLOWED_CATEGORIES", () => {
  it("defines the six scoring-method categories in desktop column order", () => {
    expect(TDS_ALLOWED_CATEGORIES.map((entry) => entry.key)).toEqual(["qbPass", "qbRush", "rbRush", "rbRec", "wrRec", "teRec"]);
  });

  it("reads exactly one stat field per category, and never a two-point/special-teams field", () => {
    expect(TDS_ALLOWED_CATEGORIES.map((entry) => [entry.position, entry.statField])).toEqual([
      ["QB", "passingTouchdowns"],
      ["QB", "rushingTouchdowns"],
      ["RB", "rushingTouchdowns"],
      ["RB", "receivingTouchdowns"],
      ["WR", "receivingTouchdowns"],
      ["TE", "receivingTouchdowns"],
    ]);
  });
});

describe("touchdownsForCategory", () => {
  it("QB PASS: counts a QB's passing touchdowns only", () => {
    const row = playerWeek("QB", { passingTouchdowns: 2, rushingTouchdowns: 1 });
    expect(touchdownsForCategory(row, category("qbPass"))).toBe(2);
  });

  it("QB RUSH: counts a QB's rushing touchdowns only", () => {
    const row = playerWeek("QB", { passingTouchdowns: 2, rushingTouchdowns: 1 });
    expect(touchdownsForCategory(row, category("qbRush"))).toBe(1);
  });

  it("keeps a dual-threat QB's passing and rushing TDs in separate buckets (Josh Allen: 2 pass + 1 rush)", () => {
    expect(contributions(playerWeek("QB", { passingTouchdowns: 2, rushingTouchdowns: 1 }))).toEqual({ ...NONE, qbPass: 2, qbRush: 1 });
  });

  it("ignores a QB's receiving touchdowns (a rare trick-play catch is outside all six categories)", () => {
    expect(contributions(playerWeek("QB", { receivingTouchdowns: 2 }))).toEqual(NONE);
  });

  it("RB RUSH: counts an RB's rushing touchdowns only", () => {
    const row = playerWeek("RB", { rushingTouchdowns: 2, receivingTouchdowns: 1 });
    expect(touchdownsForCategory(row, category("rbRush"))).toBe(2);
  });

  it("RB REC: counts an RB's receiving touchdowns only", () => {
    const row = playerWeek("RB", { rushingTouchdowns: 2, receivingTouchdowns: 1 });
    expect(touchdownsForCategory(row, category("rbRec"))).toBe(1);
  });

  it("keeps a dual-threat RB's rushing and receiving TDs in separate buckets without double counting", () => {
    expect(contributions(playerWeek("RB", { rushingTouchdowns: 1, receivingTouchdowns: 1 }))).toEqual({ ...NONE, rbRush: 1, rbRec: 1 });
  });

  it("ignores an RB's passing touchdowns (a trick-play pass is not a QB PASS, RB RUSH or RB REC score)", () => {
    expect(contributions(playerWeek("RB", { passingTouchdowns: 1 }))).toEqual(NONE);
  });

  it("WR REC: counts a WR's receiving touchdowns", () => {
    expect(contributions(playerWeek("WR", { receivingTouchdowns: 2 }))).toEqual({ ...NONE, wrRec: 2 });
  });

  it("WR REC: excludes a WR's rushing touchdowns (jet sweep / end-around scores are not receiving TDs)", () => {
    expect(contributions(playerWeek("WR", { receivingTouchdowns: 1, rushingTouchdowns: 1 }))).toEqual({ ...NONE, wrRec: 1 });
  });

  it("TE REC: counts a TE's receiving touchdowns", () => {
    expect(contributions(playerWeek("TE", { receivingTouchdowns: 3 }))).toEqual({ ...NONE, teRec: 3 });
  });

  it("TE REC: excludes a TE's rushing touchdowns", () => {
    expect(contributions(playerWeek("TE", { receivingTouchdowns: 1, rushingTouchdowns: 1 }))).toEqual({ ...NONE, teRec: 1 });
  });

  it("excludes special-teams touchdowns from every category", () => {
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      expect(contributions(playerWeek(position, { specialTeamsTouchdowns: 4 }))).toEqual(NONE);
    }
  });

  it("excludes two-point conversions (passing, rushing and receiving) from every category", () => {
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      const row = playerWeek(position, { passingTwoPointConversions: 1, rushingTwoPointConversions: 1, receivingTwoPointConversions: 1 });
      expect(contributions(row)).toEqual(NONE);
    }
  });

  it("never lets one player-week contribute more than its own touchdown stats across all categories", () => {
    // Every stat set at once: each stat lands in at most one category, so the total is the sum of the
    // stats the six categories read for that position -- no field is counted twice.
    const total = (row: HistoricalPlayerWeek) => Object.values(contributions(row)).reduce((sum, value) => sum + value, 0);
    expect(total(playerWeek("QB", { passingTouchdowns: 3, rushingTouchdowns: 2, receivingTouchdowns: 5 }))).toBe(5);
    expect(total(playerWeek("RB", { passingTouchdowns: 3, rushingTouchdowns: 2, receivingTouchdowns: 1 }))).toBe(3);
    expect(total(playerWeek("WR", { passingTouchdowns: 3, rushingTouchdowns: 2, receivingTouchdowns: 1 }))).toBe(1);
    expect(total(playerWeek("TE", { passingTouchdowns: 3, rushingTouchdowns: 2, receivingTouchdowns: 1 }))).toBe(1);
  });
});

describe("buildDefenseTouchdownGameLog", () => {
  const game = { opponent: "buf", season: 2025, week: 1 };

  it("sums multiple players of the same position into one per-game total, without double counting either player", () => {
    const rows = [
      makeHistoricalPlayerWeek({ ...playerWeek("RB", { rushingTouchdowns: 1, receivingTouchdowns: 1 }), ...game }),
      makeHistoricalPlayerWeek({ ...playerWeek("RB", { rushingTouchdowns: 2 }), ...game }),
      makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 9 }), ...game }),
    ];
    const rush = buildDefenseTouchdownGameLog(rows, category("rbRush"));
    const rec = buildDefenseTouchdownGameLog(rows, category("rbRec"));
    expect(rush).toHaveLength(1);
    // Rushing: 1 + 2 = 3. Receiving: 1. The WR row feeds neither RB category.
    expect(rush[0]).toMatchObject({ team: "buf", season: 2025, week: 1, touchdownsAllowed: 3 });
    expect(rec[0]).toMatchObject({ team: "buf", season: 2025, week: 1, touchdownsAllowed: 1 });
  });

  it("represents a touchdown pass on both sides: QB PASS for the passer and WR REC for the receiver (intentional, documented)", () => {
    const rows = [
      makeHistoricalPlayerWeek({ ...playerWeek("QB", { passingTouchdowns: 1 }), ...game }),
      makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 1 }), ...game }),
    ];
    expect(buildDefenseTouchdownGameLog(rows, category("qbPass"))[0].touchdownsAllowed).toBe(1);
    expect(buildDefenseTouchdownGameLog(rows, category("wrRec"))[0].touchdownsAllowed).toBe(1);
    // ...but neither leaks into the QB rushing or other receiving categories. With no TE row the
    // game still exists for TE REC (0 touchdowns), because the defense played it.
    expect(buildDefenseTouchdownGameLog(rows, category("qbRush"))[0].touchdownsAllowed).toBe(0);
    expect(buildDefenseTouchdownGameLog(rows, category("teRec"))).toEqual([{ team: "buf", season: 2025, week: 1, touchdownsAllowed: 0 }]);
  });

  it("keeps a zero-touchdown game in the log so the per-game denominator counts it", () => {
    const rows = [makeHistoricalPlayerWeek({ ...playerWeek("TE", { receivingTouchdowns: 0 }), ...game })];
    expect(buildDefenseTouchdownGameLog(rows, category("teRec"))).toEqual([{ team: "buf", season: 2025, week: 1, touchdownsAllowed: 0 }]);
  });

  it("counts a defensive game with no row of the category's position as a 0-touchdown game (no TE row -> TE REC still has the game)", () => {
    const rows = [
      makeHistoricalPlayerWeek({ ...playerWeek("QB", { passingTouchdowns: 2 }), ...game, week: 1 }),
      makeHistoricalPlayerWeek({ ...playerWeek("TE", { receivingTouchdowns: 1 }), ...game, week: 1 }),
      // Week 2: the defense played, but no TE has a player-week row.
      makeHistoricalPlayerWeek({ ...playerWeek("QB", { passingTouchdowns: 1 }), ...game, week: 2 }),
    ];
    const log = buildDefenseTouchdownGameLog(rows, category("teRec")).sort((x, y) => x.week - y.week);
    expect(log.map((entry) => [entry.week, entry.touchdownsAllowed])).toEqual([
      [1, 1],
      [2, 0],
    ]);
  });

  it("counts a defensive game with no RB row for RB REC / RB RUSH", () => {
    const rows = [makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 1 }), ...game })];
    expect(buildDefenseTouchdownGameLog(rows, category("rbRec"))).toEqual([{ team: "buf", season: 2025, week: 1, touchdownsAllowed: 0 }]);
    expect(buildDefenseTouchdownGameLog(rows, category("rbRush"))).toHaveLength(1);
  });

  it("gives every category the same game log length for a defense", () => {
    const rows = [
      makeHistoricalPlayerWeek({ ...playerWeek("QB", { passingTouchdowns: 1 }), ...game, week: 1 }),
      makeHistoricalPlayerWeek({ ...playerWeek("RB", { rushingTouchdowns: 1 }), ...game, week: 2 }),
      makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 1 }), ...game, week: 3 }),
    ];
    const lengths = TDS_ALLOWED_CATEGORIES.map((entry) => buildDefenseTouchdownGameLog(rows, entry).length);
    expect(lengths).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("keeps different games and seasons as separate entries", () => {
    const rows = [
      makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 1 }), opponent: "buf", season: 2025, week: 1 }),
      makeHistoricalPlayerWeek({ ...playerWeek("WR", { receivingTouchdowns: 2 }), opponent: "buf", season: 2026, week: 1 }),
    ];
    expect(buildDefenseTouchdownGameLog(rows, category("wrRec"))).toHaveLength(2);
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
