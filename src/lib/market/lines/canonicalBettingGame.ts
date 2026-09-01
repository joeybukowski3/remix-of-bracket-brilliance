import type { BettingLineLeague } from "./bettingLineTypes";

/**
 * A JKB-canonical game the betting-lines join targets.
 *
 * Identity is always JKB's own (`jkbGameId`, canonical team ids) — never a
 * provider event id. The caller narrows the slate to one league / season / week
 * before handing it to {@link ./bettingLineGameJoin}.
 */
export type CanonicalBettingGame = {
  league: BettingLineLeague;
  season: number;
  week: number | null;
  jkbGameId: string;
  awayTeamId: string;
  homeTeamId: string;
  kickoffUtc: string | null;
  neutralSite: boolean;
};
