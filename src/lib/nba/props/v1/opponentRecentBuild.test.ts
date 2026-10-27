import { describe, expect, it } from "vitest";
import { fixturePositionsFile } from "../__fixtures__/v1Fixtures";
import { opponentBoxKey, opponentRecentKey } from "../recentForm";
import type { ImportedPlayerGame } from "./playerGameImport";
import { buildOpponentBoxScores, buildOpponentRecent } from "./opponentRecentBuild";
import { buildEstimateSet } from "./positionEstimates";

const positions = buildEstimateSet([fixturePositionsFile("2025-26"), fixturePositionsFile("2026-27")]);
const upcoming = { gameKey: "2026-11-20|NYK@BOS", away: "NYK", home: "BOS", date: "2026-11-20" };
const SEASON = "2026-27";

/** Fixture slots: NYK-1 and NYK-6 are PG, NYK-2 is SG, NYK-5 and NYK-8 are C. "NYK-99" has no estimate. */
function line(over: Partial<ImportedPlayerGame> & { playerId: string; gameId: string; gameDate: string }): ImportedPlayerGame {
  return { season: SEASON, seasonType: "regular", team: "NYK", opponent: "BOS", isHome: false, playerName: over.playerId, minutes: 30, pts: 10, reb: 4, ast: 2, ...over };
}

/** BOS's n regular-season home games on consecutive days, each with two PG scorers (so one game has two PG records). */
function bostonGames(n: number): ImportedPlayerGame[] {
  return Array.from({ length: n }, (_, i) => {
    const gameId = `g${String(i + 1).padStart(2, "0")}`;
    const gameDate = `2026-10-${String(20 + i).padStart(2, "0")}`;
    return [
      line({ playerId: "NYK-1", gameId, gameDate, pts: 10 + i, reb: 1, ast: 5 }),
      line({ playerId: "NYK-6", gameId, gameDate, pts: 1, reb: 0, ast: 1, minutes: 10 }),
      line({ playerId: "NYK-2", gameId, gameDate, pts: 50, reb: 9, ast: 9 }),
    ];
  }).flat();
}
const build = (rows: ImportedPlayerGame[], slate = [upcoming]) => buildOpponentRecent(rows, positions, slate, SEASON);
const pg = (rows: ImportedPlayerGame[]) => build(rows)[opponentRecentKey(upcoming.gameKey, "BOS", "PG")];

describe("buildOpponentRecent: the defense's own ten games", () => {
  it("takes the opponent's last ten distinct games, oldest to newest, not the last ten player records", () => {
    const sequence = pg(bostonGames(12));
    // 12 games x 3 player records = 36 records; the window is games 3..12, i.e. 10 games.
    expect(sequence.games).toHaveLength(10);
    expect(sequence.seasonGames).toBe(12);
    expect(sequence.games.map((g) => g.date)).toEqual(Array.from({ length: 10 }, (_, i) => `2026-10-${String(22 + i).padStart(2, "0")}`));
    expect(sequence.games[0].date < sequence.games[9].date).toBe(true);
  });

  it("sums every opposing player attributed to the position in that game (two PGs count together; the SG does not)", () => {
    const first = pg(bostonGames(3)).games[0];
    expect(first).toMatchObject({ pts: 11, reb: 1, ast: 6, versus: "NYK", defenseIsHome: true });
    const sg = build(bostonGames(3))[opponentRecentKey(upcoming.gameKey, "BOS", "SG")].games[0];
    expect(sg).toMatchObject({ pts: 50, reb: 9, ast: 9 });
  });

  it("reports the attributed share of opposing minutes", () => {
    const rows = [...bostonGames(2), line({ playerId: "NYK-99", gameId: "g01", gameDate: "2026-10-20", minutes: 30, pts: 40 })];
    const first = pg(rows).games[0];
    expect(first.totalMinutes).toBe(100);
    expect(first.attributedMinutes).toBe(70);
    expect(first.pts).toBe(11); // 10 + 1 from the two PGs; the unclassified player's 40 points are left out, not guessed into a position
  });

  it("uses only games strictly before the upcoming game's date", () => {
    const rows = [...bostonGames(3), line({ playerId: "NYK-1", gameId: "same", gameDate: "2026-11-20", pts: 99 }), line({ playerId: "NYK-1", gameId: "later", gameDate: "2026-11-25", pts: 99 })];
    const sequence = pg(rows);
    expect(sequence.games.map((g) => g.pts)).toEqual([11, 12, 13]);
    expect(sequence.seasonGames).toBe(3);
  });

  it("shows the real sample size early in the season instead of padding to ten, and never reaches into last season", () => {
    const rows = [...bostonGames(3), line({ season: "2025-26", playerId: "NYK-1", gameId: "old", gameDate: "2026-03-01", pts: 99 })];
    const sequence = pg(rows);
    expect(sequence.games).toHaveLength(3);
    expect(sequence.games.every((g) => g.pts !== 99)).toBe(true);
  });

  it("counts regular-season games only, like the DvP builder", () => {
    const rows = [...bostonGames(2), line({ seasonType: "preseason", playerId: "NYK-1", gameId: "pre", gameDate: "2026-10-05", pts: 99 }), line({ seasonType: "play_in", playerId: "NYK-1", gameId: "pi", gameDate: "2026-11-01", pts: 99 })];
    expect(pg(rows).games.map((g) => g.pts)).toEqual([11, 12]);
  });

  it("ignores did-not-play and zero-minute rows, and a game with only such rows is not a game", () => {
    const rows = [...bostonGames(2), line({ playerId: "NYK-1", gameId: "dnp", gameDate: "2026-11-01", minutes: 0, pts: 0 }), line({ playerId: "NYK-1", gameId: "nan", gameDate: "2026-11-02", minutes: Number.NaN, pts: 99 })];
    const sequence = pg(rows);
    expect(sequence.games).toHaveLength(2);
    expect(sequence.seasonGames).toBe(2);
  });

  it("leaves a game with no attributable opposing minutes as unknown (null), not zero", () => {
    const rows = [...bostonGames(2), line({ playerId: "NYK-99", gameId: "g03", gameDate: "2026-10-22", pts: 77 })];
    const game = pg(rows).games[2];
    expect(game).toMatchObject({ pts: null, reb: null, ast: null, attributedMinutes: 0, totalMinutes: 30 });
  });

  it("gives a defense with no completed game no sequence at all, rather than an empty one", () => {
    expect(Object.keys(build([]))).toEqual([]);
    expect(build(bostonGames(2))[opponentRecentKey(upcoming.gameKey, "NYK", "PG")]).toBeUndefined();
  });

  it("builds every estimated position for each defending side of each slate game", () => {
    const keys = Object.keys(build(bostonGames(2)));
    expect(keys.sort()).toEqual(["PG", "SG", "SF", "PF", "C"].map((p) => opponentRecentKey(upcoming.gameKey, "BOS", p as "PG")).sort());
  });

  it("does not depend on row order", () => {
    const rows = bostonGames(12);
    expect(pg([...rows].reverse())).toEqual(pg(rows));
  });
});

describe("buildOpponentBoxScores: the individual opposing players behind each game", () => {
  const boxes = (rows: ImportedPlayerGame[]) => buildOpponentBoxScores(rows, positions, [upcoming], SEASON)[opponentBoxKey(upcoming.gameKey, "BOS")];

  it("lists every opposing player who played, once per defense game, with the position DvP uses", () => {
    const first = boxes(bostonGames(3))[0];
    expect(first).toMatchObject({ gameId: "g01", date: "2026-10-20", versus: "NYK", defenseIsHome: true });
    expect(first.players.map((p) => [p.name, p.position, p.minutes, p.pts])).toEqual([
      ["NYK-1", "PG", 30, 10],
      ["NYK-2", "SG", 30, 50],
      ["NYK-6", "PG", 10, 1],
    ]);
  });

  it("uses the same ten games, in the same order, as the opponent sequences", () => {
    const rows = bostonGames(12);
    const dates = boxes(rows).map((g) => g.date);
    expect(dates).toEqual(pg(rows).games.map((g) => g.date));
    expect(dates).toHaveLength(10);
  });

  it("reconciles to the sequences: per position, the listed players' totals are the bar for that game, minutes included", () => {
    const rows = [
      ...bostonGames(6),
      line({ playerId: "NYK-99", gameId: "g02", gameDate: "2026-10-21", pts: 40, minutes: 12 }),
      line({ playerId: "NYK-5", gameId: "g04", gameDate: "2026-10-23", pts: 7, reb: 11, ast: 1 }),
    ];
    const all = build(rows);
    for (const position of ["PG", "SG", "SF", "PF", "C"] as const) {
      const sequence = all[opponentRecentKey(upcoming.gameKey, "BOS", position)];
      boxes(rows).forEach((game, i) => {
        const at = game.players.filter((p) => p.position === position);
        const attributed = game.players.filter((p) => p.position !== null).reduce((sum, p) => sum + p.minutes, 0);
        const bar = sequence.games[i];
        expect(bar.date).toBe(game.date);
        expect(bar.attributedMinutes).toBe(attributed);
        expect(bar.totalMinutes).toBe(game.players.reduce((sum, p) => sum + p.minutes, 0));
        expect(bar.pts).toBe(attributed > 0 ? at.reduce((sum, p) => sum + p.pts, 0) : null);
        expect(bar.reb).toBe(attributed > 0 ? at.reduce((sum, p) => sum + p.reb, 0) : null);
        expect(bar.ast).toBe(attributed > 0 ? at.reduce((sum, p) => sum + p.ast, 0) : null);
      });
    }
  });

  it("keeps a player with no estimate in the list with a null position, so the gap is visible and counted nowhere", () => {
    const rows = [...bostonGames(2), line({ playerId: "NYK-99", gameId: "g01", gameDate: "2026-10-20", pts: 40, minutes: 12 })];
    expect(boxes(rows)[0].players.filter((p) => p.position === null)).toEqual([{ name: "NYK-99", minutes: 12, pts: 40, reb: 4, ast: 2, position: null }]);
  });

  it("applies the same gates as the sequences: this season, regular season, strictly before the game, played minutes only", () => {
    const rows = [
      ...bostonGames(2),
      line({ playerId: "NYK-1", gameId: "same", gameDate: "2026-11-20", pts: 99 }),
      line({ playerId: "NYK-1", gameId: "pre", gameDate: "2026-10-05", seasonType: "preseason", pts: 99 }),
      line({ season: "2025-26", playerId: "NYK-1", gameId: "old", gameDate: "2026-03-01", pts: 99 }),
      line({ playerId: "NYK-1", gameId: "dnp", gameDate: "2026-11-01", minutes: 0, pts: 99 }),
    ];
    const games = boxes(rows);
    expect(games.map((g) => g.gameId)).toEqual(["g01", "g02"]);
    expect(games.flatMap((g) => g.players).every((p) => p.pts !== 99 && p.minutes > 0)).toBe(true);
  });

  it("gives a defense with no completed game no entry, and does not depend on row order", () => {
    expect(buildOpponentBoxScores([], positions, [upcoming], SEASON)).toEqual({});
    expect(boxes([...bostonGames(12)].reverse())).toEqual(boxes(bostonGames(12)));
  });
});
