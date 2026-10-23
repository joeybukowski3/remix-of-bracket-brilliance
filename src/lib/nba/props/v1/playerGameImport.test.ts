import { describe, expect, it } from "vitest";
import { fixtureImportFile, fixtureRows } from "../__fixtures__/v1Fixtures";
import { parsePlayerGameImport, playerGamesFromCsv, PLAYER_GAMES_SCHEMA } from "./playerGameImport";

const row = (over: Record<string, unknown> = {}) => ({
  season: "2026-27", seasonType: "regular", gameId: "g1", gameDate: "2026-10-20", team: "BOS", opponent: "NYK", isHome: true,
  playerId: "p1", playerName: "Demo One", minutes: 30, pts: 15, reb: 6, ast: 3, ...over,
});
const awayRow = (over: Record<string, unknown> = {}) => row({ team: "NYK", opponent: "BOS", isHome: false, playerId: "p2", playerName: "Demo Two", ...over });
const file = (rows: unknown[], source: Record<string, unknown> = {}) => ({
  schemaVersion: PLAYER_GAMES_SCHEMA,
  source: { sourceId: "balldontlie", retrievedAtUtc: "2026-10-23T12:00:00Z", provenance: "invented for tests; not a real export", ...source },
  rows,
});

describe("parsePlayerGameImport", () => {
  it("accepts the invented league and keeps the source record", () => {
    const imported = parsePlayerGameImport(fixtureImportFile());
    expect(imported.rows).toHaveLength(fixtureRows().length);
    expect(imported).toMatchObject({ sourceId: "balldontlie", retrievedAtUtc: "2026-10-23T12:00:00Z" });
  });

  it("canonicalizes team aliases and keeps string player ids", () => {
    const imported = parsePlayerGameImport(file([row({ team: "PHO", opponent: "NY", playerId: "x-1" }), awayRow({ team: "NY", opponent: "PHO" })]));
    expect(imported.rows.map((r) => [r.team, r.opponent, r.playerId])).toEqual([["PHX", "NYK", "x-1"], ["NYK", "PHX", "p2"]]);
  });

  it.each([
    ["an unknown team", [row({ team: "XXX" }), awayRow()]],
    ["a team playing itself", [row({ opponent: "BOS" })]],
    ["negative points", [row({ pts: -1 }), awayRow()]],
    ["fractional rebounds", [row({ reb: 6.5 }), awayRow()]],
    ["more than 70 minutes", [row({ minutes: 71 }), awayRow()]],
    ["a malformed date", [row({ gameDate: "10/20/2026" }), awayRow()]],
    ["an unknown season type", [row({ seasonType: "exhibition" }), awayRow()]],
    ["an unsupported season", [row({ season: "2024-25" }), awayRow()]],
    ["a duplicate player-game", [row(), row(), awayRow()]],
    ["two teams that both claim to be home", [row(), awayRow({ isHome: true })]],
    ["a game with three teams", [row(), awayRow(), row({ team: "MIA", opponent: "BOS", playerId: "p3", isHome: false })]],
    ["rows of one game on different dates", [row(), awayRow({ gameDate: "2026-10-21" })]],
    ["an opponent who is not in the game", [row(), awayRow({ opponent: "MIA" })]],
  ])("rejects the whole file for %s", (_name, rows) => {
    expect(() => parsePlayerGameImport(file(rows))).toThrow();
  });

  it("does not drop or repair a bad row: one bad row among good ones fails everything", () => {
    expect(() => parsePlayerGameImport(file([row(), awayRow(), row({ gameId: "g2", team: "XXX" })]))).toThrow(/unknown team/);
  });

  it("requires a registered source id, a UTC retrieval time and a stated provenance", () => {
    expect(() => parsePlayerGameImport(file([row(), awayRow()], { sourceId: "my-spreadsheet" }))).toThrow();
    expect(() => parsePlayerGameImport(file([row(), awayRow()], { retrievedAtUtc: "yesterday" }))).toThrow();
    expect(() => parsePlayerGameImport(file([row(), awayRow()], { provenance: "" }))).toThrow();
  });
});

describe("season, date and game consistency", () => {
  it("rejects rows whose date falls outside their season's window, so a mislabelled season cannot take another season's positions", () => {
    expect(() => parsePlayerGameImport(file([row({ season: "2026-27", gameDate: "2025-11-04" }), awayRow({ season: "2026-27", gameDate: "2025-11-04" })]))).toThrow(/outside the 2026-27 season window/);
    expect(() => parsePlayerGameImport(file([row({ season: "2025-26", gameDate: "2026-10-20" }), awayRow({ season: "2025-26", gameDate: "2026-10-20" })], { retrievedAtUtc: "2026-10-23T12:00:00Z" }))).toThrow(/outside the 2025-26 season window/);
  });

  it("rejects an impossible calendar date", () => {
    expect(() => parsePlayerGameImport(file([row({ gameDate: "2026-02-31" }), awayRow({ gameDate: "2026-02-31" })]))).toThrow(/not a real calendar date/);
  });

  it("rejects games dated after the data was retrieved", () => {
    expect(() => parsePlayerGameImport(file([row({ gameDate: "2026-10-24" }), awayRow({ gameDate: "2026-10-24" })]))).toThrow(/after the data was retrieved/);
  });

  it("accepts a game played on the retrieval day", () => {
    expect(parsePlayerGameImport(file([row({ gameDate: "2026-10-23" }), awayRow({ gameDate: "2026-10-23" })])).rows).toHaveLength(2);
  });

  it("rejects a retrieval time that matches the pattern but is not a real instant", () => {
    expect(() => parsePlayerGameImport(file([row(), awayRow()], { retrievedAtUtc: "2026-99-99T99:99:99Z" }))).toThrow(/real ISO UTC instant/);
  });

  it("rejects a game with rows from only one team, whose defense-side lines would have no known opponent", () => {
    expect(() => parsePlayerGameImport(file([row()]))).toThrow(/needs rows from exactly two teams, found 1/);
    expect(() => parsePlayerGameImport(file([row(), row({ playerId: "p9", opponent: "MIA", isHome: false })]))).toThrow(/rows disagree on the opponent|needs rows from exactly two teams/);
  });

  it("rejects one team's rows disagreeing on home or away", () => {
    expect(() => parsePlayerGameImport(file([row(), row({ playerId: "p9", isHome: false }), awayRow()]))).toThrow(/BOS rows disagree on home or away/);
  });

  it("rejects two teams that do not list each other as opponent", () => {
    expect(() => parsePlayerGameImport(file([row(), awayRow({ opponent: "MIA" })]))).toThrow(/not each other's listed opponent/);
  });
});

describe("playerGamesFromCsv", () => {
  const header = "season,seasonType,gameId,gameDate,team,opponent,isHome,playerId,playerName,minutes,pts,reb,ast";
  const source = { sourceId: "balldontlie" as const, retrievedAtUtc: "2026-10-23T12:00:00Z", provenance: "invented CSV for tests, not real" };

  it("reads decimal and mm:ss minutes and true/false home flags", () => {
    const csv = [header, "2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,Demo One,30:30,15,6,3", '2026-27,regular,g1,2026-10-20,NYK,BOS,false,p2,"Demo, Two",28.5,10,4,2'].join("\r\n");
    const imported = playerGamesFromCsv(csv, source);
    expect(imported.rows.map((r) => [r.playerName, r.minutes, r.isHome])).toEqual([["Demo One", 30.5, true], ["Demo, Two", 28.5, false]]);
  });

  it("takes the source record from outside the CSV, so a spreadsheet cannot choose its own license", () => {
    const csv = [`${header},sourceid`, "2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,Demo One,30,15,6,3,synthetic", "2026-27,regular,g1,2026-10-20,NYK,BOS,false,p2,Demo Two,30,15,6,3,synthetic"].join("\n");
    expect(playerGamesFromCsv(csv, source).sourceId).toBe("balldontlie");
  });

  it.each([
    ["a missing column", header.replace(",ast", "") + "\n2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,A,30,15,6"],
    ["a non-numeric stat", [header, "2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,A,30,n/a,6,3"].join("\n")],
    ["an unreadable home flag", [header, "2026-27,regular,g1,2026-10-20,BOS,NYK,maybe,p1,A,30,15,6,3"].join("\n")],
    ["an unknown season type", [header, "2026-27,friendly,g1,2026-10-20,BOS,NYK,true,p1,A,30,15,6,3"].join("\n")],
    ["a ragged row", [header, "2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,A,30,15,6"].join("\n")],
  ])("rejects %s", (_name, csv) => {
    expect(() => playerGamesFromCsv(csv, source)).toThrow();
  });

  it.each([
    ["minutes with more than 59 seconds", "12:99", "15", /more than 59 seconds/],
    ["hexadecimal points", "30", "0x10", /pts is not a plain non-negative number/],
    ["exponent points", "30", "1e1", /pts is not a plain non-negative number/],
    ["negative minutes", "-5", "15", /minutes is not a plain non-negative number/],
    ["blank points", "30", " ", /pts is not a plain non-negative number/],
  ])("rejects %s with a reason that names the problem", (_name, minutes, pts, message) => {
    const csv = [header, `2026-27,regular,g1,2026-10-20,BOS,NYK,true,p1,Demo One,${minutes},${pts},6,3`, "2026-27,regular,g1,2026-10-20,NYK,BOS,false,p2,Demo Two,30,15,6,3"].join("\n");
    expect(() => playerGamesFromCsv(csv, source)).toThrow(message);
  });
});
