import { describe, expect, it } from "vitest";
import { FIXTURE_BUILD_AT, FIXTURE_GAME_KEY, fixtureImportFile, fixturePositionsFile, fixtureRows, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { assembleBoard } from "../pipeline/boardBuild";
import { normalizePlayerName } from "../pipeline/contracts";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import type { NbaPlayerGame } from "../types";
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
    expect(seasonStatsFor(history, target)).toEqual({
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
    expect(seasonStatsFor([], target)).toEqual({ current: null, previous: null });
  });

  it("is unchanged when later games are rewritten or deleted", () => {
    const early = [game("2026-27", "2026-10-22"), game("2026-27", "2026-11-01", { pts: 11 })];
    const later = [game("2026-27", "2026-11-12", { pts: 80, minutes: 48 }), game("2026-27", "2026-12-01", { pts: 80 })];
    expect(seasonStatsFor([...early, ...later], target)).toEqual(seasonStatsFor(early, target));
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

  it("adds nothing when no season statistics are supplied", () => {
    const { artifact } = buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: built.projections, roster: built.roster, dvp: built.dvp });
    expect(artifact.entries.some((e) => "seasonStats" in e)).toBe(false);
  });

  it("still refuses a source that may be published, so season statistics can never ride a public source into a private board", () => {
    const publishable = inputs("balldontlie");
    expect(() => buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: publishable.projections, roster: publishable.roster, dvp: publishable.dvp, seasonStats: publishable.seasonStats, licenses: { ...SOURCE_LICENSES, balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "fictional test agreement", reviewedOn: "2026-10-23" } } })).toThrow(/may be published/);
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
    expect(artifact.entries.some((e) => "seasonStats" in e)).toBe(false);
  });

  it("does not put season statistics in the projection records the public builder receives", () => {
    const licensed = inputs("balldontlie");
    expect(JSON.stringify(licensed.projections)).not.toContain("seasonStats");
  });
});
