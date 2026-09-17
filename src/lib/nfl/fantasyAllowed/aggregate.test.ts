import { describe, expect, it } from "vitest";
import { buildDefenseGameLog, computePositionSample, rankSnapshotSample, selectDefenseGames } from "./aggregate";
import { makeHistoricalPlayerWeek } from "./__fixtures__/historicalPlayerWeek";

describe("buildDefenseGameLog", () => {
  it("sums multiple players of the same position into one per-game total", () => {
    const rows = [
      makeHistoricalPlayerWeek({ position: "RB", opponent: "buf", season: 2025, week: 1, actualFantasyPoints: 10 }),
      makeHistoricalPlayerWeek({ position: "RB", opponent: "buf", season: 2025, week: 1, actualFantasyPoints: 5 }),
      makeHistoricalPlayerWeek({ position: "WR", opponent: "buf", season: 2025, week: 1, actualFantasyPoints: 99 }),
    ];
    const log = buildDefenseGameLog(rows, "RB");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 15 });
  });
});

describe("selectDefenseGames", () => {
  const gameLog = [
    { team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 10 },
    { team: "buf", season: 2025, week: 2, fantasyPointsAllowed: 20 },
    { team: "buf", season: 2026, week: 1, fantasyPointsAllowed: 30 },
    { team: "mia", season: 2025, week: 1, fantasyPointsAllowed: 5 },
  ];

  it("filters to one season for a season selector", () => {
    const result = selectDefenseGames(gameLog, "buf", { kind: "season", season: 2025 });
    expect(result.map((g) => g.week)).toEqual([1, 2]);
  });

  it("takes the most recent N games across season boundaries for last-n", () => {
    const result = selectDefenseGames(gameLog, "buf", { kind: "last-n", n: 2 });
    // most recent 2 of buf's 3 games: 2026wk1, 2025wk2 -- returned chronologically
    expect(result).toEqual([
      { team: "buf", season: 2025, week: 2, fantasyPointsAllowed: 20 },
      { team: "buf", season: 2026, week: 1, fantasyPointsAllowed: 30 },
    ]);
  });

  it("rolls last-n backward into the prior season when the current one is short", () => {
    const result = selectDefenseGames(gameLog, "buf", { kind: "last-n", n: 3 });
    expect(result.map((g) => `${g.season}-${g.week}`)).toEqual(["2025-1", "2025-2", "2026-1"]);
  });
});

describe("computePositionSample", () => {
  it("ranks fewest fantasy points allowed per game as rank 1 (best defense)", () => {
    const gameLog = [
      { team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 10 },
      { team: "mia", season: 2025, week: 1, fantasyPointsAllowed: 30 },
      { team: "nyj", season: 2025, week: 1, fantasyPointsAllowed: 20 },
    ];
    const result = computePositionSample(gameLog, ["buf", "mia", "nyj"], { kind: "season", season: 2025 }, "jkb-full-ppr-player-week");
    expect(result.get("buf")?.rank).toBe(1);
    expect(result.get("nyj")?.rank).toBe(2);
    expect(result.get("mia")?.rank).toBe(3);
  });

  it("breaks exact per-game ties deterministically by total then team abbreviation", () => {
    const tiedLog = [
      { team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 10 },
      { team: "mia", season: 2025, week: 1, fantasyPointsAllowed: 10 },
    ];
    const result = computePositionSample(tiedLog, ["mia", "buf"], { kind: "season", season: 2025 }, "jkb-full-ppr-player-week");
    // Same per-game (10) and same total (10) -> alphabetical tiebreak: buf before mia.
    expect(result.get("buf")?.rank).toBe(1);
    expect(result.get("mia")?.rank).toBe(2);
  });

  it("assigns null rank and null per-game to teams with zero sampled games", () => {
    const gameLog = [{ team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 10 }];
    const result = computePositionSample(gameLog, ["buf", "mia"], { kind: "season", season: 2025 }, "jkb-full-ppr-player-week");
    expect(result.get("mia")).toMatchObject({
      rank: null,
      gamesSampled: 0,
      fantasyPointsAllowedTotal: null,
      fantasyPointsAllowedPerGame: null,
    });
    expect(result.get("buf")?.rank).toBe(1);
  });

  it("does not let a zero-game team occupy a rank slot other teams should share", () => {
    const gameLog = [
      { team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 10 },
      { team: "mia", season: 2025, week: 1, fantasyPointsAllowed: 20 },
    ];
    const result = computePositionSample(gameLog, ["buf", "mia", "nyj"], { kind: "season", season: 2025 }, "jkb-full-ppr-player-week");
    expect(result.get("buf")?.rank).toBe(1);
    expect(result.get("mia")?.rank).toBe(2);
    expect(result.get("nyj")?.rank).toBe(null);
  });
});

describe("rankSnapshotSample", () => {
  it("ranks a one-shot snapshot value the same direction (fewest allowed = rank 1)", () => {
    const values = new Map([
      ["buf", 12],
      ["mia", 25],
      ["nyj", 18],
    ]);
    const result = rankSnapshotSample(values, ["buf", "mia", "nyj"], "razzball-slot-wide-snapshot");
    expect(result.get("buf")).toMatchObject({ rank: 1, gamesSampled: 0, fantasyPointsAllowedTotal: null, fantasyPointsAllowedPerGame: 12 });
    expect(result.get("nyj")?.rank).toBe(2);
    expect(result.get("mia")?.rank).toBe(3);
  });

  it("leaves teams missing from the snapshot unranked", () => {
    const values = new Map([["buf", 12]]);
    const result = rankSnapshotSample(values, ["buf", "mia"], "razzball-slot-wide-snapshot");
    expect(result.get("mia")).toMatchObject({ rank: null, fantasyPointsAllowedPerGame: null });
  });
});
