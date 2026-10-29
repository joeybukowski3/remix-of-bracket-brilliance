import { describe, expect, it } from "vitest";
import { FIXTURE_BUILD_AT, FIXTURE_GAME_KEY, fixtureImportFile, fixturePositionsFile, fixtureRows, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { buildDvpRows, DVP_POSITIONS } from "../dvp";
import { assembleBoard } from "../pipeline/boardBuild";
import { normalizePlayerName } from "../pipeline/contracts";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import type { NbaPlayerGame } from "../types";
import type { GameScores } from "./gameResults";
import { parsePlayerGameImport } from "./playerGameImport";
import { buildEstimateSet } from "./positionEstimates";
import { buildPrivatePreviewBoard } from "./privatePreview";
import { seasonStatsFor } from "./seasonStatsBuild";
import { buildV1Inputs, parseSlate } from "./slateBuild";

function game(season: string, date: string, over: Partial<NbaPlayerGame> = {}): NbaPlayerGame {
  return {
    schemaVersion: "nba-player-game-v1", playerId: 1, playerName: "Demo", minutes: 30, gameId: `${season}-${date}`, gameDate: date, season, seasonType: "regular", teamId: 1, teamAbbr: "BOS",
    opponentTeamId: 2, opponentAbbr: "NYK", isHome: true, sourceSnapshotId: "test", pts: 20, reb: 6, ast: 4,
    oreb: 0, dreb: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0, pf: 0, plusMinus: null, ...over,
  };
}
const target = { gameId: "target", cutoffDate: "2026-11-10", season: "2026-27" };

describe("seasonStatsFor: completed games before the matchup", () => {
  it("sums games, minutes and each stat for this season, and keeps last regular season apart", () => {
    const history = [
      game("2026-27", "2026-10-22", { minutes: 30, pts: 20, reb: 6, ast: 4 }),
      game("2026-27", "2026-10-25", { minutes: 20, pts: 10, reb: 4, ast: 2 }),
      game("2025-26", "2026-03-01", { minutes: 36, pts: 30, reb: 8, ast: 6 }),
    ];
    expect(seasonStatsFor(history, target)).toMatchObject({
      current: { season: "2026-27", games: 2, minutes: 50, pts: 30, reb: 10, ast: 6 },
      previous: { season: "2025-26", games: 1, minutes: 36, pts: 30, reb: 8, ast: 6 },
    });
  });

  it("counts only games dated strictly before the matchup: the same day and later games never count", () => {
    const history = [game("2026-27", "2026-11-09"), game("2026-27", "2026-11-10", { pts: 99 }), game("2026-27", "2026-11-11", { pts: 99 }), game("2026-27", "2026-12-01", { pts: 99 })];
    const stats = seasonStatsFor(history, target);
    expect(stats.current).toMatchObject({ games: 1, pts: 20 });
  });

  it("excludes the matchup's own game id even when it is dated earlier", () => {
    const stats = seasonStatsFor([game("2026-27", "2026-11-01", { gameId: "target", pts: 99 }), game("2026-27", "2026-11-02")], target);
    expect(stats.current).toMatchObject({ games: 1, pts: 20 });
  });

  it("excludes did-not-play and zero-minute appearances from the games, minutes and per-game denominators", () => {
    const history = [game("2026-27", "2026-10-22", { minutes: 30 }), game("2026-27", "2026-10-24", { minutes: 0, pts: 0 }), game("2026-27", "2026-10-26", { minutes: Number.NaN, pts: 5 }), game("2026-27", "2026-10-28", { minutes: -3, pts: 5 })];
    expect(seasonStatsFor(history, target).current).toEqual({ season: "2026-27", games: 1, minutes: 30, pts: 20, reb: 6, ast: 4 });
  });

  it("leaves preseason out, and counts a competitive game of any kind this season", () => {
    const history = [game("2026-27", "2026-10-01", { seasonType: "preseason", pts: 99 }), game("2026-27", "2026-10-22"), game("2026-27", "2026-10-23", { seasonType: "play_in" }), game("2026-27", "2026-10-24", { seasonType: "playoffs" })];
    expect(seasonStatsFor(history, target).current?.games).toBe(3);
  });

  it("uses only the previous REGULAR season for the previous-season figures, and never an older season", () => {
    const history = [
      game("2025-26", "2026-03-01"),
      game("2025-26", "2026-04-20", { seasonType: "playoffs", pts: 99 }),
      game("2025-26", "2025-10-01", { seasonType: "preseason", pts: 99 }),
      game("2024-25", "2025-03-01", { pts: 99 }),
    ];
    expect(seasonStatsFor(history, target).previous).toMatchObject({ season: "2025-26", games: 1, pts: 20 });
  });

  it("has no current figures before the player's first game, and no previous ones for a newcomer", () => {
    expect(seasonStatsFor([game("2025-26", "2026-03-01")], target)).toMatchObject({ current: null, previous: { games: 1 } });
    expect(seasonStatsFor([game("2026-27", "2026-10-22")], target)).toMatchObject({ current: { games: 1 }, previous: null });
    expect(seasonStatsFor([], target)).toEqual({ current: null, previous: null, last5: null, last10: null, recentGames: [] });
  });

  it("is unchanged when later games are rewritten or deleted", () => {
    const early = [game("2026-27", "2026-10-22"), game("2026-27", "2026-11-01", { pts: 11 })];
    const later = [game("2026-27", "2026-11-12", { pts: 80, minutes: 48 }), game("2026-27", "2026-12-01", { pts: 80 })];
    expect(seasonStatsFor([...early, ...later], target)).toEqual(seasonStatsFor(early, target));
  });
});

describe("seasonStatsFor: last five and last ten completed games", () => {
  /** n games on consecutive October/November dates, oldest first; points rise by one each game so the window is identifiable. */
  const run = (n: number, over: Partial<NbaPlayerGame> = {}): NbaPlayerGame[] =>
    Array.from({ length: n }, (_, i) => game("2026-27", `2026-10-${String(10 + i).padStart(2, "0")}`, { pts: 10 + i, reb: 2 + i, ast: 1 + i, minutes: 30, ...over }));

  it("is the five most recent games, newest by date regardless of input order, not a season average", () => {
    const history = run(8);
    const forward = seasonStatsFor(history, target).last5;
    const reversed = seasonStatsFor([...history].reverse(), target).last5;
    // Games 4..8 of the run: points 13..17.
    expect(forward).toEqual({ games: 5, minutes: 150, pts: 13 + 14 + 15 + 16 + 17, reb: 5 + 6 + 7 + 8 + 9, ast: 4 + 5 + 6 + 7 + 8 });
    expect(reversed).toEqual(forward);
    expect(seasonStatsFor(history, target).current?.pts).toBe(10 + 11 + 12 + 13 + 14 + 15 + 16 + 17);
  });

  it("keeps the ten-game window separate from the five-game one", () => {
    const stats = seasonStatsFor(run(12), target);
    expect(stats.last5?.games).toBe(5);
    expect(stats.last10).toMatchObject({ games: 10, pts: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21].reduce((a, b) => a + b, 0) });
  });

  it("uses only games strictly before the matchup: the same day, the target game id and later games never enter the window", () => {
    const history = [...run(3), game("2026-27", "2026-11-10", { pts: 99 }), game("2026-27", "2026-11-12", { pts: 99 }), game("2026-27", "2026-11-05", { gameId: "target", pts: 99 })];
    expect(seasonStatsFor(history, target).last5).toMatchObject({ games: 3, pts: 10 + 11 + 12 });
  });

  it("skips did-not-play and zero-minute games rather than counting them as zeros or as window slots", () => {
    const history = [...run(6), game("2026-27", "2026-10-30", { minutes: 0, pts: 0 }), game("2026-27", "2026-10-31", { minutes: Number.NaN, pts: 50 }), game("2026-27", "2026-11-01", { minutes: -2, pts: 50 })];
    // Still the last five PLAYED games: points 11..15.
    expect(seasonStatsFor(history, target).last5).toEqual({ games: 5, minutes: 150, pts: 11 + 12 + 13 + 14 + 15, reb: 3 + 4 + 5 + 6 + 7, ast: 2 + 3 + 4 + 5 + 6 });
  });

  it("reports a short window honestly early in the season and never reaches into last season to fill it", () => {
    const history = [...run(3), game("2025-26", "2026-03-01", { pts: 99 }), game("2025-26", "2026-03-03", { pts: 99 })];
    const stats = seasonStatsFor(history, target);
    expect(stats.last5).toMatchObject({ games: 3, pts: 10 + 11 + 12 });
    expect(stats.last10?.games).toBe(3);
  });

  it("is null before the player's first game this season and for a player with no rows", () => {
    expect(seasonStatsFor([game("2025-26", "2026-03-01")], target)).toMatchObject({ last5: null, last10: null });
    expect(seasonStatsFor([], target)).toMatchObject({ last5: null, last10: null });
  });

  it("leaves preseason out of the window", () => {
    const history = [...run(2), game("2026-27", "2026-10-25", { seasonType: "preseason", pts: 99 })];
    expect(seasonStatsFor(history, target).last5).toMatchObject({ games: 2, pts: 10 + 11 });
  });

  it("is unchanged when later games are rewritten or deleted", () => {
    const early = run(7);
    const later = [game("2026-27", "2026-11-12", { pts: 80, minutes: 48 }), game("2026-27", "2026-12-01", { pts: 80 })];
    expect(seasonStatsFor([...early, ...later], target).last5).toEqual(seasonStatsFor(early, target).last5);
  });
});

describe("seasonStatsFor: the last ten games one by one", () => {
  const run = (n: number, over: Partial<NbaPlayerGame> = {}): NbaPlayerGame[] =>
    Array.from({ length: n }, (_, i) => game("2026-27", `2026-10-${String(10 + i).padStart(2, "0")}`, { pts: 10 + i, reb: 2 + i, ast: 1 + i, opponentAbbr: i % 2 ? "MIA" : "NYK", isHome: i % 2 === 0, ...over }));

  it("lists the ten most recent games oldest to newest, each with its own result, date, opponent and venue", () => {
    const { recentGames } = seasonStatsFor([...run(12)].reverse(), target);
    expect(recentGames).toHaveLength(10);
    expect(recentGames?.map((g) => g.pts)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(recentGames?.[0]).toEqual({ date: "2026-10-12", opponent: "NYK", isHome: true, minutes: 30, pts: 12, reb: 4, ast: 3 });
    expect(recentGames?.[1]).toMatchObject({ opponent: "MIA", isHome: false });
  });

  it("agrees with the last-ten totals it sits beside", () => {
    const stats = seasonStatsFor(run(12), target);
    expect(stats.recentGames?.reduce((sum, g) => sum + g.pts, 0)).toBe(stats.last10?.pts);
    expect(stats.recentGames?.reduce((sum, g) => sum + g.minutes, 0)).toBe(stats.last10?.minutes);
  });

  it("shows the real sample when fewer than ten games exist, without reaching into last season", () => {
    const stats = seasonStatsFor([...run(3), game("2025-26", "2026-03-01", { pts: 99 })], target);
    expect(stats.recentGames?.map((g) => g.pts)).toEqual([10, 11, 12]);
  });

  it("uses only games before the matchup and skips did-not-play and zero-minute games", () => {
    const history = [...run(4), game("2026-27", "2026-10-30", { minutes: 0, pts: 0 }), game("2026-27", "2026-11-10", { pts: 99 }), game("2026-27", "2026-11-11", { pts: 99 }), game("2026-27", "2026-11-03", { gameId: "target", pts: 99 })];
    expect(seasonStatsFor(history, target).recentGames?.map((g) => g.pts)).toEqual([10, 11, 12, 13]);
  });

  it("is an empty list, not missing, for a player with no game this season", () => {
    expect(seasonStatsFor([game("2025-26", "2026-03-01")], target).recentGames).toEqual([]);
  });
});

/** The fixture league labelled as hoopR/ESPN data, which the registry allows for private research only. */
const inputs = (sourceId: string) =>
  buildV1Inputs({
    generatedAtUtc: FIXTURE_BUILD_AT,
    imported: parsePlayerGameImport(fixtureImportFile({ sourceId })),
    positions: buildEstimateSet([fixturePositionsFile("2025-26"), fixturePositionsFile("2026-27")]),
    slate: parseSlate(fixtureSlateFile()),
  });
const keyFor = (name: string) => `${FIXTURE_GAME_KEY}|${normalizePlayerName(name)}`;

describe("season statistics in the V1 build and the private preview", () => {
  const built = inputs("hoopr-espn");

  it("computes each projected player's figures from the import, with this season and last season apart", () => {
    const bos1 = built.seasonStats[keyFor("Demo Player BOS 1")];
    const rows = fixtureRows().filter((r) => r.playerId === "BOS-1");
    const current = rows.filter((r) => r.season === "2026-27");
    const previous = rows.filter((r) => r.season === "2025-26");
    expect(bos1.current).toEqual({ season: "2026-27", games: current.length, minutes: current.reduce((s, r) => s + r.minutes, 0), pts: current.reduce((s, r) => s + r.pts, 0), reb: current.reduce((s, r) => s + r.reb, 0), ast: current.reduce((s, r) => s + r.ast, 0) });
    expect(bos1.previous).toEqual({ season: "2025-26", games: previous.length, minutes: previous.reduce((s, r) => s + r.minutes, 0), pts: previous.reduce((s, r) => s + r.pts, 0), reb: previous.reduce((s, r) => s + r.reb, 0), ast: previous.reduce((s, r) => s + r.ast, 0) });
    expect(bos1.current?.games).toBe(2);
    expect(bos1.previous?.games).toBe(12);
  });

  it("attaches the figures to every private preview entry for that player, in every market", () => {
    const { artifact } = buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp, seasonStats: built.seasonStats });
    const entries = artifact.entries.filter((e) => e.playerName === "Demo Player BOS 1");
    expect(entries.map((e) => e.market).sort()).toEqual(["ast", "pts", "reb"]);
    for (const e of entries) expect(e.seasonStats).toEqual(built.seasonStats[keyFor("Demo Player BOS 1")]);
    expect(artifact.entries.every((e) => e.seasonStats !== undefined)).toBe(true);
    expect(artifact.entries.every((e) => e.line === null)).toBe(true);
  });

  it("builds each projected player's ten game-by-game results and the opponent windows from the same import", () => {
    const bos1 = built.seasonStats[keyFor("Demo Player BOS 1")];
    const own = fixtureRows().filter((r) => r.playerId === "BOS-1" && r.season === "2026-27");
    expect(bos1.recentGames).toHaveLength(own.length);
    expect(bos1.recentGames?.map((g) => g.date)).toEqual(own.map((r) => r.gameDate).sort());
    // The opponent's window counts the defense's own games: BOS-1 faces NYK, and NYK has played this season's rounds.
    const sequence = built.opponentRecent[`${FIXTURE_GAME_KEY}|NYK|PG`];
    expect(sequence).toMatchObject({ team: "NYK", position: "PG", season: "2026-27", seasonGames: 2 });
    expect(sequence.games).toHaveLength(2);
    expect(built.opponentRecent[`${FIXTURE_GAME_KEY}|BOS|C`]).toBeDefined();
  });

  it("reconciles to the DvP rows built from the same import: summed over every game, the listed players are the DvP numerator", () => {
    const dvp = buildDvpRows(built.dvp?.lines ?? []).rows;
    for (const team of ["NYK", "BOS"]) {
      const games = built.opponentBoxScores[`${FIXTURE_GAME_KEY}|${team}`];
      for (const position of DVP_POSITIONS) {
        for (const [statistic, key] of [["PTS", "pts"], ["REB", "reb"], ["AST", "ast"]] as const) {
          const row = dvp.find((r) => r.season === "2026-27" && r.opponentTeam === team && r.position === position && r.statistic === statistic);
          // Every completed game of the season is in the window here, so the two cover the same games.
          expect(row?.gamesSampled, `${team} games`).toBe(games.length);
          const listed = games.flatMap((g) => g.players).filter((p) => p.position === position).reduce((sum, p) => sum + p[key], 0);
          expect(listed, `${team} ${position} ${statistic}`).toBeCloseTo((row?.allowedPerGame ?? NaN) * (row?.gamesSampled ?? NaN), 6);
        }
      }
    }
  });

  it("puts the opponent windows on the private preview board, even when empty, and only there", () => {
    const withWindows = buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp, opponentRecent: built.opponentRecent });
    expect(Object.keys(withWindows.artifact.opponentRecent ?? {})).toEqual(Object.keys(built.opponentRecent));
    expect(buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp, opponentRecent: {} }).artifact.opponentRecent).toEqual({});
    expect("opponentRecent" in buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp }).artifact).toBe(false);
  });

  it("builds the opposing players behind those windows from the same import, and puts them on the private board only", () => {
    const boxes = built.opponentBoxScores[`${FIXTURE_GAME_KEY}|NYK`];
    expect(boxes).toHaveLength(2);
    // The defense is NYK, so the listed players belong to whoever NYK played, never to NYK itself.
    expect(boxes.every((g) => g.versus !== "NYK" && g.players.length > 0)).toBe(true);
    expect(boxes.map((g) => g.date)).toEqual(built.opponentRecent[`${FIXTURE_GAME_KEY}|NYK|PG`].games.map((g) => g.date));
    const withBoxes = buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp, opponentBoxScores: built.opponentBoxScores });
    expect(Object.keys(withBoxes.artifact.opponentBoxScores ?? {})).toEqual(Object.keys(built.opponentBoxScores));
    expect("opponentBoxScores" in buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp }).artifact).toBe(false);
  });

  it("adds nothing when no season statistics are supplied", () => {
    const { artifact } = buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp });
    expect(artifact.entries.some((e) => "seasonStats" in e)).toBe(false);
  });

  it("does not decide publication: a source with public rights still builds the local file, and the publish-time gate decides what is shown", () => {
    const publishable = inputs("balldontlie");
    expect(() => buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: publishable.projections, roster: publishable.roster, dvp: publishable.dvp, seasonStats: publishable.seasonStats, licenses: { ...SOURCE_LICENSES, balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "fictional test agreement", reviewedOn: "2026-10-23" } } })).not.toThrow();
  });
});

describe("the public board never carries season statistics", () => {
  const LICENSED: Record<NbaSourceId, SourceLicense> = {
    ...SOURCE_LICENSES,
    balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "fictional test agreement", reviewedOn: "2026-10-23" },
  };

  it("builds entries from a licensed source without the seasonStats field, although the V1 build computed it", () => {
    const licensed = inputs("balldontlie");
    expect(Object.keys(licensed.seasonStats).length).toBeGreaterThan(0);
    const { artifact } = assembleBoard({ generatedAtUtc: FIXTURE_BUILD_AT, snapshots: [], projections: licensed.projections, roster: licensed.roster, dvp: licensed.dvp, sourceLicenses: LICENSED });
    expect(artifact.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(artifact)).not.toContain("seasonStats");
    expect(JSON.stringify(artifact)).not.toContain("recentGames");
    expect(JSON.stringify(artifact)).not.toContain("opponentRecent");
    expect(JSON.stringify(artifact)).not.toContain("opponentBoxScores");
    expect(artifact.entries.some((e) => "seasonStats" in e)).toBe(false);
  });

  it("does not put season statistics in the projection records the public builder receives", () => {
    const licensed = inputs("balldontlie");
    expect(JSON.stringify(licensed.projections)).not.toContain("seasonStats");
  });
});

describe("seasonStatsFor: the final score on each of the player's ten games", () => {
  const scores: GameScores = new Map([
    ["2026-27|2026-27-2026-10-22", { BOS: 110, NYK: 101 }],
    ["2026-27|2026-27-2026-10-25", { BOS: 99, NYK: 105 }],
  ]);
  const history = [game("2026-27", "2026-10-22"), game("2026-27", "2026-10-25"), game("2026-27", "2026-10-28")];

  it("attaches the result from the player's side where the score is known, and leaves it off where it is not", () => {
    const games = seasonStatsFor(history, target, scores).recentGames ?? [];
    expect(games.map((g) => g.result)).toEqual([{ won: true, teamPts: 110, opponentPts: 101 }, { won: false, teamPts: 99, opponentPts: 105 }, undefined]);
    expect("result" in games[2]).toBe(false);
  });

  it("is unchanged when no scores are supplied", () => {
    expect(seasonStatsFor(history, target).recentGames?.every((g) => !("result" in g))).toBe(true);
  });
});
