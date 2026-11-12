import { describe, expect, it } from "vitest";
import { buildFantasyAllowedCoverage } from "./nfl-fantasy-allowed-provenance.mjs";

const SEASON = 2026;
const game = (id, week, home, away) => ({ gameId: id, week, seasonType: "REG", homeAbbr: home, awayAbbr: away });
const result = (id, week, home, away) => ({ ...game(id, week, home, away), final: true });
// A team's player-week rows; only season/week/team matter to the coverage classifier.
const rows = (week, ...teams) => teams.map((team) => ({ season: SEASON, week, team }));

const GAMES = [game("g1", 1, "a", "b"), game("g2", 1, "c", "d"), game("g3", 2, "a", "c"), game("g4", 2, "b", "d")];

describe("buildFantasyAllowedCoverage", () => {
  it("reports complete coverage when every final game is in the player-week cache", () => {
    const coverage = buildFantasyAllowedCoverage({
      season: SEASON,
      games: GAMES,
      results: GAMES.map((g) => result(g.gameId, g.week, g.homeAbbr, g.awayAbbr)),
      playerWeekRows: [...rows(1, "a", "b", "c", "d"), ...rows(2, "a", "b", "c", "d")],
    });
    expect(coverage).toMatchObject({ status: "complete", finalGames: 4, incorporatedGames: 4, dataThroughWeek: 2, missingFinalGameIds: [], notYetFinalGameIds: [] });
  });

  it("is partial (upstream lag) when a final game's stats have not been published to the cache", () => {
    const coverage = buildFantasyAllowedCoverage({
      season: SEASON,
      games: GAMES,
      results: GAMES.map((g) => result(g.gameId, g.week, g.homeAbbr, g.awayAbbr)),
      playerWeekRows: [...rows(1, "a", "b", "c", "d"), ...rows(2, "a", "c")], // g4 (b vs d) missing
    });
    expect(coverage).toMatchObject({ status: "partial", finalGames: 4, incorporatedGames: 3, dataThroughWeek: 2, missingFinalGameIds: ["g4"] });
  });

  it("is partial (results lag) when the cache has a game results.json does not yet mark final", () => {
    const coverage = buildFantasyAllowedCoverage({
      season: SEASON,
      games: GAMES,
      results: [result("g1", 1, "a", "b"), result("g2", 1, "c", "d")],
      playerWeekRows: [...rows(1, "a", "b", "c", "d"), ...rows(2, "a", "c")],
    });
    expect(coverage.status).toBe("partial");
    expect(coverage.notYetFinalGameIds).toEqual(["g3"]);
  });

  it("derives dataThroughWeek from the highest week actually present in the cache", () => {
    const coverage = buildFantasyAllowedCoverage({
      season: SEASON,
      games: GAMES,
      results: [result("g1", 1, "a", "b"), result("g2", 1, "c", "d")],
      playerWeekRows: rows(1, "a", "b", "c", "d"),
    });
    expect(coverage.dataThroughWeek).toBe(1);
  });

  it("handles the very start of a season (no cache rows, no finals) as complete with null week", () => {
    const coverage = buildFantasyAllowedCoverage({ season: SEASON, games: GAMES, results: [], playerWeekRows: [] });
    expect(coverage).toMatchObject({ status: "complete", finalGames: 0, incorporatedGames: 0, dataThroughWeek: null });
  });

  it("ignores prior-season rows", () => {
    const coverage = buildFantasyAllowedCoverage({
      season: SEASON,
      games: GAMES,
      results: [],
      playerWeekRows: [{ season: SEASON - 1, week: 17, team: "a" }],
    });
    expect(coverage.incorporatedGames).toBe(0);
  });

  it("returns only plain JSON-safe values (it is written into a public artifact)", () => {
    const coverage = buildFantasyAllowedCoverage({ season: SEASON, games: GAMES, results: [], playerWeekRows: [] });
    expect(JSON.parse(JSON.stringify(coverage))).toEqual(coverage);
  });
});
