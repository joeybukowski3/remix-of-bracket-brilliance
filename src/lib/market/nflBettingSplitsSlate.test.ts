import { describe, expect, it } from "vitest";
import { loadCanonicalNflSlate } from "./nflBettingSplitsSlate";
import type { NflGameRecord } from "../nfl/standings";

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

describe("loadCanonicalNflSlate", () => {
  it("resolves Week 1 REG games from the existing nflverse games document", () => {
    const slate = loadCanonicalNflSlate({
      season: 2026,
      week: 1,
      seasonType: "REG",
      gamesDocument: doc([
        game({ gameId: "2026_01_NE_SEA", week: 1 }),
        game({ gameId: "2026_01_KC_LAC", week: 1 }),
        game({ gameId: "2026_02_DAL_NYG", week: 2 }),
      ]),
    });
    expect(slate.games.map((g) => g.gameId)).toEqual(["2026_01_KC_LAC", "2026_01_NE_SEA"]);
    expect(slate.source).toBe("public/data/nfl/2026/games.json");
    expect(slate.seasonGameCount).toBe(3);
  });

  it("excludes the wrong week", () => {
    const slate = loadCanonicalNflSlate({
      season: 2026,
      week: 1,
      seasonType: "REG",
      gamesDocument: doc([
        game({ gameId: "2026_01_NE_SEA", week: 1 }),
        game({ gameId: "2026_02_DAL_NYG", week: 2 }),
      ]),
    });
    expect(slate.games.map((g) => g.gameId)).toEqual(["2026_01_NE_SEA"]);
  });

  it("filters to REG and excludes preseason / postseason rows", () => {
    const slate = loadCanonicalNflSlate({
      season: 2026,
      week: 1,
      seasonType: "REG",
      gamesDocument: doc([
        game({ gameId: "2026_01_NE_SEA", week: 1, seasonType: "REG" }),
        game({ gameId: "2026_01_PRE_X", week: 1, seasonType: "PRE" }),
        game({ gameId: "2026_01_WC_Y", week: 1, seasonType: "WC" }),
      ]),
    });
    expect(slate.games.map((g) => g.gameId)).toEqual(["2026_01_NE_SEA"]);
  });

  it("maps POST to the playoff-round season types", () => {
    const slate = loadCanonicalNflSlate({
      season: 2026,
      week: 1,
      seasonType: "POST",
      gamesDocument: doc([
        game({ gameId: "2026_19_A_B", week: 1, seasonType: "WC" }),
        game({ gameId: "2026_01_REG", week: 1, seasonType: "REG" }),
      ]),
    });
    expect(slate.games.map((g) => g.gameId)).toEqual(["2026_19_A_B"]);
  });

  it("excludes a different season", () => {
    const slate = loadCanonicalNflSlate({
      season: 2026,
      week: 1,
      seasonType: "REG",
      gamesDocument: doc([
        game({ gameId: "2026_01_NE_SEA", season: 2026, week: 1 }),
        game({ gameId: "2025_01_OLD", season: 2025, week: 1 }),
      ]),
    });
    expect(slate.games).toHaveLength(1);
    expect(slate.seasonGameCount).toBe(1);
  });

  it("throws on a malformed document", () => {
    expect(() =>
      loadCanonicalNflSlate({ season: 2026, week: 1, seasonType: "REG", gamesDocument: { games: null } }),
    ).toThrow(/games: NflGameRecord\[\]/);
  });

  it("throws when the slate is empty rather than run an empty provider request", () => {
    expect(() =>
      loadCanonicalNflSlate({
        season: 2026,
        week: 18,
        seasonType: "REG",
        gamesDocument: doc([game({ week: 1 })]),
      }),
    ).toThrow(/no REG games/);
  });
});
