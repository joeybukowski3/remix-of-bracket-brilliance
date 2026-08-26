export const NFL_QB_PASSING_OUTCOME_SCHEMA_VERSION = "nfl-qb-passing-outcome-v1" as const;

export type NflQbInstabilityCategory = "singleQbGame" | "multiQbGame";

/**
 * One team-game's QB passing outcome -- the Phase 4 modeling target
 * (`primaryQbPassingYards`) plus the same primary-QB selection and
 * multi-QB diagnostics established in Phase 3 (kept identical: same
 * tie-break rule, same "most attempts wins" definition of primary).
 * `primaryQbPassingTds` / `primaryQbInterceptions` are diagnostic only,
 * never a model feature or target.
 *
 * No row is ever dropped for being a multi-QB game, an injury-shortened
 * game, a benching, or a poor performance -- see
 * docs/nfl-qb-passing-baseline-competition.md "Historical target".
 */
export type NflQbPassingOutcome = {
  schemaVersion: typeof NFL_QB_PASSING_OUTCOME_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  primaryQbPlayerId: string;
  primaryQbPlayerName: string;
  primaryQbAttempts: number;
  primaryQbCompletions: number;
  primaryQbPassingYards: number;
  /** `passingYards / attempts`. Always defined -- every row has attempts > 0 by construction. */
  primaryQbYardsPerAttempt: number;
  primaryQbPassingTds: number;
  primaryQbInterceptions: number;
  backupQbAttempts: number;
  backupQbPassingYards: number;
  qbCountThisWeek: number;
  instabilityCategory: NflQbInstabilityCategory;
  primaryQbAttemptShare: number | null;
  teamDropbacksContext: number | null;
};
