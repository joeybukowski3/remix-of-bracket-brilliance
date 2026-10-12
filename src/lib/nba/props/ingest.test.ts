import { describe, expect, it } from "vitest";
import { parseStatsNbaResultSets } from "./ingest/statsNbaPayload";
import { normalizePlayerGameLogs, parseMatchup, parseMinSec } from "./normalize";
import { gameIdMatches, parseGameId, previousSeason, seasonStartYear } from "./seasonType";
import { playerResultSet, rawPlayerRow } from "./__fixtures__/synthetic";

describe("season types", () => {
  it("parses season strings and rejects malformed ones", () => {
    expect(seasonStartYear("2024-25")).toBe(2024);
    expect(seasonStartYear("1999-00")).toBe(1999);
    expect(previousSeason("2000-01")).toBe("1999-00");
    expect(() => seasonStartYear("2024-26")).toThrow(/end year/);
    expect(() => seasonStartYear("2024")).toThrow(/YYYY-YY/);
  });

  it("derives the season type from the GAME_ID prefix", () => {
    expect(parseGameId("0012400001").seasonType).toBe("preseason");
    expect(parseGameId("0022400001").seasonType).toBe("regular");
    expect(parseGameId("0042400101").seasonType).toBe("playoffs");
    expect(parseGameId("0052400101").seasonType).toBe("play_in");
    expect(parseGameId("0062400001").seasonType).toBeNull();
    expect(gameIdMatches("0022400001", "2024-25", "regular")).toBe(true);
    expect(gameIdMatches("0022400001", "2023-24", "regular")).toBe(false);
    expect(gameIdMatches("0042400101", "2024-25", "regular")).toBe(false);
  });
});

describe("stats.nba.com payload parsing", () => {
  it("rejects payloads without result sets", () => {
    expect(() => parseStatsNbaResultSets("{}")).toThrow(/no resultSets/);
    expect(() => parseStatsNbaResultSets(JSON.stringify({ resultSets: [{ name: "x" }] }))).toThrow(/missing headers/);
  });
});

describe("normalizePlayerGameLogs", () => {
  const ctx = { snapshotId: "snap-1", season: "2024-25", seasonType: "regular" as const };

  it("parses matchups and MIN_SEC, including the source's mm:60 quirk", () => {
    expect(parseMatchup("DEN vs. LAC")).toEqual({ teamAbbr: "DEN", opponentAbbr: "LAC", isHome: true });
    expect(parseMatchup("LAC @ DEN")).toEqual({ teamAbbr: "LAC", opponentAbbr: "DEN", isHome: false });
    expect(parseMatchup("garbage")).toBeNull();
    expect(parseMinSec("31:60")).toBeCloseTo(32);
    expect(parseMinSec(null)).toBeNull();
  });

  it("normalizes a valid row using decimal MIN, without a MIN_SEC warning for mm:60", () => {
    const { rows, issues } = normalizePlayerGameLogs(playerResultSet([rawPlayerRow()]), ctx);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 1, gameDate: "2024-11-01", minutes: 31.99, isHome: true, opponentAbbr: "BBB", pts: 15, sourceSnapshotId: "snap-1" });
  });

  it("rejects rows whose GAME_ID contradicts the requested season type", () => {
    const { rows, issues } = normalizePlayerGameLogs(playerResultSet([rawPlayerRow({ GAME_ID: "0042400101" })]), ctx);
    expect(rows).toHaveLength(0);
    expect(issues[0]).toMatchObject({ code: "season_type_mismatch", severity: "error" });
  });

  it("rejects negative or missing stats and out-of-range minutes", () => {
    const { rows, issues } = normalizePlayerGameLogs(
      playerResultSet([rawPlayerRow({ PTS: -1 }), rawPlayerRow({ AST: null }), rawPlayerRow({ MIN: 75, MIN_SEC: "75:00" })]),
      ctx,
    );
    expect(rows).toHaveLength(0);
    expect(issues.map((issue) => issue.code)).toEqual(["invalid_stat", "invalid_stat", "invalid_minutes"]);
  });

  it("warns when REB disagrees with OREB + DREB or MIN disagrees with MIN_SEC", () => {
    const { rows, issues } = normalizePlayerGameLogs(playerResultSet([rawPlayerRow({ REB: 9 }), rawPlayerRow({ MIN_SEC: "20:00" })]), ctx);
    expect(rows).toHaveLength(2);
    expect(issues.map((issue) => [issue.code, issue.severity])).toEqual([
      ["reb_component_mismatch", "warning"],
      ["min_sec_disagrees", "warning"],
    ]);
  });

  it("throws on schema drift instead of producing partial rows", () => {
    const headers = ["PLAYER_ID", "GAME_ID"];
    expect(() => normalizePlayerGameLogs(playerResultSet([[1, "0022400001"]], headers), ctx)).toThrow(/schema drift/);
  });
});
