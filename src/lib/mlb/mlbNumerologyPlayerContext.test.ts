import { describe, expect, it, vi } from "vitest";
import {
  buildTeamIdByAbbr,
  deriveGameBattingLine,
  enrichCardPlaysWithContext,
  fetchLastFiveGamesForPlayer,
  fetchPlayerSeasonStats,
} from "../../../scripts/lib/mlb-numerology-player-context.mjs";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function boxscoreFixture({ homeId = 100, awayId = 200, homeAbbr = "NYY", awayAbbr = "TB", playerId = 555, playerTeamId = 100 }: Partial<{
  homeId: number;
  awayId: number;
  homeAbbr: string;
  awayAbbr: string;
  playerId: number;
  playerTeamId: number;
}> = {}) {
  const battingLine = { atBats: 4, hits: 2, homeRuns: 1, totalBases: 6, rbi: 3 };
  const ownSide = playerTeamId === homeId ? "home" : "away";
  return {
    teams: {
      home: { team: { id: homeId, abbreviation: homeAbbr }, players: ownSide === "home" ? { [`ID${playerId}`]: { stats: { batting: battingLine } } } : {} },
      away: { team: { id: awayId, abbreviation: awayAbbr }, players: ownSide === "away" ? { [`ID${playerId}`]: { stats: { batting: battingLine } } } : {} },
    },
  };
}

describe("MLB numerology player context", () => {
  it("resolves the player's own line and the opposing team's abbreviation from a boxscore", () => {
    const box = boxscoreFixture({ playerTeamId: 100 });
    const line = deriveGameBattingLine(box, 555, 100);
    expect(line).toMatchObject({ atBats: 4, hits: 2, homeRuns: 1, totalBases: 6, rbi: 3, opponent: "TB" });
  });

  it("returns null when the given team id doesn't match either side of the boxscore", () => {
    const box = boxscoreFixture();
    expect(deriveGameBattingLine(box, 555, 999)).toBeNull();
  });

  it("returns null when the player isn't found on their own side", () => {
    const box = boxscoreFixture({ playerTeamId: 100 });
    expect(deriveGameBattingLine(box, 12345, 100)).toBeNull();
  });

  it("builds a team abbreviation -> id map", () => {
    const map = buildTeamIdByAbbr([{ id: 100, abbreviation: "NYY" }, { id: 200, abbreviation: "tb" }]);
    expect(map.get("NYY")).toBe(100);
    expect(map.get("TB")).toBe(200);
  });

  it("fetches boxscores for known gamePks and derives last-5-games batting lines", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(boxscoreFixture({ playerTeamId: 100 })));
    const result = await fetchLastFiveGamesForPlayer({
      playerId: 555,
      teamId: 100,
      gameLog: [{ gamePk: "1", date: "2026-07-07" }, { gamePk: "2", date: "2026-07-05" }],
      boxscoreCache: new Map(),
      options: { fetchImpl },
    });
    expect(result.available).toBe(true);
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ date: "2026-07-07", hits: 2, opponent: "TB" });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // one request per distinct gamePk
  });

  it("omits a game instead of throwing when its boxscore fetch fails, and keeps the rest", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(jsonResponse(boxscoreFixture({ playerTeamId: 100 })));
    const result = await fetchLastFiveGamesForPlayer({
      playerId: 555,
      teamId: 100,
      gameLog: [{ gamePk: "1", date: "2026-07-07" }, { gamePk: "2", date: "2026-07-05" }],
      boxscoreCache: new Map(),
      options: { fetchImpl, retries: 0 },
    });
    expect(result.available).toBe(true);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].date).toBe("2026-07-05");
  });

  it("reports unavailable rather than empty-but-available when there is no game log at all", async () => {
    const result = await fetchLastFiveGamesForPlayer({ playerId: 555, teamId: 100, gameLog: [], boxscoreCache: new Map() });
    expect(result).toEqual({ games: [], available: false });
  });

  it("parses a season hitting line from the stats endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ stats: [{ splits: [{ stat: { avg: ".276", obp: ".351", slg: ".512", ops: ".863", homeRuns: 18, rbi: 44, atBats: 250, plateAppearances: 290 } }] }] })
    );
    const stats = await fetchPlayerSeasonStats(555, "2026", { fetchImpl });
    expect(stats).toMatchObject({ avg: ".276", obp: ".351", slg: ".512", ops: ".863", homeRuns: 18, rbi: 44, atBats: 250 });
  });

  it("returns null (never a fabricated zero line) when season stats are missing or the request fails", async () => {
    const missingSplits = vi.fn().mockResolvedValue(jsonResponse({ stats: [{ splits: [] }] }));
    expect(await fetchPlayerSeasonStats(555, "2026", { fetchImpl: missingSplits })).toBeNull();

    const failing = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await fetchPlayerSeasonStats(555, "2026", { fetchImpl: failing, retries: 0 })).toBeNull();

    expect(await fetchPlayerSeasonStats(null, "2026")).toBeNull();
  });

  it("enriches both topPlay and its matching allQualifiedPlaysOver50 copy from a single deduped lookup", async () => {
    const teamsResponse = jsonResponse({ teams: [{ id: 100, abbreviation: "NYY", name: "Yankees" }, { id: 200, abbreviation: "TB", name: "Rays" }] });
    const boxscoreResponse = jsonResponse(boxscoreFixture({ playerTeamId: 100 }));
    const seasonStatsResponse = jsonResponse({ stats: [{ splits: [{ stat: { avg: ".300", atBats: 100 } }] }] });

    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/teams?")) return Promise.resolve(teamsResponse);
      if (url.includes("/boxscore")) return Promise.resolve(boxscoreResponse);
      if (url.includes("/stats?")) return Promise.resolve(seasonStatsResponse);
      throw new Error(`unexpected url: ${url}`);
    });

    const play = {
      playerId: 555,
      player: "Test Player",
      team: "NYY",
      recentActivity: { gameLog: [{ gamePk: "1", date: "2026-07-07" }] },
    };
    const card = {
      date: "2026-07-08",
      topPlay: { ...play },
      allQualifiedPlaysOver50: [{ ...play }],
    };

    const enriched = await enrichCardPlaysWithContext(card, { fetchImpl });

    expect(enriched.topPlay.seasonStats).toMatchObject({ avg: ".300" });
    expect(enriched.allQualifiedPlaysOver50[0].seasonStats).toMatchObject({ avg: ".300" });
    expect(enriched.topPlay.lastFiveGames.games).toHaveLength(1);
    // Deduped by playerId: exactly one boxscore + one season-stats + one teams call, not two of each.
    expect(fetchImpl.mock.calls.filter(([url]: [string]) => url.includes("/boxscore")).length).toBe(1);
    expect(fetchImpl.mock.calls.filter(([url]: [string]) => url.includes("/stats?")).length).toBe(1);
  });
});
