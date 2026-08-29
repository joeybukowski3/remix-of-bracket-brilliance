export const BETTING_SPLITS_SCHEMA_VERSION = "jkb-betting-splits-v1" as const;

export type BettingLeague = "nfl" | "cfb";

export type BettingTeamSide = "away" | "home";

export type BettingTotalSide = "over" | "under";

export type BettingSpreadSplit = {
  /** Team-specific spread. Negative values identify the favored team. */
  openingHomeLine: number | null;
  openingAwayLine: number | null;
  currentHomeLine: number | null;
  currentAwayLine: number | null;
  /** Percentages use the inclusive 0-100 scale. */
  homeBetPct: number | null;
  awayBetPct: number | null;
  homeMoneyPct: number | null;
  awayMoneyPct: number | null;
};

export type BettingTotalSplit = {
  openingLine: number | null;
  currentLine: number | null;
  /** Percentages use the inclusive 0-100 scale. */
  overBetPct: number | null;
  underBetPct: number | null;
  overMoneyPct: number | null;
  underMoneyPct: number | null;
};

export type BettingMoneylineSplit = {
  openingHomePrice: number | null;
  openingAwayPrice: number | null;
  currentHomePrice: number | null;
  currentAwayPrice: number | null;
  /** Percentages use the inclusive 0-100 scale. */
  homeBetPct: number | null;
  awayBetPct: number | null;
  homeMoneyPct: number | null;
  awayMoneyPct: number | null;
};

export type BettingSplitSnapshot = {
  schemaVersion: typeof BETTING_SPLITS_SCHEMA_VERSION;

  league: BettingLeague;
  season: number;
  week: number | null;

  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;

  provider: string;
  providerGameId: string;
  sportsbook: string | null;

  capturedAt: string;
  providerCreatedAt: string | null;
  providerLastSeenAt: string | null;

  spread: BettingSpreadSplit | null;
  total: BettingTotalSplit | null;
  moneyline: BettingMoneylineSplit | null;

  contentHash: string | null;

  /** Collector observation metadata; this is not a provider opening-line proxy. */
  firstObservedAt: string;
  lastObservedAt: string;
};

export type BettingSplitHistoryQuery = {
  league: BettingLeague;
  jkbGameId: string;
  provider?: string;
  /** Omit to include every sportsbook; pass null to select provider consensus. */
  sportsbook?: string | null;
};

export type BettingSplitStalenessOptions = {
  referenceTime: string | Date;
  staleAfterMs: number;
};
