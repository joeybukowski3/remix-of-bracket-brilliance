import { describe, expect, it } from "vitest";
import { buildOffenseGameLog } from "./gameLog";
import { playerWeek } from "./__fixtures__/playerWeek";

describe("buildOffenseGameLog", () => {
  it("sums multiple WRs on one offense before any comparison (D)", () => {
    const [game] = buildOffenseGameLog([
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "WR", rec: 80 }),
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "WR", rec: 45 }),
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "WR", rec: 12, rush: 7 }),
    ]);
    expect(game.actual.wrRec).toBe(137);
    expect(game.actual.rush).toBe(7);
    expect(game.actual.rbRush).toBe(0);
  });

  it("keeps a game with no TE row as an explicit 0 for TE REC (J)", () => {
    const games = buildOffenseGameLog([
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "QB", pass: 250, rush: 10 }),
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "WR", rec: 250 }),
    ]);
    expect(games).toHaveLength(1);
    expect(games[0].actual).toEqual({ pass: 250, rush: 10, qbRush: 10, rbRush: 0, rbRec: 0, wrRec: 250, teRec: 0 });
  });

  it("counts every passer toward gross PASS and credits rushing to position groups", () => {
    const [game] = buildOffenseGameLog([
      playerWeek({ season: 2026, week: 2, team: "ne", opponent: "nyj", position: "QB", pass: 200, rush: -3 }),
      playerWeek({ season: 2026, week: 2, team: "ne", opponent: "nyj", position: "RB", pass: 16, rush: 90, rec: 20 }),
      playerWeek({ season: 2026, week: 2, team: "ne", opponent: "nyj", position: "TE", rec: 40 }),
    ]);
    expect(game.actual).toMatchObject({ pass: 216, rush: 87, qbRush: -3, rbRush: 90, rbRec: 20, teRec: 40 });
  });

  it("rejects an offense-game that lists two opponents", () => {
    expect(() => buildOffenseGameLog([
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "mia", position: "QB" }),
      playerWeek({ season: 2026, week: 1, team: "buf", opponent: "nyj", position: "WR" }),
    ])).toThrow(/two opponents/);
  });
});
