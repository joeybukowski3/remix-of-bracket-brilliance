import { describe, expect, it, vi } from "vitest";
import {
  buildTeamAbbrById,
  buildTeamIdByAbbr,
  deriveOpponentGameSummary,
  fetchAllTeams,
  fetchBoxscoreCached,
  fetchOpponentLastFiveGamesDetail,
  fetchPitcherRecentStarts,
  fetchPitcherSeasonStarts,
  fetchTeamRecentCompletedGames,
  normalizePitcherGameLogSplit,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-strikeout-prop-details-fetch.mjs";
import {
  pitcherGameLogResponseFixture,
  pitcherGameLogSplitsFixture,
} from "@/lib/mlb/fixtures/mlbPitcherGameLog.fixture";

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

const TEAMS = [
  { id: 111, abbreviation: "BAL", name: "Baltimore Orioles" },
  { id: 112, abbreviation: "CHC", name: "Chicago Cubs" },
  { id: 147, abbreviation: "NYY", name: "New York Yankees" },
];

describe("fetchAllTeams / team id-abbr maps", () => {
  it("fetches and normalizes the team list", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ teams: TEAMS }));
    const teams = await fetchAllTeams(2026, { fetchImpl });
    expect(teams).toEqual(TEAMS);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("/teams?sportId=1&season=2026"), expect.anything());
  });

  it("builds id->abbr and abbr->id maps", () => {
    const byId = buildTeamAbbrById(TEAMS);
    const byAbbr = buildTeamIdByAbbr(TEAMS);
    expect(byId.get(112)).toBe("CHC");
    expect(byAbbr.get("CHC")).toBe(112);
  });
});

describe("fetchPitcherRecentStarts", () => {
  const teamAbbrById = buildTeamAbbrById(TEAMS);

  it("filters to starts strictly before the slate date, sorts desc, and limits to 5", async () => {
    const splits = [
      { date: "2026-07-08", opponent: { id: 147 }, stat: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 6 } }, // on slate date, excluded
      { date: "2026-07-03", opponent: { id: 147 }, stat: { gamesStarted: 1, inningsPitched: "6.1", strikeOuts: 7 } },
      { date: "2026-06-27", opponent: { id: 112 }, stat: { gamesStarted: 0, inningsPitched: "1.0", strikeOuts: 1 } }, // relief, excluded
      { date: "2026-06-20", opponent: { id: 112 }, stat: { gamesStarted: 1, inningsPitched: "5.0", strikeOuts: 4 } },
      { date: "2026-06-14", opponent: { id: 147 }, stat: { gamesStarted: 1, inningsPitched: "7.0", strikeOuts: 9 } },
      { date: "2026-06-08", opponent: { id: 112 }, stat: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 5 } },
      { date: "2026-06-02", opponent: { id: 147 }, stat: { gamesStarted: 1, inningsPitched: "5.2", strikeOuts: 3 } },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ stats: [{ splits }] }));
    const { starts, error } = await fetchPitcherRecentStarts(669456, 2026, "2026-07-08", teamAbbrById, { fetchImpl });
    expect(error).toBeNull();
    expect(starts).toHaveLength(5);
    expect(starts[0]).toEqual({ date: "2026-07-03", opponentAbbr: "NYY", inningsPitched: "6.1", strikeouts: 7 });
    expect(starts.map((s: { date: string }) => s.date)).toEqual(["2026-07-03", "2026-06-20", "2026-06-14", "2026-06-08", "2026-06-02"]);
  });

  it("returns an empty array with the error captured on fetch failure (never throws)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const { starts, error } = await fetchPitcherRecentStarts(1, 2026, "2026-07-08", teamAbbrById, { fetchImpl, retries: 0 });
    expect(starts).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });

  it("nulls the opponent abbreviation when the team id can't be resolved", async () => {
    const splits = [{ date: "2026-07-03", opponent: { id: 999 }, stat: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 5 } }];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ stats: [{ splits }] }));
    const { starts } = await fetchPitcherRecentStarts(1, 2026, "2026-07-08", teamAbbrById, { fetchImpl });
    expect(starts[0].opponentAbbr).toBeNull();
  });
});

describe("pitcher game-log field normalization", () => {
  const teamAbbrById = buildTeamAbbrById(TEAMS);

  it("reads the official game, opponent, home-site, pitching, hits, pitch-count, and workload paths", () => {
    const row = normalizePitcherGameLogSplit(pitcherGameLogSplitsFixture[1], 2026, teamAbbrById);
    expect(row).toMatchObject({
      gamePk: 1001,
      season: 2026,
      date: "2026-07-20",
      opponentId: 147,
      opponentAbbr: "NYY",
      isHome: true,
      site: "home",
      inningsPitched: "5.2",
      strikeouts: 8,
      hitsAllowed: 4,
      pitchCount: 95,
      battersFaced: 24,
      gamesStarted: 1,
    });
  });

  it("maps away site and uses pitchesThrown only when numberOfPitches is absent", () => {
    const row = normalizePitcherGameLogSplit(pitcherGameLogSplitsFixture[4], 2026, teamAbbrById);
    expect(row.isHome).toBe(false);
    expect(row.site).toBe("away");
    expect(row.pitchCount).toBe(87);
  });

  it("returns the complete pre-slate starter log while excluding same-day starts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(pitcherGameLogResponseFixture));
    const { starts, error } = await fetchPitcherSeasonStarts(669456, 2026, "2026-07-23", teamAbbrById, { fetchImpl });
    expect(error).toBeNull();
    expect(starts).toHaveLength(13);
    expect(starts[0].gamePk).toBe(1001);
    expect(starts.some((start: { gamePk: number | null }) => start.gamePk === 1000)).toBe(false);
  });
});

describe("fetchTeamRecentCompletedGames", () => {
  it("filters to completed regular-season games and limits to 5, most recent first", async () => {
    const dates = [
      { games: [{ gamePk: 1, officialDate: "2026-07-01", gameType: "R", status: { codedGameState: "F", abstractGameState: "Final" } }] },
      { games: [{ gamePk: 2, officialDate: "2026-07-02", gameType: "R", status: { codedGameState: "P", abstractGameState: "Preview" } }] }, // not final
      { games: [{ gamePk: 3, officialDate: "2026-07-03", gameType: "R", status: { codedGameState: "F", abstractGameState: "Final" } }] },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ dates }));
    const { games, error } = await fetchTeamRecentCompletedGames(112, "2026-07-08", { fetchImpl });
    expect(error).toBeNull();
    expect(games.map((g: { gamePk: number }) => g.gamePk)).toEqual([3, 1]);
  });

  it("returns an empty array with the error captured on failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    const { games, error } = await fetchTeamRecentCompletedGames(112, "2026-07-08", { fetchImpl, retries: 0 });
    expect(games).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });

  it("supports a custom limit (e.g. 10 for the opponent Last 10 sample) instead of the default 5", async () => {
    const dates = Array.from({ length: 12 }, (_, i) => ({
      games: [{ gamePk: i + 1, officialDate: `2026-06-${String(i + 1).padStart(2, "0")}`, gameType: "R", status: { codedGameState: "F", abstractGameState: "Final" } }],
    }));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ dates }));
    const { games, error } = await fetchTeamRecentCompletedGames(112, "2026-07-08", { fetchImpl, limit: 10 });
    expect(error).toBeNull();
    expect(games).toHaveLength(10);
    // Most recent first: game 12 (2026-06-12) down through game 3 (2026-06-03).
    expect(games.map((g: { gamePk: number }) => g.gamePk)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it("never queries a date range including or after the slate date (same-day exclusion)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ dates: [] }));
    await fetchTeamRecentCompletedGames(112, "2026-07-08", { fetchImpl });
    const requestedUrl = fetchImpl.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("endDate=2026-07-07");
    expect(requestedUrl).not.toContain("endDate=2026-07-08");
  });

  it("excludes postponed games even though MLB StatsAPI marks abstractGameState Final for them", async () => {
    // Regression: a real postponed CHC game (gamePk 824664) was returned by
    // the live API with abstractGameState "Final" but codedGameState "D"
    // and a made-up future officialDate (the eventual makeup-game date),
    // which leaked a not-actually-played game into "recent completed games".
    const dates = [
      { games: [{ gamePk: 3, officialDate: "2026-07-03", gameType: "R", status: { codedGameState: "F", abstractGameState: "Final", detailedState: "Final" } }] },
      { games: [{ gamePk: 4, officialDate: "2026-08-06", gameType: "R", status: { codedGameState: "D", abstractGameState: "Final", detailedState: "Postponed" } }] },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ dates }));
    const { games } = await fetchTeamRecentCompletedGames(112, "2026-07-08", { fetchImpl });
    expect(games.map((g: { gamePk: number }) => g.gamePk)).toEqual([3]);
  });
});

const BOXSCORE_FIXTURE = {
  teams: {
    away: {
      team: { id: 112, abbreviation: "CHC" },
      teamStats: { batting: { strikeOuts: 10 } },
      players: {
        ID1: { person: { id: 1, fullName: "Away Reliever" }, stats: { pitching: { gamesStarted: 0 } } },
        ID2: { person: { id: 2, fullName: "Away Starter" }, stats: { pitching: { gamesStarted: 1, inningsPitched: "5.1", strikeOuts: 6 } } },
      },
    },
    home: {
      team: { id: 111, abbreviation: "BAL" },
      teamStats: { batting: { strikeOuts: 8 } },
      players: {
        ID3: { person: { id: 3, fullName: "Home Starter" }, stats: { pitching: { gamesStarted: 1, inningsPitched: "6.0", strikeOuts: 7 } } },
      },
    },
  },
};

describe("deriveOpponentGameSummary", () => {
  it("derives the opposing starter, that starter's IP/Ks, and the team's own total Ks (away perspective)", () => {
    const summary = deriveOpponentGameSummary(BOXSCORE_FIXTURE, 112, "2026-07-05");
    expect(summary).toEqual({
      date: "2026-07-05",
      opponent: "BAL",
      opposingStartingPitcher: "Home Starter",
      opposingStarterInningsPitched: "6.0",
      opposingStarterStrikeouts: 7,
      teamTotalStrikeouts: 10,
    });
  });

  it("derives correctly from the home team's perspective too", () => {
    const summary = deriveOpponentGameSummary(BOXSCORE_FIXTURE, 111, "2026-07-05");
    expect(summary.opponent).toBe("CHC");
    expect(summary.opposingStartingPitcher).toBe("Away Starter");
    expect(summary.teamTotalStrikeouts).toBe(8);
  });

  it("returns an all-null-but-date summary when the boxscore is missing/malformed (never throws)", () => {
    expect(deriveOpponentGameSummary(null, 112, "2026-07-05")).toEqual({
      date: "2026-07-05",
      opponent: null,
      opposingStartingPitcher: null,
      opposingStarterInningsPitched: null,
      opposingStarterStrikeouts: null,
      teamTotalStrikeouts: null,
    });
  });

  it("nulls the starter fields (without throwing) when no player has gamesStarted === 1", () => {
    const noStarterBoxscore = {
      teams: {
        away: { team: { id: 112, abbreviation: "CHC" }, teamStats: { batting: { strikeOuts: 5 } }, players: {} },
        home: { team: { id: 111, abbreviation: "BAL" }, teamStats: { batting: { strikeOuts: 5 } }, players: {} },
      },
    };
    const summary = deriveOpponentGameSummary(noStarterBoxscore, 112, "2026-07-05");
    expect(summary.opposingStartingPitcher).toBeNull();
    expect(summary.opponent).toBe("BAL");
  });
});

describe("fetchBoxscoreCached", () => {
  it("only fetches a given gamePk once even when requested repeatedly (shared cache across pitchers)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(BOXSCORE_FIXTURE));
    const cache = new Map();
    const [a, b, c] = await Promise.all([
      fetchBoxscoreCached(555, cache, { fetchImpl }),
      fetchBoxscoreCached(555, cache, { fetchImpl }),
      fetchBoxscoreCached(555, cache, { fetchImpl }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.boxscore).toEqual(BOXSCORE_FIXTURE);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("captures fetch failures per gamePk rather than throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boxscore down"));
    const { boxscore, error } = await fetchBoxscoreCached(555, new Map(), { fetchImpl, retries: 0 });
    expect(boxscore).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("fetchOpponentLastFiveGamesDetail", () => {
  it("reuses the shared boxscore cache across the games it processes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(BOXSCORE_FIXTURE));
    const cache = new Map();
    const games = [
      { gamePk: 1, officialDate: "2026-07-01" },
      { gamePk: 1, officialDate: "2026-07-01" }, // duplicate gamePk should not re-fetch
      { gamePk: 2, officialDate: "2026-07-02" },
    ];
    const rows = await fetchOpponentLastFiveGamesDetail(112, games, cache, { fetchImpl });
    expect(rows).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // gamePk 1 fetched once, gamePk 2 once
  });

  it("produces an unavailable row (not a crash) for a game whose boxscore fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    const rows = await fetchOpponentLastFiveGamesDetail(112, [{ gamePk: 9, officialDate: "2026-07-01" }], new Map(), {
      fetchImpl,
      retries: 0,
    });
    expect(rows).toEqual([
      { date: "2026-07-01", opponent: null, opposingStartingPitcher: null, opposingStarterInningsPitched: null, opposingStarterStrikeouts: null, teamTotalStrikeouts: null },
    ]);
  });
});
