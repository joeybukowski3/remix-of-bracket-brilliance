import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "./__fixtures__/boardDemo";
import { appliedMinutes, playerOverrideKey } from "./minutesOverride";
import { buildBoardRows, containsPrivateData, sortBoardRows, type BoardRow, type PropsBoardArtifact } from "./propsBoard";

const board: PropsBoardArtifact = buildDemoBoard();
const byName = (rows: readonly BoardRow[], name: string): BoardRow => rows.find((r) => r.entry.playerName === name) as BoardRow;
const minutesFor = (name: string, text: string) => appliedMinutes({ [playerOverrideKey({ gameKey: board.entries[0].gameKey, playerName: name })]: text });

describe("buildBoardRows with no override", () => {
  const rows = buildBoardRows(board, "pts");

  it("leaves every override field empty and fills the JKB figures exactly as before", () => {
    for (const r of rows) {
      expect(r.override).toEqual({ userMinutes: null, adjustedProjection: null, adjustedDifference: null, seasonRateEstimate: null, seasonRateDifference: null });
      expect(r.difference).toBe(r.entry.line && r.entry.projection ? r.entry.projection.value - r.entry.line.line : null);
    }
  });

  it("carries each player's JKB projection in all three markets, whichever market is shown", () => {
    const guard = byName(rows, "Demo Guard One");
    expect(guard.jkbTriple).toEqual({ pts: 26.1, reb: 3.8, ast: 9.4 });
    expect(byName(buildBoardRows(board, "ast"), "Demo Guard One").jkbTriple).toEqual({ pts: 26.1, reb: 3.8, ast: 9.4 });
    expect(byName(rows, "Demo Wing Six").jkbTriple).toEqual({ pts: null, reb: null, ast: null });
  });

  it("derives season columns only for players that have season statistics", () => {
    expect(byName(rows, "Demo Guard One").season?.current).toMatchObject({ season: "2026-27", games: 24 });
    expect(byName(rows, "Demo Bench Seven").season).toBeNull();
  });
});

describe("buildBoardRows with a minutes override", () => {
  const rows = buildBoardRows(board, "pts", minutesFor("Demo Guard One", "36"));
  const guard = byName(rows, "Demo Guard One");

  it("scales the JKB projection by user minutes over JKB minutes, and keeps the original untouched", () => {
    expect(guard.entry.projection).toEqual({ value: 26.1, minutes: 34, modelVersion: "synthetic-demo" });
    expect(guard.override.userMinutes).toBe(36);
    expect(guard.override.adjustedProjection).toBeCloseTo((26.1 * 36) / 34, 12);
  });

  it("recalculates the line difference for the adjusted projection and keeps the JKB difference separately", () => {
    expect(guard.difference).toBeCloseTo(26.1 - 24.5, 12);
    expect(guard.override.adjustedDifference).toBeCloseTo((26.1 * 36) / 34 - 24.5, 12);
    expect(guard.override.adjustedDifference).not.toBeCloseTo(guard.difference as number, 3);
  });

  it("computes the season-rate estimate from this season's per-minute rate, apart from the adjusted projection", () => {
    const current = guard.season?.current;
    expect(current?.ptsPerMinute).toBeCloseTo((24 * 25.4) / (24 * 33.8), 6);
    expect(guard.override.seasonRateEstimate).toBeCloseTo(36 * ((current?.ptsPerMinute as number) ?? 0), 12);
    expect(guard.override.seasonRateEstimate).not.toBeCloseTo(guard.override.adjustedProjection as number, 2);
    expect(guard.override.seasonRateDifference).toBeCloseTo((guard.override.seasonRateEstimate as number) - 24.5, 12);
  });

  it("changes only the player overridden", () => {
    for (const r of rows.filter((x) => x.entry.playerName !== "Demo Guard One")) expect(r.override.userMinutes).toBeNull();
  });

  it("does not mutate the artifact it was built from", () => {
    expect(buildDemoBoard()).toEqual(board);
  });

  it("follows the player across markets, using each market's own projection, line and per-minute rate", () => {
    const minutes = minutesFor("Demo Guard One", "36");
    const reb = byName(buildBoardRows(board, "reb", minutes), "Demo Guard One");
    expect(reb.override.adjustedProjection).toBeCloseTo((3.8 * 36) / 34, 12);
    expect(reb.override.adjustedDifference).toBeCloseTo((3.8 * 36) / 34 - 3.5, 12);
    expect(reb.override.seasonRateEstimate).toBeCloseTo(36 * ((24 * 3.9) / (24 * 33.8)), 6);
    const ast = byName(buildBoardRows(board, "ast", minutes), "Demo Guard One");
    expect(ast.override.adjustedProjection).toBeCloseTo((9.4 * 36) / 34, 12);
    expect(ast.override.seasonRateEstimate).toBeCloseTo(36 * ((24 * 8.6) / (24 * 33.8)), 6);
  });
});

describe("missing values and guards", () => {
  it("gives the season-rate estimate but no adjusted projection to a player with no JKB projection (current season missing, last season only)", () => {
    const six = byName(buildBoardRows(board, "pts", minutesFor("Demo Wing Six", "30")), "Demo Wing Six");
    expect(six.entry.projection).toBeNull();
    expect(six.override.adjustedProjection).toBeNull();
    expect(six.override.adjustedDifference).toBeNull();
    // No games this season yet: the per-minute rate is the current season's, so it is missing rather than borrowed from last season.
    expect(six.season?.current).toBeNull();
    expect(six.season?.previous?.season).toBe("2025-26");
    expect(six.override.seasonRateEstimate).toBeNull();
  });

  it("gives the adjusted projection but no season-rate estimate to a player with no season history", () => {
    const bench = byName(buildBoardRows(board, "pts", minutesFor("Demo Bench Seven", "20")), "Demo Bench Seven");
    expect(bench.season).toBeNull();
    expect(bench.override.adjustedProjection).toBeCloseTo((9.1 * 20) / 14, 12);
    expect(bench.override.seasonRateEstimate).toBeNull();
    expect(bench.override.adjustedDifference).toBeNull();
  });

  it("returns no adjusted value for a zero or missing JKB minutes denominator", () => {
    const zero: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Guard One" && e.projection ? { ...e, projection: { ...e.projection, minutes: 0 } } : e)) };
    const row = byName(buildBoardRows(zero, "pts", minutesFor("Demo Guard One", "30")), "Demo Guard One");
    expect(row.override.adjustedProjection).toBeNull();
    expect(row.override.seasonRateEstimate).not.toBeNull();
    const none: PropsBoardArtifact = { ...board, entries: board.entries.map((e) => (e.playerName === "Demo Guard One" && e.projection ? { ...e, projection: { ...e.projection, minutes: null } } : e)) };
    expect(byName(buildBoardRows(none, "pts", minutesFor("Demo Guard One", "30")), "Demo Guard One").override.adjustedProjection).toBeNull();
  });

  it("applies no override for invalid minutes", () => {
    const rows = buildBoardRows(board, "pts", minutesFor("Demo Guard One", "99"));
    expect(byName(rows, "Demo Guard One").override.userMinutes).toBeNull();
  });
});

describe("sorting by the new columns", () => {
  const names = (rows: readonly BoardRow[]) => rows.map((r) => r.entry.playerName);

  it("sorts by season minutes, points and per-minute rates with missing values last, in either direction", () => {
    const rows = buildBoardRows(board, "pts");
    const mpg = names(sortBoardRows(rows, "seasonMpg", "desc"));
    expect(mpg[0]).toBe("Demo Guard One");
    expect(mpg.slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    expect(names(sortBoardRows(rows, "seasonMpg", "asc")).slice(-2)).toEqual(expect.arrayContaining(["Demo Bench Seven", "Demo Wing Six"]));
    expect(names(sortBoardRows(rows, "seasonPpg", "desc"))[0]).toBe("Demo Guard One");
    const perMinute = sortBoardRows(rows, "seasonPtsPerMinute", "desc");
    const values = perMinute.map((r) => r.season?.current?.ptsPerMinute ?? null).filter((v): v is number => v !== null);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("sorts the market's own per-game figure: rebounds per game in the rebounds view", () => {
    const rows = buildBoardRows(board, "reb");
    expect(names(sortBoardRows(rows, "seasonStatPerGame", "desc"))[0]).toBe("Demo Big Four");
    expect(names(sortBoardRows(rows, "seasonStatPerMinute", "desc"))[0]).toBe("Demo Big Four");
    expect(names(sortBoardRows(buildBoardRows(board, "ast"), "seasonStatPerGame", "desc"))[0]).toBe("Demo Guard One");
  });

  it("sorts by JKB minutes, and by adjusted values and your minutes only among rows with an override", () => {
    const minutes = new Map([...minutesFor("Demo Guard One", "40"), ...minutesFor("Demo Big Four", "10")]);
    const rows = buildBoardRows(board, "pts", minutes);
    expect(names(sortBoardRows(rows, "jkbMinutes", "desc"))[0]).toBe("Demo Guard One");
    const adjusted = sortBoardRows(rows, "adjustedProjection", "desc");
    expect(names(adjusted).slice(0, 2)).toEqual(["Demo Guard One", "Demo Big Four"]);
    expect(adjusted.slice(2).every((r) => r.override.adjustedProjection === null)).toBe(true);
    expect(names(sortBoardRows(rows, "userMinutes", "asc")).slice(0, 2)).toEqual(["Demo Big Four", "Demo Guard One"]);
    expect(names(sortBoardRows(rows, "adjustedDifference", "desc"))[0]).toBe("Demo Guard One");
    expect(names(sortBoardRows(rows, "seasonRateEstimate", "desc"))[0]).toBe("Demo Guard One");
  });

  it("does not change the input order", () => {
    const rows = buildBoardRows(board, "pts");
    const before = names(rows);
    sortBoardRows(rows, "seasonMpg", "desc");
    expect(names(rows)).toEqual(before);
  });
});

describe("containsPrivateData: what the public page refuses at run time", () => {
  it("flags a board with season statistics or a private-preview notice, and passes a plain board", () => {
    expect(containsPrivateData(board)).toBe(true);
    const noStats: PropsBoardArtifact = { ...board, entries: board.entries.map(({ seasonStats: _removed, ...entry }) => entry) };
    expect(containsPrivateData(noStats)).toBe(false);
    expect(containsPrivateData({ ...noStats, privatePreview: { notice: "PRIVATE PREVIEW", attribution: "Data: hoopR" } })).toBe(true);
    const oneEntry: PropsBoardArtifact = { ...noStats, entries: noStats.entries.map((e, i) => (i === 0 ? { ...e, seasonStats: { current: null, previous: null } } : e)) };
    expect(containsPrivateData(oneEntry)).toBe(true);
    expect(containsPrivateData({ ...noStats, entries: [] })).toBe(false);
  });
});
