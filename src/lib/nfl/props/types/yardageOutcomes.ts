export const NFL_YARDAGE_OUTCOME_SCHEMA_VERSION = "nfl-yardage-outcome-v1" as const;

export type NflYardageMarket = "passing" | "rushing" | "receiving";

export const NFL_YARDAGE_MARKETS: readonly NflYardageMarket[] = ["passing", "rushing", "receiving"];

/**
 * Observed per-player-game outcomes for all three yardage markets in one
 * row. Every field is independently nullable: `null` means the observation
 * was not present on the source row (a genuinely missing value), which is a
 * different fact from `0` (the player took the relevant action and produced
 * nothing, or never had a play of that type but the source still reports a
 * real zero). Nothing here silently coerces a missing observation to zero.
 *
 * Scope is deliberately limited to the seven fields the Phase 1 brief
 * requires -- no touchdowns, interceptions, or other counting stats. Those
 * belong to a future TD-projection scope, not the yardage foundation.
 */
export type NflYardageOutcomes = {
  passAttempts: number | null;
  passingYards: number | null;
  carries: number | null;
  rushingYards: number | null;
  targets: number | null;
  receptions: number | null;
  receivingYards: number | null;
};
