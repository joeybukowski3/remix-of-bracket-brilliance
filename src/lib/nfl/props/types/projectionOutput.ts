/**
 * Canonical cross-market projection output contract (Phase 7). Every
 * market shares the common envelope; market-specific component
 * projections live in their own typed block -- passing is never forced to
 * carry fake decomposition fields just to look symmetrical with rushing/
 * receiving, and vice versa. No implementation constructs a non-null
 * instance yet; this is the schema Phase 8+ production code will target.
 */

export const NFL_PROJECTION_OUTPUT_SCHEMA_VERSION = "nfl-projection-output-v1" as const;

export type NflProjectionMarket = "passing" | "rushing" | "receiving";

/**
 * Distinguishes four states, never collapsed into a boolean and never
 * silently defaulted to a zero projection:
 * - "projected": eligible, sufficient history, a real projection exists.
 * - "eligibleInsufficientHistory": pregame-eligible but the model's own
 *   confidence-relevant history requirement was not met (e.g. a true
 *   first-career-game player) -- a projection MAY still be produced via
 *   shrinkage/fallback, but this status flags it as low-confidence.
 * - "notEligible": failed the market's own pregame eligibility rule
 *   (Phase 5.5 universe) -- no projection should be produced.
 * - "dataUnresolved": identity, game, or team context could not be
 *   resolved -- no projection should be produced; this is a data
 *   integrity gap, not a football judgment.
 */
export type NflProjectionStatus = "projected" | "eligibleInsufficientHistory" | "notEligible" | "dataUnresolved";

export type NflProjectionEnvelope = {
  schemaVersion: typeof NFL_PROJECTION_OUTPUT_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  market: NflProjectionMarket;
  status: NflProjectionStatus;
  /** Null whenever `status !== "projected"` and whenever status is `"eligibleInsufficientHistory"` without a shrinkage fallback being defined for that case. */
  projectedYards: number | null;
  modelVersion: string | null;
  featureVersion: string | null;
  generatedAt: string;
};

export type NflPassingProjection = NflProjectionEnvelope & {
  market: "passing";
  /** Passing's winning architecture is a DIRECT model -- no decomposition legs are fabricated to match rushing/receiving's shape. */
  directModelPrediction: number | null;
};

export type NflRushingProjection = NflProjectionEnvelope & {
  market: "rushing";
  projectedCarries: number | null;
  projectedYardsPerCarry: number | null;
  projectedRushingYards: number | null;
};

export type NflReceivingProjection = NflProjectionEnvelope & {
  market: "receiving";
  projectedTargets: number | null;
  projectedYardsPerTarget: number | null;
  projectedReceivingYards: number | null;
  /** Receiving is the one market where pooled vs. position-specific fitting materially differs (Phase 6) -- recorded so a consumer knows which model family produced this row. */
  positionSegment: "RB" | "WR" | "TE";
};

export type NflYardageProjection = NflPassingProjection | NflRushingProjection | NflReceivingProjection;
