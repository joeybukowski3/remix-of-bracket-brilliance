import { describe, expect, it } from "vitest";
import type { NbaPlayerGame } from "../types";
import { seasonStatsFor } from "./seasonStatsBuild";

const TEAM = 1;
const dayOf = (i: number): string => `2026-11-${String(i).padStart(2, "0")}`;

function played(i: number, minutes = 30, over: Partial<NbaPlayerGame> = {}): NbaPlayerGame {
  return {
    schemaVersion: "nba-player-game-v1", playerId: 1, playerName: "Demo", minutes, gameId: `g-${i}`, gameDate: dayOf(i), season: "2026-27", seasonType: "regular", teamId: TEAM, teamAbbr: "BOS",
    opponentTeamId: 2, opponentAbbr: "NYK", isHome: true, sourceSnapshotId: "test", pts: 20, reb: 6, ast: 4,
    oreb: 0, dreb: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0, pf: 0, plusMinus: null, ...over,
  };
}
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const teamDates = (days: readonly number[]) => new Map<number, readonly string[]>([[TEAM, days.map(dayOf)]]);
const target = (day: number) => ({ gameId: "target", cutoffDate: dayOf(day), season: "2026-27" });

describe("seasonStatsFor: availability from the team schedule and baseline v0's own flags", () => {
  it("is absent without a team schedule, so the existing shape is unchanged", () => {
    expect(seasonStatsFor([played(1)], target(5))).not.toHaveProperty("availability");
  });

  it("counts the team's last games the player did not appear in, without calling them injuries", () => {
    const days = range(1, 10);
    const history = days.filter((d) => d !== 3 && d !== 4).map((d) => played(d));
    const stats = seasonStatsFor(history, target(11), undefined, { teamId: TEAM, teamGameDates: teamDates(days) });
    expect(stats.availability).toEqual({ teamGames: 10, played: 8, returning: false, roleChange: false, teamChangedRecently: false });
  });

  it("flags a player who has missed three or more team games since the last appearance, as the model does", () => {
    const days = range(1, 10);
    const history = days.filter((d) => d <= 3).map((d) => played(d));
    const stats = seasonStatsFor(history, target(11), undefined, { teamId: TEAM, teamGameDates: teamDates(days) });
    expect(stats.availability?.returning).toBe(true);
    expect(stats.availability).toMatchObject({ teamGames: 10, played: 3 });
    const twoMissed = seasonStatsFor(days.filter((d) => d <= 8).map((d) => played(d)), target(11), undefined, { teamId: TEAM, teamGameDates: teamDates(days) });
    expect(twoMissed.availability?.returning).toBe(false);
  });

  it("flags a role change only when the last five games' minutes differ from the last twenty by 8 or more", () => {
    const days = range(1, 20);
    const shifted = seasonStatsFor(days.map((d) => played(d, d > 16 ? 18 : 34)), target(21), undefined, { teamId: TEAM, teamGameDates: teamDates(days) });
    expect(shifted.availability?.roleChange).toBe(true);
    const steady = seasonStatsFor(days.map((d) => played(d, 34)), target(21), undefined, { teamId: TEAM, teamGameDates: teamDates(days) });
    expect(steady.availability?.roleChange).toBe(false);
  });

  it("reports a team change inside the last ten games", () => {
    const days = range(1, 6);
    const history = [...days.slice(0, 3).map((d) => played(d, 30, { teamId: 9, teamAbbr: "LAL" })), ...days.slice(3).map((d) => played(d))];
    const stats = seasonStatsFor(history, target(7), undefined, { teamId: TEAM, teamGameDates: teamDates(days.slice(3)) });
    expect(stats.availability?.teamChangedRecently).toBe(true);
  });

  it("sees nothing on or after the matchup date: a later game or team game changes no field", () => {
    const days = range(1, 8);
    const early = days.map((d) => played(d));
    const withLater = [...early, played(9, 5), played(10, 5)];
    const dates = teamDates(range(1, 10));
    expect(seasonStatsFor(withLater, target(9), undefined, { teamId: TEAM, teamGameDates: dates }).availability).toEqual(
      seasonStatsFor(early, target(9), undefined, { teamId: TEAM, teamGameDates: teamDates(days) }).availability,
    );
  });

  it("leaves every other field exactly as it was", () => {
    const history = range(1, 8).map((d) => played(d));
    const plain = seasonStatsFor(history, target(9));
    const { availability: _availability, ...rest } = seasonStatsFor(history, target(9), undefined, { teamId: TEAM, teamGameDates: teamDates(range(1, 8)) });
    expect(rest).toEqual(plain);
  });
});
