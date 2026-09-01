import { describe, expect, it } from "vitest";
import { resolveNflBettingLinesSlate } from "./nflBettingLinesWeekResolver";
import type { NflGameRecord } from "../../nfl/standings";

function game(overrides: Partial<NflGameRecord>): NflGameRecord {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    dateUtc: "2026-09-10T00:20:00.000Z",
    homeTeam: "Seattle Seahawks",
    awayTeam: "New England Patriots",
    homeAbbr: "sea",
    awayAbbr: "ne",
    status: "scheduled",
    stadium: "Lumen Field",
    neutralSite: false,
    ...overrides,
  };
}

function doc(games: NflGameRecord[]): unknown {
  return { _meta: { source: "nflverse" }, games };
}

const WEEK_1 = [
  game({ gameId: "2026_01_A", week: 1, dateUtc: "2026-09-07T17:00:00.000Z" }),
  game({ gameId: "2026_01_B", week: 1, dateUtc: "2026-09-08T00:20:00.000Z" }),
];
const WEEK_2 = [
  game({ gameId: "2026_02_A", week: 2, dateUtc: "2026-09-14T17:00:00.000Z" }),
  game({ gameId: "2026_02_B", week: 2, dateUtc: "2026-09-15T00:20:00.000Z" }),
];

describe("resolveNflBettingLinesSlate", () => {
  it("returns Week 1 when now is before the whole season", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [doc([...WEEK_1, ...WEEK_2])],
      nowUtc: "2026-09-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "resolved",
      season: 2026,
      week: 1,
      seasonType: "REG",
      futureGamesInWeek: 2,
    });
  });

  it("stays on Week 1 while some Week 1 games are still upcoming", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [doc([...WEEK_1, ...WEEK_2])],
      // after game A, before game B
      nowUtc: "2026-09-07T21:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "resolved", week: 1, futureGamesInWeek: 1 });
  });

  it("advances to Week 2 once every Week 1 game has kicked off", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [doc([...WEEK_1, ...WEEK_2])],
      nowUtc: "2026-09-09T00:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "resolved", week: 2, seasonType: "REG" });
  });

  it("skips a bye/empty gap and resolves the next week that has a future game", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [
        doc([
          game({ gameId: "past", week: 5, dateUtc: "2026-10-05T17:00:00.000Z" }),
          game({ gameId: "future", week: 7, dateUtc: "2026-10-19T17:00:00.000Z" }),
        ]),
      ],
      nowUtc: "2026-10-10T00:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "resolved", week: 7 });
  });

  it("resolves a postseason round with the POST season-type family", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [
        doc([
          game({ gameId: "wc1", week: 19, seasonType: "WC", dateUtc: "2027-01-09T18:00:00.000Z" }),
          game({ gameId: "div1", week: 20, seasonType: "DIV", dateUtc: "2027-01-16T18:00:00.000Z" }),
        ]),
      ],
      nowUtc: "2027-01-07T10:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "resolved", week: 19, seasonType: "POST" });
  });

  it("reads a January playoff week from the previous season's document", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [
        doc([]), // current-year file, empty
        doc([game({ gameId: "sb", season: 2026, week: 22, seasonType: "SB", dateUtc: "2027-02-08T23:30:00.000Z" })]),
      ],
      nowUtc: "2027-02-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "resolved", season: 2026, week: 22, seasonType: "POST" });
  });

  it("ignores preseason games entirely", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [
        doc([
          game({ gameId: "pre", week: 1, seasonType: "PRE", dateUtc: "2026-08-10T17:00:00.000Z" }),
        ]),
      ],
      nowUtc: "2026-08-01T10:00:00.000Z",
    });
    expect(result.status).toBe("no-slate");
  });

  it("returns no-slate when there is no future REG/postseason game (offseason)", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [doc(WEEK_1)],
      nowUtc: "2027-03-01T10:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "no-slate" });
    expect((result as { reason: string }).reason).toMatch(/offseason|future kickoff/i);
  });

  it("treats a game with a null kickoff as not-yet-scheduled (not a future game)", () => {
    const result = resolveNflBettingLinesSlate({
      gamesDocuments: [doc([game({ gameId: "tbd", week: 1, dateUtc: null })])],
      nowUtc: "2026-01-01T10:00:00.000Z",
    });
    expect(result.status).toBe("no-slate");
  });

  it("throws on a malformed schedule document", () => {
    expect(() =>
      resolveNflBettingLinesSlate({ gamesDocuments: [{ nope: true }], nowUtc: "2026-01-01T00:00:00.000Z" }),
    ).toThrow(/games: NflGameRecord\[\]/);
  });

  it("throws on a game entry with a non-integer week", () => {
    expect(() =>
      resolveNflBettingLinesSlate({
        gamesDocuments: [doc([game({ week: 1.5 as unknown as number })])],
        nowUtc: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(/non-integer week/);
  });

  it("throws on an invalid nowUtc", () => {
    expect(() =>
      resolveNflBettingLinesSlate({ gamesDocuments: [doc(WEEK_1)], nowUtc: "not-a-date" }),
    ).toThrow(/ISO 8601/);
  });

  it("is a pure NFL-schedule resolver: no CFB / provider concepts appear in its module", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/lib/market/lines/nflBettingLinesWeekResolver.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/ncaaf|cfb|americanfootball_ncaaf|sportsdataio/i);
    expect(source).not.toMatch(/theOddsApiClient|fetch\(/);
  });
});
