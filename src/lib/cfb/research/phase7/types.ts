// CFB Model V2 Phase 7 — information gap + model misspecification research.
// Consumes frozen Phase 4-6 outputs plus the Phase 7 bounded data extension
// (QB usage, coaching, transfer portal). IPR itself (Phase 0-6) is never
// modified — see architectureGuard.test.ts.

export type MissCategory =
  | "MODEL_GOOD_MARKET_GOOD"
  | "MODEL_GOOD_MARKET_BAD"
  | "MODEL_BAD_MARKET_GOOD"
  | "MODEL_BAD_MARKET_BAD";

/** One FBS-vs-FBS game, one row (market fields use the CONSENSUS provider if present, else the first available provider — see missDataset.ts). */
export type MissDatasetRow = {
  // Identity
  season: number;
  week: number;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;

  // IPR
  modelMargin: number;
  modelTotal: number;
  modelPHomeWin: number;
  expectedHomeScore: number;
  expectedAwayScore: number;
  homeOffenseRating: number | null;
  homeDefenseRating: number | null;
  awayOffenseRating: number | null;
  awayDefenseRating: number | null;

  // Market
  marketProvider: string | null;
  marketMarginOpen: number | null;
  marketMarginLatestObserved: number | null;
  marketTotal: number | null;
  marketPHomeWinFair: number | null;

  // Outcome
  actualMargin: number;
  actualTotal: number;
  winner: "home" | "away";

  // Errors
  modelMarginError: number; // |modelMargin - actualMargin|
  marketMarginError: number | null; // |marketMarginLatestObserved - actualMargin|
  modelTotalError: number;
  marketTotalError: number | null;
  modelVsMarketDisagreement: number | null; // |modelMargin - marketMarginLatestObserved|

  // Structural metadata
  homeGamesPlayedEnteringWeek: number;
  awayGamesPlayedEnteringWeek: number;
  homePriorOffenseTier: string;
  homePriorDefenseTier: string;
  awayPriorOffenseTier: string;
  awayPriorDefenseTier: string;
  homeReturningProductionOffense: number | null;
  awayReturningProductionOffense: number | null;
  homeTalent: number | null;
  awayTalent: number | null;
  homeTransitionTeam: boolean; // no prior-season rating available (Section 6)
  awayTransitionTeam: boolean;
  homeConference: string | null;
  awayConference: string | null;
  homePrevSeasonRating: number | null; // 0.5*(prevOffense+prevDefense)
  awayPrevSeasonRating: number | null;
  homeRatingVolatility: number | null; // |current power - previous-week power|, null at first week of season
  awayRatingVolatility: number | null;

  missCategory: MissCategory;
};

export type ExtremeDisagreementRow = {
  season: number;
  week: number;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  modelMargin: number;
  marketMargin: number;
  actualMargin: number;
  disagreementPoints: number;
  modelPHomeWin: number;
  marketPHomeWin: number | null;
  probabilityGap: number | null;
  homePriorOffenseTier: string;
  awayPriorOffenseTier: string;
  homeGamesPlayedEnteringWeek: number;
  awayGamesPlayedEnteringWeek: number;
  talentDifferential: number | null; // home - away
  prevYearRatingDifferential: number | null;
  returningProductionDifferential: number | null;
  homeRatingVolatility: number | null;
  awayRatingVolatility: number | null;
  closerSide: "model" | "market" | "tie";
};

export type BucketAccuracyRow = {
  bucketLabel: string;
  n: number;
  modelMae: number | null;
  marketMae: number | null;
  modelMinusMarketMae: number | null; // positive = model worse
};

export type TeamWeekContext = {
  season: number;
  week: number; // this snapshot reflects ratings as of strictly-prior games (same cutoff Phase 4 uses to predict this week)
  teamExternalId: string;
  offense: number | null;
  defense: number | null;
  power: number | null; // 0.5*(offense+defense)
  gamesPlayedEnteringWeek: number;
};
