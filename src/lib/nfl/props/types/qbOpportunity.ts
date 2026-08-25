export const NFL_QB_OPPORTUNITY_OUTCOME_SCHEMA_VERSION = "nfl-qb-opportunity-outcome-v1" as const;

export type NflQbInstabilityCategory = "singleQbGame" | "multiQbGame";

/**
 * One team-game's QB passing-opportunity outcome. `primaryQbAttempts` (the
 * primary/leading passer's official pass attempts) is the Phase 3
 * modeling target -- see README "Target definition" for why attempts, not
 * a sack/scramble-inclusive "dropback" figure, is the chosen target.
 */
export type NflQbOpportunityOutcome = {
  schemaVersion: typeof NFL_QB_OPPORTUNITY_OUTCOME_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  primaryQbPlayerId: string;
  primaryQbPlayerName: string;
  primaryQbAttempts: number;
  backupQbAttempts: number;
  qbCountThisWeek: number;
  instabilityCategory: NflQbInstabilityCategory;
  /** null when backupQbAttempts + primaryQbAttempts is 0 (cannot happen for a row with a primary QB, kept for schema symmetry). */
  primaryQbAttemptShare: number | null;
  /** Context only, not a target: team-level dropbacks from the Phase 2 compact cache, joined by gameId+team. Null if unresolved. */
  teamDropbacksContext: number | null;
};
