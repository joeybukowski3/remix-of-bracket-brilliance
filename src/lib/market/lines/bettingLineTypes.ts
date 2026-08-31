/**
 * WU8 — provider-neutral betting-line snapshot model.
 *
 * A betting line describes the raw price a single sportsbook is offering.
 *
 * One {@link BettingLineSnapshot} is one sportsbook's state for one game at one
 * observation. Market values are nullable where the provider did not return that
 * market — we never fabricate a price or an opposite-side value.
 */

export const BETTING_LINE_SCHEMA_VERSION = "jkb-betting-line-v1" as const;

export type BettingLineLeague = "nfl";

/** Point spread for one book. `homeLine` negative identifies the favourite. */
export type BettingLineSpread = {
  homeLine: number | null;
  awayLine: number | null;
  homePrice: number | null;
  awayPrice: number | null;
};

export type BettingLineTotal = {
  line: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type BettingLineMoneyline = {
  homePrice: number | null;
  awayPrice: number | null;
};

export type BettingLineSnapshot = {
  schemaVersion: typeof BETTING_LINE_SCHEMA_VERSION;

  league: BettingLineLeague;
  season: number;
  week: number | null;
  jkbGameId: string;

  provider: string;
  providerEventId: string;
  sportsbook: string;

  capturedAt: string;
  /** Bookmaker `last_update` from the provider, or `null` if absent. */
  providerUpdatedAt: string | null;

  homeTeamId: string;
  awayTeamId: string;
  kickoffUtc: string | null;

  spread: BettingLineSpread | null;
  total: BettingLineTotal | null;
  moneyline: BettingLineMoneyline | null;

  contentHash: string | null;

  /** Collector observation metadata; not a provider "opening line" proxy. */
  firstObservedAt: string;
  lastObservedAt: string;
};

export type StoredBettingLineSnapshot = BettingLineSnapshot & {
  id: string;
  contentHash: string;
};

/** Identity that partitions one line-observation series from another. */
export type BettingLineSeriesKey = {
  league: BettingLineLeague;
  jkbGameId: string;
  provider: string;
  sportsbook: string;
};
