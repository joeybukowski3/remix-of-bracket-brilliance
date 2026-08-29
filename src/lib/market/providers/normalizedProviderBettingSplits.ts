import type {
  BettingLeague,
  BettingMoneylineSplit,
  BettingSpreadSplit,
  BettingTotalSplit,
} from "../bettingSplitsTypes";

export const NORMALIZED_PROVIDER_BETTING_SPLITS_SCHEMA_VERSION =
  "jkb-normalized-provider-betting-splits-v1" as const;

/**
 * Provider-neutral betting splits before canonical JKB game/team identity is known.
 * WU3 owns the join from this shape into BettingSplitSnapshot.
 */
export type NormalizedProviderBettingSplit = {
  schemaVersion: typeof NORMALIZED_PROVIDER_BETTING_SPLITS_SCHEMA_VERSION;

  league: BettingLeague;
  season: number;
  week: number | null;

  provider: string;
  providerGameId: string;
  providerAwayTeamId: string | null;
  providerAwayTeamName: string | null;
  providerHomeTeamId: string | null;
  providerHomeTeamName: string | null;
  kickoffUtc: string | null;
  sportsbook: string | null;

  capturedAt: string;
  providerCreatedAt: string | null;
  providerLastSeenAt: string | null;

  spread: BettingSpreadSplit | null;
  total: BettingTotalSplit | null;
  moneyline: BettingMoneylineSplit | null;
};
