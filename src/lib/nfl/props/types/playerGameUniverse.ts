import type { NflPropPosition } from "./identity";

export const NFL_PLAYER_GAME_UNIVERSE_SCHEMA_VERSION = "nfl-player-game-universe-v1" as const;

/**
 * How a universe row's existence was justified.
 * - "statsTable": the player has a real row in nflverse stats_player_week
 *   that week (they definitely played; every stat field, including a zero
 *   in any single category, is a real recorded fact).
 * - "activeRosterConfirmed": no stats_player_week row exists, but
 *   nflverse weekly_rosters records this exact team-week as `status=="ACT"`
 *   (2023-2025 only). Distinct from the explicit `"INA"` (inactive) status
 *   also present in that source, so ACT-with-no-stat-row is treated as "
 *   dressed and recorded zero across every offensive category" -- a true
 *   zero, not a guess. See README "Zero vs missing semantics".
 */
export type NflUniverseMembershipSource = "statsTable" | "activeRosterConfirmed";

export type NflPlayerGameUniverseOutcomes = {
  passAttempts: number | null;
  completions: number | null;
  passingYards: number | null;
  carries: number | null;
  rushingYards: number | null;
  targets: number | null;
  receptions: number | null;
  receivingYards: number | null;
};

export type NflPlayerGameUniverseEligibility = {
  rushingEligiblePregame: boolean;
  receivingEligiblePregame: boolean;
  passingEligiblePregame: boolean;
};

/**
 * One canonical (season, week, gameId, playerId) row. Unlike the Phase 1/3/5
 * outcome artifacts, this INCLUDES legitimate zero-output games for
 * pregame-projectable players -- see README "Canonical player-game
 * universe" for the full membership and zero/missing rules.
 */
export type NflPlayerGameUniverseRow = {
  schemaVersion: typeof NFL_PLAYER_GAME_UNIVERSE_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  gameDateUtc: string | null;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string | null;
  position: NflPropPosition;
  homeAway: "home" | "away" | null;
  membershipSource: NflUniverseMembershipSource;
  /** True only for 2023-2025 (weekly_rosters coverage); false for 2022, where membership can only ever be `statsTable`. */
  rosterStatusKnown: boolean;
  outcomes: NflPlayerGameUniverseOutcomes;
  eligibility: NflPlayerGameUniverseEligibility;
};
