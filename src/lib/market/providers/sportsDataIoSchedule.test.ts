import { describe, expect, it } from "vitest";
import {
  decodeSportsDataIoNflSchedule,
  selectScheduleCandidates,
  SportsDataIoScheduleDecodeError,
} from "./sportsDataIoSchedule";
import type { CanonicalBettingGame } from "../gameJoinTypes";
import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";
import {
  NFL_SCORES_BY_WEEK_PAYLOAD,
  NFL_SCORE_ROW_KC_LAC_NO_UTC,
  NFL_SCORE_ROW_SEA_NE,
} from "./__fixtures__/sportsDataIoWireFixtures";

const normalizeTeam = (value: string | null) => (value === null ? null : normalizeNflTeamAbbr(value));

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

describe("decodeSportsDataIoNflSchedule", () => {
  it("throws when the payload is not an array", () => {
    expect(() => decodeSportsDataIoNflSchedule({})).toThrow(SportsDataIoScheduleDecodeError);
  });

  it("throws when a row is missing the required ScoreID/Season identity", () => {
    expect(() => decodeSportsDataIoNflSchedule([{ Week: 1 }])).toThrow(
      SportsDataIoScheduleDecodeError,
    );
  });

  it("retains provider game id, team keys/ids, season and week", () => {
    const [seaNe] = decodeSportsDataIoNflSchedule([NFL_SCORE_ROW_SEA_NE]);
    expect(seaNe).toMatchObject({
      league: "nfl",
      providerGameId: "18001",
      season: 2026,
      seasonType: "REG",
      week: 1,
      awayTeamKey: "NE",
      homeTeamKey: "SEA",
      awayTeamProviderId: "7",
      homeTeamProviderId: "28",
    });
  });

  it("prefers the provider DateTimeUTC for kickoff", () => {
    const [seaNe] = decodeSportsDataIoNflSchedule([NFL_SCORE_ROW_SEA_NE]);
    expect(seaNe.kickoffUtc).toBe("2026-09-13T20:25:00.000Z");
    expect(seaNe.kickoffSource).toBe("provider-utc");
  });

  it("converts the Eastern DateTime when DateTimeUTC is absent", () => {
    const [kcLac] = decodeSportsDataIoNflSchedule([NFL_SCORE_ROW_KC_LAC_NO_UTC]);
    // 2026-09-14 20:20 ET (EDT, UTC-4) -> 2026-09-15T00:20:00Z
    expect(kcLac.kickoffUtc).toBe("2026-09-15T00:20:00.000Z");
    expect(kcLac.kickoffSource).toBe("eastern-converted");
  });
});

describe("selectScheduleCandidates", () => {
  const providerGames = decodeSportsDataIoNflSchedule(NFL_SCORES_BY_WEEK_PAYLOAD);

  it("keeps only provider games whose teams match a canonical game", () => {
    const canonical = [
      canonicalGame(),
      canonicalGame({
        jkbGameId: "2026_01_KC_LAC",
        awayTeamId: "kc",
        homeTeamId: "lac",
        kickoffUtc: "2026-09-15T00:20:00.000Z",
      }),
    ];
    const { candidates, unmatchedProviderGames } = selectScheduleCandidates(
      providerGames,
      canonical,
      { normalizeTeam },
    );
    const ids = candidates.map((c) => c.providerGame.providerGameId).sort();
    expect(ids).toEqual(["18001", "18002"]);
    // The DAL@NYG game (18003) is not on the canonical slate.
    expect(unmatchedProviderGames.map((g) => g.providerGameId)).toEqual(["18003"]);
  });

  it("excludes a team match whose kickoff is outside the tolerance window", () => {
    const canonical = [
      canonicalGame({ kickoffUtc: "2026-09-20T20:25:00.000Z" }), // a week later
    ];
    const { candidates } = selectScheduleCandidates(providerGames, canonical, {
      normalizeTeam,
      kickoffToleranceMs: 6 * 60 * 60 * 1000,
    });
    expect(candidates).toHaveLength(0);
  });

  it("tolerates neutral-site orientation reversal at the candidate stage", () => {
    const canonical = [
      canonicalGame({ awayTeamId: "sea", homeTeamId: "ne", neutralSite: true }),
    ];
    const { candidates } = selectScheduleCandidates(providerGames, canonical, {
      normalizeTeam,
    });
    expect(candidates.map((c) => c.providerGame.providerGameId)).toContain("18001");
  });
});
