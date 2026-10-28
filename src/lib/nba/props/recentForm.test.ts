import { describe, expect, it } from "vitest";
import { opponentLastTen, playerLastTen, shortDate, type OpponentRecentGame, type OpponentRecentSequence, type PlayerRecentGame } from "./recentForm";

const pg = (i: number, over: Partial<PlayerRecentGame> = {}): PlayerRecentGame => ({ date: `2026-10-${String(10 + i).padStart(2, "0")}`, opponent: "NYK", isHome: i % 2 === 0, minutes: 30, pts: 10 + i, reb: 5, ast: 2, ...over });
const og = (i: number, over: Partial<OpponentRecentGame> = {}): OpponentRecentGame => ({ date: `2026-10-${String(10 + i).padStart(2, "0")}`, versus: "BOS", defenseIsHome: i % 2 === 0, attributedMinutes: 80, totalMinutes: 100, pts: 20 + i, reb: 6, ast: 7, ...over });
const sequence = (games: OpponentRecentGame[], seasonGames = games.length): OpponentRecentSequence => ({ team: "NYK", position: "PG", season: "2026-27", seasonGames, games });

describe("shortDate", () => {
  it("reads the month and day from the text, so no time zone can move the day", () => {
    expect(shortDate("2026-10-24")).toBe("Oct 24");
    expect(shortDate("2026-11-01")).toBe("Nov 1");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
    expect(shortDate("not a date")).toBe("not a date");
  });
});

describe("playerLastTen", () => {
  it("averages the ten results of the selected market and keeps their order", () => {
    const view = playerLastTen(Array.from({ length: 10 }, (_, i) => pg(i)), "pts");
    expect(view).toMatchObject({ status: "ok", games: 10, average: 14.5, isSmallSample: false });
    expect(view.points.map((p) => p.value)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(view.points.map((p) => p.date)).toEqual([...view.points.map((p) => p.date)].sort());
    expect(playerLastTen(Array.from({ length: 10 }, (_, i) => pg(i)), "reb").average).toBe(5);
  });

  it("labels the venue from the player's side and keeps the minutes for the hover", () => {
    const [home, away] = playerLastTen([pg(0), pg(1)], "pts").points;
    expect(home).toMatchObject({ versus: "vs NYK", detail: "30 min" });
    expect(away.versus).toBe("@ NYK");
  });

  it("uses only the last ten if a longer list arrives", () => {
    const view = playerLastTen(Array.from({ length: 13 }, (_, i) => pg(i)), "pts");
    expect(view.games).toBe(10);
    expect(view.points[0].value).toBe(13);
  });

  it("reports the actual sample when short, and no average for no games", () => {
    expect(playerLastTen([pg(0), pg(1), pg(2)], "pts")).toMatchObject({ status: "ok", games: 3, average: 11, isSmallSample: true });
    expect(playerLastTen([], "pts")).toMatchObject({ status: "none", games: 0, average: null, isSmallSample: false });
  });

  it("says the board predates sequences rather than reporting no games", () => {
    expect(playerLastTen(undefined, "pts").status).toBe("stale");
  });
});

describe("opponentLastTen", () => {
  it("averages what the defense allowed per game and reports its minutes coverage", () => {
    const view = opponentLastTen(sequence(Array.from({ length: 10 }, (_, i) => og(i))), "pts");
    expect(view).toMatchObject({ status: "ok", games: 10, gamesWithFigure: 10, average: 24.5, coverage: 0.8, isSmallSample: false });
    expect(view.points[0]).toMatchObject({ versus: "vs BOS", detail: "80% of opposing minutes attributed to a position" });
  });

  it("keeps the other markets separate", () => {
    const seq = sequence([og(0), og(1)]);
    expect(opponentLastTen(seq, "reb").average).toBe(6);
    expect(opponentLastTen(seq, "ast").average).toBe(7);
  });

  it("flags a small sample with the real N and the season total behind it", () => {
    expect(opponentLastTen(sequence([og(0), og(1), og(2)], 3), "pts")).toMatchObject({ games: 3, isSmallSample: true, seasonGames: 3 });
    expect(opponentLastTen(sequence(Array.from({ length: 10 }, (_, i) => og(i)), 17), "pts").seasonGames).toBe(17);
  });

  it("leaves games with no attributable minutes out of the average and shows them as gaps", () => {
    const view = opponentLastTen(sequence([og(0, { pts: 10 }), og(1, { pts: null, attributedMinutes: 0 }), og(2, { pts: 20 })]), "pts");
    expect(view).toMatchObject({ games: 3, gamesWithFigure: 2, average: 15 });
    expect(view.points.map((p) => p.value)).toEqual([10, null, 20]);
  });

  it("reports no figure when no game in the window carries one, and for a missing sequence", () => {
    expect(opponentLastTen(sequence([og(0, { pts: null })]), "pts")).toMatchObject({ status: "none", average: null });
    expect(opponentLastTen(undefined, "pts")).toMatchObject({ status: "none", games: 0, average: null });
  });
});
