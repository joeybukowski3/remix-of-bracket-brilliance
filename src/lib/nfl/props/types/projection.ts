import type { NflYardageMarket } from "./yardageOutcomes";
export {
  NFL_YARDAGE_MATCHUP_SCORE_SCHEMA_VERSION,
  type NflYardageMatchupScore,
} from "./matchupScore";

/**
 * Canonical projection output shapes. Phase 1 defines these schemas only --
 * no model has been fit, so every numeric field a future model would
 * populate is typed nullable and this namespace never constructs a non-null
 * instance yet. Keeping the schema real now (rather than deferring it)
 * lets Phase 2+ modeling code and its tests target a stable contract.
 */

export const NFL_YARDAGE_PROJECTION_SCHEMA_VERSION = "nfl-yardage-projection-v1" as const;
export const NFL_YARDAGE_PROP_EDGE_SCHEMA_VERSION = "nfl-yardage-prop-edge-v1" as const;

/**
 * The statistical yard projection. This is the production goal:
 * `player/opportunity/opponent data -> statistical yard projection`.
 * Deliberately does NOT carry a matchup score or a prop edge -- those are
 * separate output types below, per the required conceptual separation
 * (a projection is never derived from a score, and a score is never
 * derived from a projection).
 */
export type NflYardageProjection = {
  schemaVersion: typeof NFL_YARDAGE_PROJECTION_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  market: NflYardageMarket;
  /** Null until a Phase 3+ model is fit and promoted. */
  projectedYards: number | null;
  /** Reserved for a future phase (Phase 6 calibration). Always null today. */
  uncertainty: null;
  /** Null: no model version exists yet in Phase 1. */
  modelVersion: string | null;
  /** Ties this projection to the historical outcome artifact schema version it was built against. */
  dataVersion: string;
  generatedAt: string;
};

/**
 * Future-only. Nothing in this codebase constructs one -- Phase 7
 * (sportsbook player-prop integration) remains explicitly blocked per the
 * architecture review until a compliant line source is identified and
 * separately approved. Defined now, as a wholly separate type from
 * `NflYardageProjection` rather than an optional field on it, purely so a
 * later consumer has a stable shape to target without a schema migration.
 */
export type NflYardagePropEdge = {
  schemaVersion: typeof NFL_YARDAGE_PROP_EDGE_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  market: NflYardageMarket;
  projectedYards: number;
  line: number;
  book: string | null;
  edgeYards: number;
  lean: "over" | "under" | "pick";
  generatedAt: string;
};
