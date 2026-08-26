export const NFL_RECEIVING_OUTCOME_SCHEMA_VERSION = "nfl-receiving-outcome-v1" as const;

export type NflReceivingPosition = "RB" | "WR" | "TE";

/**
 * QB is deliberately excluded from the receiving population: verified
 * against 2025 data, only 11 of 664 QB player-weeks (1.7%) record any
 * target at all (trick plays) -- not a legitimate, modelable receiving
 * role. See docs/nfl-receiving-baseline-competition.md "Target population".
 */
export const RECEIVING_ELIGIBLE_POSITIONS: readonly NflReceivingPosition[] = ["RB", "WR", "TE"];

/**
 * One player-game receiving outcome, built from the Phase 5.5 canonical
 * universe's `receivingEligiblePregame` rows -- INCLUDING true zero-target
 * games for already-eligible players (the same correction rushing
 * received in Phase 5.5). `membershipSource` and `zeroTargetProvenance`
 * are carried through explicitly so a stats-row zero can be distinguished
 * from an ACT-roster-inferred zero in every downstream breakdown -- see
 * README "Zero-target provenance audit".
 */
export type NflReceivingOutcome = {
  schemaVersion: typeof NFL_RECEIVING_OUTCOME_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: NflReceivingPosition;
  targets: number;
  receptions: number;
  receivingYards: number;
  /** `receptions / targets`. Null only when targets = 0 (undefined, not a fabricated 0 or 1). */
  receptionsPerTarget: number | null;
  /** `receivingYards / receptions`. Null when receptions = 0. */
  yardsPerReception: number | null;
  /** `receivingYards / targets`. 0 by convention for a zero-target row (documented, not a division result). */
  yardsPerTarget: number;
  /** Team's total pass attempts that same game, for target-share context. Null if unresolved. */
  teamPassAttemptsContext: number | null;
  /** `targets / teamPassAttemptsContext`. 0 for a zero-target row even without team context. */
  targetShare: number | null;
  zeroTargetFlag: boolean;
  /** Where this row's evidence came from -- "statsTable" (a real recorded box-score row) or "activeRosterConfirmed" (ACT roster status with no stats row; see Phase 5.5 zero-vs-missing policy). */
  membershipSource: "statsTable" | "activeRosterConfirmed";
};
