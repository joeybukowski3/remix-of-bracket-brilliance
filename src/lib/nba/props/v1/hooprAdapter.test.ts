import { describe, expect, it } from "vitest";
import { HOOPR_SEASONS, hooprProvenance, normalizeHooprPlayerBox, type HooprManifestInfo, type HooprPlayerBoxRow } from "./hooprAdapter";

const MANIFEST: HooprManifestInfo = {
  commit: "0123456789abcdef0123456789abcdef01234567",
  retrievedAtUtc: "2026-10-23T19:09:16Z",
  files: [{ name: "player_box_2026", sha256: "a".repeat(64), bytes: 100 }, { name: "player_box_2027", sha256: "b".repeat(64), bytes: 50 }],
};

const row = (over: Partial<HooprPlayerBoxRow> = {}): HooprPlayerBoxRow => ({
  game_id: 401000001, season: 2026, season_type: 2, game_date: "2025-11-01", athlete_id: 1001, athlete_display_name: "Demo Guard One",
  team_abbreviation: "BOS", opponent_team_abbreviation: "NYK", home_away: "home", minutes: 30, points: 20, rebounds: 5, assists: 7,
  starter: true, did_not_play: false, athlete_position_abbreviation: "G", ...over,
});
/** The other team's side of the same game, so a game has two teams. */
const opp = (over: Partial<HooprPlayerBoxRow> = {}) => row({ athlete_id: 2001, athlete_display_name: "Demo Wing Two", team_abbreviation: "NYK", opponent_team_abbreviation: "BOS", home_away: "away", ...over });
const game = (id: number, over: Partial<HooprPlayerBoxRow> = {}) => [row({ game_id: id, ...over }), opp({ game_id: id, ...over, athlete_id: 2001, athlete_display_name: "Demo Wing Two" })];
const run = (rows26: HooprPlayerBoxRow[], rows27: HooprPlayerBoxRow[] = []) =>
  normalizeHooprPlayerBox([{ hooprSeason: 2026, rows: rows26 }, ...(rows27.length ? [{ hooprSeason: 2027, rows: rows27 }] : [])], MANIFEST);

describe("season mapping", () => {
  it("maps hoopR 2026 to 2025-26 and 2027 to 2026-27, and nothing else", () => {
    expect(HOOPR_SEASONS).toEqual({ 2026: "2025-26", 2027: "2026-27" });
    const result = run(game(1), game(2, { season: 2027, game_date: "2026-10-20" }));
    expect(result.imported.rows.map((r) => [r.season, r.gameDate])).toEqual([["2025-26", "2025-11-01"], ["2025-26", "2025-11-01"], ["2026-27", "2026-10-20"], ["2026-27", "2026-10-20"]]);
    expect(result.report.rowsImported).toEqual({ "2025-26": 2, "2026-27": 2 });
    expect(result.report.gamesImported).toEqual({ "2025-26": 1, "2026-27": 1 });
  });

  it("refuses a season that is not in the mapping, and a row whose season disagrees with its file", () => {
    expect(() => normalizeHooprPlayerBox([{ hooprSeason: 2025, rows: [] }], MANIFEST)).toThrow(/not in the mapping/);
    expect(() => normalizeHooprPlayerBox([{ hooprSeason: 2026, rows: [row({ season: 2027 })] }], MANIFEST)).toThrow(/carries season 2027/);
  });

  it("does not let a 2026-27 date sit in a 2025-26 file: the strict import checks the season window", () => {
    expect(() => run(game(1, { game_date: "2026-10-20" }))).toThrow(/outside the 2025-26 season window/);
  });
});

describe("exclusions are explicit and counted, never repaired", () => {
  it("drops did-not-play rows, and rows with no or zero minutes", () => {
    const rows = [...game(1), row({ game_id: 1, athlete_id: 1002, athlete_display_name: "Demo Bench", did_not_play: true, minutes: null }), row({ game_id: 1, athlete_id: 1003, athlete_display_name: "Demo Zero", minutes: 0 }), row({ game_id: 1, athlete_id: 1004, athlete_display_name: "Demo Null", minutes: null })];
    const { imported, report } = run(rows);
    expect(imported.rows.map((r) => r.playerId).sort()).toEqual(["1001", "2001"]);
    expect(report.excluded).toMatchObject({ didNotPlay: 1, noOrZeroMinutes: 2, unusableRows: 0 });
  });

  it("drops All-Star teams (not NBA franchises) and reports their codes", () => {
    const allStar = [row({ game_id: 9, team_abbreviation: "STARS", opponent_team_abbreviation: "STRIPES" }), row({ game_id: 9, athlete_id: 3001, athlete_display_name: "Demo Star", team_abbreviation: "STRIPES", opponent_team_abbreviation: "STARS", home_away: "away" })];
    const { imported, report } = run([...game(1), ...allStar]);
    expect(imported.rows).toHaveLength(2);
    expect(report.excluded.unknownTeam).toBe(2);
    expect(report.excluded.unknownTeamCodes).toEqual(["STARS/STRIPES", "STRIPES/STARS"]);
  });

  it("maps ESPN's abbreviations to canonical franchise codes", () => {
    const rows = [row({ team_abbreviation: "GS", opponent_team_abbreviation: "NO" }), row({ athlete_id: 2001, athlete_display_name: "Demo Wing Two", team_abbreviation: "NO", opponent_team_abbreviation: "GS", home_away: "away" })];
    expect(run(rows).imported.rows.map((r) => [r.team, r.opponent])).toEqual([["GSW", "NOP"], ["NOP", "GSW"]]);
  });

  it("excludes every row of a game that is left with one team, and reports it", () => {
    const oneSided = [row({ game_id: 7 }), row({ game_id: 7, athlete_id: 1005, athlete_display_name: "Demo Two Same Team" })];
    const { imported, report } = run([...game(1), ...oneSided]);
    expect(imported.rows.every((r) => r.gameId === "1")).toBe(true);
    expect(report.excluded.incompleteGames).toBe(1);
    expect(report.excluded.incompleteGameIds).toEqual(["2025-26|7"]);
  });

  it("drops an unrecognised season type and counts rows with missing identity or statistics as unusable", () => {
    const rows = [...game(1), row({ game_id: 1, athlete_id: 1006, athlete_display_name: "Demo Weird", season_type: 4 }), row({ game_id: 1, athlete_id: null, athlete_display_name: "Demo NoId" }), row({ game_id: 1, athlete_id: 1007, athlete_display_name: "Demo NoPts", points: null })];
    const { report } = run(rows);
    expect(report.excluded.unknownSeasonType).toBe(1);
    expect(report.excluded.unusableRows).toBe(2);
  });

  it("treats an athlete id that is not a whole number as unusable, never as a player", () => {
    const rows = [...game(1), row({ game_id: 1, athlete_id: "3934719.5", athlete_display_name: "Demo Float" }), row({ game_id: 1, athlete_id: "abc", athlete_display_name: "Demo Text" }), row({ game_id: 1, athlete_id: "", athlete_display_name: "Demo Blank" })];
    const { imported, report } = run(rows);
    expect(imported.rows.map((r) => r.playerId).sort()).toEqual(["1001", "2001"]);
    expect(report.excluded.unusableRows).toBe(3);
  });

  it("keeps preseason, regular, play-in and playoff types distinct", () => {
    const types = [1, 2, 3, 5].flatMap((t, i) => game(100 + i, { season_type: t, game_date: ["2025-10-10", "2025-11-01", "2026-04-20", "2026-04-15"][i] }));
    expect(run(types).imported.rows.filter((r) => r.team === "BOS").map((r) => r.seasonType)).toEqual(["preseason", "regular", "play_in", "playoffs"]);
  });
});

describe("player identity", () => {
  it("uses the ESPN athlete id as a string, whether it arrives as an integer or a whole float", () => {
    const { imported } = run([row({ athlete_id: 3934719 }), opp({ athlete_id: 4066328.0 as unknown as number })]);
    expect(imported.rows.map((r) => r.playerId).sort()).toEqual(["3934719", "4066328"]);
  });

  it("reports an id seen under two names, and a name shared by two ids, without merging or renaming", () => {
    const rows = [...game(1), ...game(2, { game_date: "2025-11-03", athlete_display_name: "Demo Guard One Jr." }), row({ game_id: 1, athlete_id: 1050, athlete_display_name: "Demo Wing Two" })];
    const { report } = run(rows);
    expect(report.identity.namesChanged).toEqual(["1001: Demo Guard One / Demo Guard One Jr."]);
    expect(report.identity.sharedNames).toEqual(["Demo Wing Two: 1050, 2001"]);
  });

  it("summarizes each player-season: latest team, games, starts, minutes and ESPN's listing", () => {
    const traded = [
      row({ game_id: 3, game_date: "2026-02-01", team_abbreviation: "MIA", opponent_team_abbreviation: "NYK" }),
      opp({ game_id: 3, game_date: "2026-02-01", opponent_team_abbreviation: "MIA" }),
    ];
    const rows = [...game(1), ...game(2, { game_date: "2025-12-01", starter: false, athlete_position_abbreviation: "F" }), ...traded];
    const summary = run(rows).players.find((p) => p.playerId === "1001" && p.season === "2025-26");
    expect(summary).toMatchObject({ name: "Demo Guard One", team: "MIA", games: 3, starts: 2, minutes: 90, espnPositions: { G: 2, F: 1 } });
  });
});

describe("preseason rows do not decide a player's team, role or minutes", () => {
  it("keeps a player on the team of his latest competitive game when a later preseason stint was with another team", () => {
    const regular = game(1, { game_date: "2025-12-01" });
    const preseason = [
      row({ game_id: 50, game_date: "2025-10-05", season_type: 1, team_abbreviation: "MIA", opponent_team_abbreviation: "NYK", minutes: 40 }),
      opp({ game_id: 50, game_date: "2025-10-05", season_type: 1, opponent_team_abbreviation: "MIA" }),
    ];
    const summary = run([...regular, ...preseason]).players.find((p) => p.playerId === "1001");
    expect(summary).toMatchObject({ team: "BOS", games: 1, minutes: 30 });
  });

  it("gives a player with only preseason rows no summary at all", () => {
    const onlyPreseason = [row({ game_id: 60, game_date: "2025-10-05", season_type: 1 }), opp({ game_id: 60, game_date: "2025-10-05", season_type: 1 })];
    expect(run(onlyPreseason).players).toEqual([]);
  });
});

describe("source attribution and rights", () => {
  it("names hoopR, the commit, the file checksums and the unresolved ESPN terms, and does not call the decision ESPN's permission", () => {
    const text = hooprProvenance(MANIFEST);
    expect(text).toContain("hoopR-nba-data");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain(MANIFEST.commit);
    expect(text).toContain("player_box_2026 sha256 aaaaaaaaaaaa");
    expect(text).toMatch(/ESPN's commercial and public reuse terms are unresolved/);
    expect(text).toMatch(/not ESPN permission/);
    expect(text).toMatch(/Changes:/);
  });

  it("labels the import with the hoopr-espn source id and the retrieval time, so the registry decides what it may be used for", () => {
    const { imported } = run(game(1));
    expect(imported.sourceId).toBe("hoopr-espn");
    expect(imported.retrievedAtUtc).toBe("2026-10-23T19:09:16Z");
    expect(imported.provenance).toBe(hooprProvenance(MANIFEST));
  });
});
