import { describe, expect, it } from "vitest";
import { joinTheOddsApiBookLine } from "./bettingLineGameJoin";
import { resolveTheOddsApiNflTeamId } from "./theOddsApiNflTeamIdentity";
import type { CanonicalBettingGame } from "./canonicalBettingGame";
import type { NormalizedTheOddsApiBookLine } from "../providers/theOddsApiWire";

const CAPTURED_AT = "2026-09-01T06:00:00.000Z";

function nflGame(overrides: Partial<CanonicalBettingGame> = {}): CanonicalBettingGame {
  return {
    league: "nfl",
    season: 2026,
    week: 1,
    jkbGameId: "2026_01_NE_SEA",
    awayTeamId: "ne",
    homeTeamId: "sea",
    kickoffUtc: "2026-09-07T17:00:00.000Z",
    neutralSite: false,
    ...overrides,
  };
}

function row(overrides: Partial<NormalizedTheOddsApiBookLine> = {}): NormalizedTheOddsApiBookLine {
  return {
    provider: "the-odds-api",
    providerEventId: "evt-1",
    sportKey: "americanfootball_nfl",
    commenceTimeUtc: "2026-09-07T17:00:00.000Z",
    homeTeamName: "Seattle Seahawks",
    awayTeamName: "New England Patriots",
    sportsbook: "draftkings",
    sportsbookTitle: "DraftKings",
    providerUpdatedAt: "2026-09-01T05:55:00.000Z",
    spread: { homeLine: -2.5, awayLine: 2.5, homePrice: -110, awayPrice: -110 },
    total: { line: 44.5, overPrice: -108, underPrice: -112 },
    moneyline: { homePrice: -140, awayPrice: 120 },
    ...overrides,
  };
}

const join = (r: NormalizedTheOddsApiBookLine, games: CanonicalBettingGame[]) =>
  joinTheOddsApiBookLine({
    row: r,
    league: "nfl",
    canonicalGames: games,
    resolveTeam: resolveTheOddsApiNflTeamId,
    capturedAt: CAPTURED_AT,
  });

describe("joinTheOddsApiBookLine", () => {
  it("matches full team names + kickoff to exactly one canonical game", () => {
    const result = join(row(), [nflGame()]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.snapshot.jkbGameId).toBe("2026_01_NE_SEA");
    expect(result.snapshot.homeTeamId).toBe("sea");
    expect(result.snapshot.week).toBe(1);
    expect(result.snapshot.spread?.homeLine).toBe(-2.5);
    expect(result.snapshot.contentHash).toBeNull();
  });

  it("reports unmatched when the provider team name does not resolve", () => {
    const result = join(row({ homeTeamName: "Toronto Argonauts" }), [nflGame()]);
    expect(result).toMatchObject({ status: "unmatched", reason: "TEAM_MAPPING_FAILED" });
  });

  it("excludes an off-slate game whose kickoff is outside tolerance", () => {
    const result = join(
      row({ commenceTimeUtc: "2026-09-14T17:00:00.000Z" }),
      [nflGame()],
    );
    expect(result).toMatchObject({ status: "unmatched", reason: "KICKOFF_OUTSIDE_TOLERANCE" });
  });

  it("reports NO_CANONICAL_GAME when teams map but no slate game pairs them", () => {
    const result = join(row(), [nflGame({ awayTeamId: "buf", homeTeamId: "mia" })]);
    expect(result).toMatchObject({ status: "unmatched", reason: "NO_CANONICAL_GAME" });
  });

  it("flags ambiguity when two canonical games share the same matchup + kickoff window", () => {
    const result = join(row(), [
      nflGame({ jkbGameId: "A" }),
      nflGame({ jkbGameId: "B", kickoffUtc: "2026-09-07T18:00:00.000Z" }),
    ]);
    expect(result).toMatchObject({ status: "ambiguous", reason: "MULTIPLE_CANONICAL_GAMES" });
  });

  it("reverses spread/moneyline orientation for a neutral-site game listed home/away swapped", () => {
    const result = join(row(), [
      nflGame({ neutralSite: true, homeTeamId: "ne", awayTeamId: "sea" }),
    ]);
    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.evidence.neutralSiteOrientationReversed).toBe(true);
    // provider had SEA -2.5 at home; canonical home is NE, so NE gets +2.5
    expect(result.snapshot.spread).toEqual({
      homeLine: 2.5,
      awayLine: -2.5,
      homePrice: -110,
      awayPrice: -110,
    });
    expect(result.snapshot.moneyline).toEqual({ homePrice: 120, awayPrice: -140 });
  });
});
