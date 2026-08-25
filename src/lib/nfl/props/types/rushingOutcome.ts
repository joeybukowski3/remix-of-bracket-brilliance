export const NFL_RUSHING_OUTCOME_SCHEMA_VERSION = "nfl-rushing-outcome-v1" as const;

export type NflRushingPosition = "QB" | "RB" | "WR" | "TE";

/**
 * One player-game rushing outcome. Population and semantics:
 *
 * - Includes every player-game row with `carries > 0` at QB/RB/WR/TE
 *   (positions verified to carry meaningful rushing volume -- see
 *   docs/nfl-rushing-baseline-competition.md "Target population").
 * - `carries`/`rushingYards` are the OFFICIAL stats_player_week values.
 *   Kneels are included in official rushing yardage/attempts by the NFL's
 *   own statistical convention and by nflverse's `carries`/`rushing_yards`
 *   columns (verified: these are the same source the Phase 1 outcome
 *   pipeline already treats as official, unmodified). This matches
 *   sportsbook settlement practice, which also uses the official box score.
 * - `pregameEligible` is computed from STRICTLY PRIOR games only (see
 *   `rushingOutcomes.ts`) -- never from this row's own carries. A row can
 *   be `pregameEligible: false` (e.g. a true emergent/never-before-used
 *   ball-carrier) and is still retained in the outcome artifact for
 *   completeness, but is excluded from the MODELING population.
 *
 * Known scope limitation (documented, not hidden): this artifact contains
 * only rows where the player actually recorded a carry that week. A true
 * zero-carry week for an otherwise-eligible player (benched, healthy
 * scratch, injured) produces NO row here, because nflverse's
 * `stats_player_week` itself does not emit one. Building a full
 * roster-universe (so zero-carry weeks appear as real zero outcomes)
 * would require the same kind of week-effective active-roster
 * construction the fantasy pipeline uses -- out of scope for this phase,
 * see README "Intentionally not implemented yet".
 */
export type NflRushingOutcome = {
  schemaVersion: typeof NFL_RUSHING_OUTCOME_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: NflRushingPosition;
  carries: number;
  rushingYards: number;
  /** `rushingYards / carries`. Always defined -- every row has carries > 0 by construction. */
  yardsPerCarry: number;
  /** Team's total rush attempts that same game (from the Phase 2 compact play-volume cache), for carry-share context. Null if unresolved. */
  teamRushAttemptsContext: number | null;
  /** `carries / teamRushAttemptsContext`. Null if the denominator is unavailable. */
  carryShare: number | null;
  pregameEligible: boolean;
};
