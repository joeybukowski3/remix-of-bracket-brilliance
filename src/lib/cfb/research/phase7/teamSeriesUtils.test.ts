import { describe, expect, it } from "vitest";
import { buildTeamSeries, lag1Pairs, longestSameDirectionStreak } from "./teamSeriesUtils";
import type { MissDatasetRow } from "./types";

function row(overrides: Partial<MissDatasetRow>): MissDatasetRow {
  return {
    season: 2022,
    week: 1,
    gameId: "g1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeTeamExternalId: "H",
    awayTeamExternalId: "A",
    modelMargin: 0,
    modelTotal: 50,
    modelPHomeWin: 0.5,
    expectedHomeScore: 25,
    expectedAwayScore: 25,
    homeOffenseRating: null,
    homeDefenseRating: null,
    awayOffenseRating: null,
    awayDefenseRating: null,
    marketProvider: null,
    marketMarginOpen: null,
    marketMarginLatestObserved: null,
    marketTotal: null,
    marketPHomeWinFair: null,
    actualMargin: 0,
    actualTotal: 50,
    winner: "home",
    modelMarginError: 0,
    marketMarginError: null,
    modelTotalError: 0,
    marketTotalError: null,
    modelVsMarketDisagreement: null,
    homeGamesPlayedEnteringWeek: 0,
    awayGamesPlayedEnteringWeek: 0,
    homePriorOffenseTier: "PRIOR_D",
    homePriorDefenseTier: "PRIOR_D",
    awayPriorOffenseTier: "PRIOR_D",
    awayPriorDefenseTier: "PRIOR_D",
    homeReturningProductionOffense: null,
    awayReturningProductionOffense: null,
    homeTalent: null,
    awayTalent: null,
    homeTransitionTeam: false,
    awayTransitionTeam: false,
    homeConference: null,
    awayConference: null,
    homePrevSeasonRating: null,
    awayPrevSeasonRating: null,
    homeRatingVolatility: null,
    awayRatingVolatility: null,
    missCategory: "MODEL_GOOD_MARKET_GOOD",
    ...overrides,
  };
}

describe("buildTeamSeries / lag1Pairs", () => {
  it("sorts each team's observations chronologically and pairs consecutive appearances only within a team", () => {
    const rows: MissDatasetRow[] = [
      row({ gameId: "g1", week: 2, homeTeamExternalId: "T1", awayTeamExternalId: "X" }),
      row({ gameId: "g0", week: 1, homeTeamExternalId: "T1", awayTeamExternalId: "Y" }),
      row({ gameId: "g2", week: 1, homeTeamExternalId: "T2", awayTeamExternalId: "Z" }),
    ];
    const byTeam = buildTeamSeries(
      rows,
      (r) => r.homeTeamExternalId,
      (r) => r.awayTeamExternalId,
      (r, isHome) => (isHome ? r.week : null),
    );
    expect(byTeam.get("T1")!.map((o) => o.week)).toEqual([1, 2]);

    const { current, next } = lag1Pairs(byTeam);
    // T1 contributes one pair (week1 -> week2); T2 has only one observation, contributes none.
    expect(current).toEqual([1]);
    expect(next).toEqual([2]);
  });
});

describe("longestSameDirectionStreak", () => {
  it("finds the longest run of consecutive same-sign values", () => {
    expect(longestSameDirectionStreak([1, 2, -1, 3, 4, 5, -2, -3])).toBe(3);
  });
  it("returns 0 for an empty series", () => {
    expect(longestSameDirectionStreak([])).toBe(0);
  });
});
