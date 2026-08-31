import { describe, expect, it } from "vitest";
import {
  decodeSportsDataIoNflPreGameOddsDiscovery,
  decodeSportsDataIoNflPreGameOddsLines,
} from "./sportsDataIoPreGameOdds";
import { selectScheduleCandidates } from "./sportsDataIoSchedule";
import { SportsDataIoScheduleDecodeError } from "./sportsDataIoSchedule";
import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";
import type { CanonicalBettingGame } from "../gameJoinTypes";
import {
  NFL_GAME_INFO_ROW_KC_LAC_NO_UTC,
  NFL_GAME_INFO_ROW_SEA_NE,
  NFL_LIVE_GAME_INFO_ROW_ARI_LAC,
  NFL_LIVE_GAME_INFO_ROW_WAS_PHI_FULLNAME,
  NFL_LIVE_GAME_ODDS_BY_WEEK_WEEK1_2026,
  NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD,
} from "./__fixtures__/sportsDataIoWireFixtures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NflGameRecord } from "../../nfl/standings";

const normalizeTeam = (value: string | null) =>
  value === null ? null : normalizeNflTeamAbbr(value);

function canonicalGame(overrides: Partial<CanonicalBettingGame> = {}): CanonicalBettingGame {
  return {
    league: "nfl",
    season: 2026,
    week: 1,
    jkbGameId: "2026_01_NE_SEA",
    awayTeamId: "ne",
    homeTeamId: "sea",
    kickoffUtc: "2026-09-13T20:25:00.000Z",
    neutralSite: false,
    ...overrides,
  };
}

describe("decodeSportsDataIoNflPreGameOddsDiscovery", () => {
  it("throws when the payload is not an array", () => {
    expect(() => decodeSportsDataIoNflPreGameOddsDiscovery({})).toThrow(
      SportsDataIoScheduleDecodeError,
    );
  });

  it("throws when a GameInfo row is missing ScoreId", () => {
    expect(() =>
      decodeSportsDataIoNflPreGameOddsDiscovery([{ Season: 2026, Week: 1 }]),
    ).toThrow(SportsDataIoScheduleDecodeError);
  });

  it("retains ScoreId, teams, season and week", () => {
    const [seaNe] = decodeSportsDataIoNflPreGameOddsDiscovery([NFL_GAME_INFO_ROW_SEA_NE]);
    expect(seaNe).toMatchObject({
      league: "nfl",
      providerGameId: "18001",
      season: 2026,
      seasonType: "REG",
      week: 1,
      awayTeamKey: "NE",
      homeTeamKey: "SEA",
    });
  });

  it("prefers the provider DateTimeUTC for kickoff", () => {
    const [seaNe] = decodeSportsDataIoNflPreGameOddsDiscovery([NFL_GAME_INFO_ROW_SEA_NE]);
    expect(seaNe.kickoffUtc).toBe("2026-09-13T20:25:00.000Z");
    expect(seaNe.kickoffSource).toBe("provider-utc");
  });

  it("converts the Eastern DateTime when DateTimeUTC is absent", () => {
    const [kcLac] = decodeSportsDataIoNflPreGameOddsDiscovery([
      NFL_GAME_INFO_ROW_KC_LAC_NO_UTC,
    ]);
    expect(kcLac.kickoffUtc).toBe("2026-09-15T00:20:00.000Z");
    expect(kcLac.kickoffSource).toBe("eastern-converted");
  });

  it("deduplicates multiple GameInfo rows for one ScoreId to a single provider game", () => {
    const games = decodeSportsDataIoNflPreGameOddsDiscovery([
      NFL_GAME_INFO_ROW_SEA_NE,
      { ...NFL_GAME_INFO_ROW_SEA_NE, PregameOdds: [] },
    ]);
    expect(games).toHaveLength(1);
    expect(games[0].providerGameId).toBe("18001");
  });

  it("filters an off-slate provider game and keeps an on-slate one as a candidate", () => {
    const providerGames = decodeSportsDataIoNflPreGameOddsDiscovery(
      NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD,
    );
    const { candidates, unmatchedProviderGames } = selectScheduleCandidates(
      providerGames,
      [canonicalGame()],
      { normalizeTeam },
    );
    expect(candidates.map((c) => c.providerGame.providerGameId)).toEqual(["18001"]);
    expect(unmatchedProviderGames.map((g) => g.providerGameId).sort()).toEqual([
      "18002",
      "18003",
    ]);
  });
});

describe("live GameOddsByWeek identity shape (no abbreviation Key, no DateTimeUTC)", () => {
  it("resolves an abbreviation carried in AwayTeamName/HomeTeamName", () => {
    const [ariLac] = decodeSportsDataIoNflPreGameOddsDiscovery([
      NFL_LIVE_GAME_INFO_ROW_ARI_LAC,
    ]);
    expect(ariLac).toMatchObject({
      providerGameId: "19466",
      awayTeamKey: "ARI",
      homeTeamKey: "LAC",
      // SportsDataIO numeric ids preserved as provider ids, never as identity.
      awayTeamProviderId: "1",
      homeTeamProviderId: "29",
      kickoffSource: "eastern-converted",
    });
    // 16:25 US Eastern (EDT) -> 20:25 UTC
    expect(ariLac.kickoffUtc).toBe("2026-09-13T20:25:00.000Z");
  });

  it("resolves the documented full club name form", () => {
    const [wasPhi] = decodeSportsDataIoNflPreGameOddsDiscovery([
      NFL_LIVE_GAME_INFO_ROW_WAS_PHI_FULLNAME,
    ]);
    expect(wasPhi.awayTeamKey).toBe("WAS");
    expect(wasPhi.homeTeamKey).toBe("PHI");
    expect(wasPhi.awayTeamProviderId).toBe("35");
  });

  it("matches ARI @ LAC to the canonical 2026_01_ARI_LAC game", () => {
    const providerGames = decodeSportsDataIoNflPreGameOddsDiscovery([
      NFL_LIVE_GAME_INFO_ROW_ARI_LAC,
    ]);
    const { candidates } = selectScheduleCandidates(
      providerGames,
      [
        canonicalGame({
          jkbGameId: "2026_01_ARI_LAC",
          awayTeamId: "ari",
          homeTeamId: "lac",
          kickoffUtc: "2026-09-13T20:25:00.000Z",
        }),
      ],
      { normalizeTeam },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonicalGame.jkbGameId).toBe("2026_01_ARI_LAC");
    expect(candidates[0].matchedBy).toBe("teams+kickoff");
    expect(candidates[0].kickoffDeltaMinutes).toBe(0);
  });

  it("matches all 16 live Week 1 identities to the canonical nflverse slate", () => {
    const gamesDoc = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/data/nfl/2026/games.json"), "utf8"),
    ) as { games?: NflGameRecord[] } | NflGameRecord[];
    const allGames = Array.isArray(gamesDoc) ? gamesDoc : gamesDoc.games ?? [];
    const weekOne = allGames.filter((g) => g.season === 2026 && g.week === 1);
    expect(weekOne).toHaveLength(16);

    const canonical = weekOne.map((g) => ({
      league: "nfl" as const,
      season: g.season,
      week: g.week,
      jkbGameId: g.gameId,
      awayTeamId: normalizeNflTeamAbbr(g.awayAbbr) ?? g.awayAbbr,
      homeTeamId: normalizeNflTeamAbbr(g.homeAbbr) ?? g.homeAbbr,
      kickoffUtc: g.dateUtc,
      neutralSite: g.neutralSite,
    }));

    const providerGames = decodeSportsDataIoNflPreGameOddsDiscovery(
      NFL_LIVE_GAME_ODDS_BY_WEEK_WEEK1_2026,
    );
    const { candidates, unmatchedProviderGames } = selectScheduleCandidates(
      providerGames,
      canonical,
      { normalizeTeam },
    );
    expect(unmatchedProviderGames).toHaveLength(0);
    expect(new Set(candidates.map((c) => c.canonicalGame.jkbGameId)).size).toBe(16);
    for (const candidate of candidates) {
      expect(candidate.matchedBy).toBe("teams+kickoff");
      expect(candidate.kickoffDeltaMinutes).toBeLessThanOrEqual(360);
    }
  });

  it("still rejects an off-slate provider game", () => {
    const providerGames = decodeSportsDataIoNflPreGameOddsDiscovery(
      NFL_LIVE_GAME_ODDS_BY_WEEK_WEEK1_2026,
    );
    const { candidates, unmatchedProviderGames } = selectScheduleCandidates(
      providerGames,
      [
        canonicalGame({
          jkbGameId: "2026_01_ARI_LAC",
          awayTeamId: "ari",
          homeTeamId: "lac",
          kickoffUtc: "2026-09-13T20:25:00.000Z",
        }),
      ],
      { normalizeTeam },
    );
    expect(candidates.map((c) => c.providerGame.providerGameId)).toEqual(["19466"]);
    expect(unmatchedProviderGames).toHaveLength(15);
  });
});

describe("decodeSportsDataIoNflPreGameOddsLines", () => {
  it("returns one row per sportsbook with verified line/price fields", () => {
    const lines = decodeSportsDataIoNflPreGameOddsLines([NFL_GAME_INFO_ROW_SEA_NE]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.sportsbook).sort()).toEqual(["DraftKings", "FanDuel"]);
    const fd = lines.find((l) => l.sportsbook === "FanDuel");
    expect(fd).toMatchObject({
      providerGameId: "18001",
      homePointSpread: -2.5,
      awayPointSpread: 2.5,
      overUnder: 45,
      homeMoneyLine: -160,
      awayMoneyLine: 135,
      createdEastern: "2026-09-08T09:00:00",
    });
  });

  it("does not fabricate a consensus row", () => {
    const lines = decodeSportsDataIoNflPreGameOddsLines([NFL_GAME_INFO_ROW_KC_LAC_NO_UTC]);
    expect(lines).toHaveLength(1);
    expect(lines[0].sportsbook).toBe("DraftKings");
  });
});
