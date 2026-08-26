import type { NflPropPosition } from "./identity";

export const NFL_PROP_PLAYER_GAME_CONTEXT_SCHEMA_VERSION = "nfl-prop-player-game-context-v1" as const;

export type NflPropHomeAway = "home" | "away";

/**
 * Reserved for a future phase. Phase 1 never populates this field -- no
 * historical per-week availability join exists yet in this namespace (see
 * README "Intentionally not implemented yet").
 */
export type NflPropAvailabilityStatus = "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "ACTIVE" | null;

/**
 * Player-game identity and environment context shared by all three yardage
 * markets. This type intentionally does not duplicate observed stats
 * (`NflYardageOutcomes`) or model features (`features.ts`) -- it is pure
 * identity + environment.
 */
export type NflPropPlayerGameContext = {
  schemaVersion: typeof NFL_PROP_PLAYER_GAME_CONTEXT_SCHEMA_VERSION;
  season: number;
  week: number;
  /**
   * Null only when the season/week/team could not be joined against the
   * committed `public/data/nfl/<season>/games.json` schedule (see
   * `provenance.gameContextSource` on the owning row). Never fabricated.
   */
  gameId: string | null;
  /** Canonical "gsis:<id>". */
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: NflPropPosition;
  /** Null alongside `gameId` when the schedule join did not resolve. */
  homeAway: NflPropHomeAway | null;
  gameDateUtc: string | null;
  /**
   * Game-environment market context. Deliberately null in every Phase 1 row:
   * no offline, per-game historical market cache (spread/total keyed by
   * gameId) exists in this repository today -- see README "Deferred:
   * historical market context". The field exists now so later phases do not
   * need a schema migration once that source is built.
   */
  spread: number | null;
  total: number | null;
  impliedTeamTotal: number | null;
  /** Deliberately null in every Phase 1 row -- see README. */
  availabilityStatus: NflPropAvailabilityStatus;
};
