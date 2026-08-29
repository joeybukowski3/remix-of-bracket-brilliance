import type { CfbGame } from "../../../data/cfb/types";
import type { NflGameRecord } from "../../nfl/standings";
import type { NormalizedProviderBettingSplit } from "../providers/normalizedProviderBettingSplits";

export const JOIN_CAPTURED_AT = "2026-09-10T16:00:00.000Z";

export function providerSplit(
  overrides: Partial<NormalizedProviderBettingSplit> = {},
): NormalizedProviderBettingSplit {
  return {
    schemaVersion: "jkb-normalized-provider-betting-splits-v1",
    league: "nfl",
    season: 2026,
    week: 1,
    provider: "fixture-provider",
    providerGameId: "provider-game-1",
    providerAwayTeamId: "NE",
    providerAwayTeamName: "New England Patriots",
    providerHomeTeamId: "SEA",
    providerHomeTeamName: "Seattle Seahawks",
    kickoffUtc: "2026-09-13T20:25:00.000Z",
    sportsbook: "Fixture Book",
    capturedAt: JOIN_CAPTURED_AT,
    providerCreatedAt: "2026-09-08T14:00:00.000Z",
    providerLastSeenAt: "2026-09-10T15:58:00.000Z",
    spread: {
      openingHomeLine: -2.5,
      openingAwayLine: 2.5,
      currentHomeLine: -3.5,
      currentAwayLine: 3.5,
      homeBetPct: 64,
      awayBetPct: 36,
      homeMoneyPct: 58,
      awayMoneyPct: 42,
    },
    total: {
      openingLine: 44.5,
      currentLine: 45.5,
      overBetPct: 57,
      underBetPct: 43,
      overMoneyPct: 61,
      underMoneyPct: 39,
    },
    moneyline: {
      openingHomePrice: -155,
      openingAwayPrice: 135,
      currentHomePrice: -175,
      currentAwayPrice: 150,
      homeBetPct: 63,
      awayBetPct: 37,
      homeMoneyPct: 59,
      awayMoneyPct: 41,
    },
    ...overrides,
  };
}

export function nflGame(overrides: Partial<NflGameRecord> = {}): NflGameRecord {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    dateUtc: "2026-09-13T20:25:00.000Z",
    homeTeam: "Seattle Seahawks",
    awayTeam: "New England Patriots",
    homeAbbr: "sea",
    awayAbbr: "ne",
    status: "scheduled",
    stadium: "Lumen Field",
    neutralSite: false,
    ...overrides,
  };
}

const EMPTY_ODDS: CfbGame["odds"] = {
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
};

const EMPTY_MODEL: CfbGame["model"] = {
  jkbProjectedSpread: null,
  jkbProjectedTotal: null,
  homeWinProbability: null,
  awayWinProbability: null,
  neutralPowerDifference: null,
  homeFieldAdjustment: null,
  jkbPowerLine: null,
};

export function cfbGame(overrides: Partial<CfbGame> = {}): CfbGame {
  return {
    id: "401752123",
    season: 2026,
    week: 5,
    date: "2026-10-03",
    time: "23:30",
    awayTeamId: "miami-oh",
    homeTeamId: "mia",
    neutralSite: false,
    venue: "Example Stadium",
    venueCity: "Miami",
    venueState: "FL",
    tvNetwork: null,
    gameStatus: "scheduled",
    awayScore: null,
    homeScore: null,
    odds: { ...EMPTY_ODDS },
    model: { ...EMPTY_MODEL },
    ...overrides,
  };
}

export function cfbProviderSplit(
  overrides: Partial<NormalizedProviderBettingSplit> = {},
): NormalizedProviderBettingSplit {
  return providerSplit({
    league: "cfb",
    season: 2026,
    week: 5,
    providerGameId: "cfb-provider-game-1",
    providerAwayTeamId: null,
    providerAwayTeamName: "Miami (OH)",
    providerHomeTeamId: null,
    providerHomeTeamName: "Miami",
    kickoffUtc: "2026-10-03T23:30:00.000Z",
    ...overrides,
  });
}
