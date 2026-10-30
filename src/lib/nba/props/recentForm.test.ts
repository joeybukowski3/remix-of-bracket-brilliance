import { describe, expect, it } from "vitest";
import { opponentLastTenUnavailable, playerLastTen, shortDate, type PlayerRecentGame } from "./recentForm";

const pg = (i: number, over: Partial<PlayerRecentGame> = {}): PlayerRecentGame => ({ date: `2026-10-${String(10 + i).padStart(2, "0")}`, opponent: "NYK", isHome: i % 2 === 0, minutes: 30, pts: 10 + i, reb: 5, ast: 2, ...over });

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

describe("opponentLastTenUnavailable", () => {
  it("is an empty window with the stated reason and no gaps, never a zero average", () => {
    expect(opponentLastTenUnavailable("no-starters")).toEqual({ status: "no-starters", points: [], games: 0, gamesWithFigure: 0, average: null, gaps: { multiple: 0, none: 0, uncertain: 0, unavailable: 0 }, isSmallSample: false });
    expect(opponentLastTenUnavailable("stale").status).toBe("stale");
  });
});
