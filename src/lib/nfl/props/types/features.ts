/**
 * Market-specific model feature schemas. Phase 1 defines the shape only --
 * every category is intentionally empty. No feature is populated, no weight
 * exists, and nothing here is consumed by a model yet. Populating these is
 * Phase 2+ work (team play-volume, opportunity, efficiency, matchup
 * adjustments) and requires separate approval per the architecture review.
 */

export const NFL_PASSING_FEATURE_SCHEMA_VERSION = "nfl-passing-feature-schema-v1" as const;
export const NFL_RUSHING_FEATURE_SCHEMA_VERSION = "nfl-rushing-feature-schema-v1" as const;
export const NFL_RECEIVING_FEATURE_SCHEMA_VERSION = "nfl-receiving-feature-schema-v1" as const;

/**
 * Empty placeholder category. Kept as a distinct named type (not `unknown`
 * or `object`) so each market's feature record can grow its own category
 * shape independently in a later phase without touching the others, and so
 * an accidental early population attempt fails type-checking rather than
 * silently accepting arbitrary keys.
 */
export type NflFeatureCategoryPlaceholder = Record<string, never>;

export const EMPTY_FEATURE_CATEGORY: NflFeatureCategoryPlaceholder = {};

type NflFeatureCategories = {
  opportunity: NflFeatureCategoryPlaceholder;
  playerEfficiency: NflFeatureCategoryPlaceholder;
  opponentEfficiency: NflFeatureCategoryPlaceholder;
  gameEnvironment: NflFeatureCategoryPlaceholder;
  availability: NflFeatureCategoryPlaceholder;
};

export type NflPassingFeatureRecord = NflFeatureCategories & {
  schemaVersion: typeof NFL_PASSING_FEATURE_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  generatedAt: string;
};

export type NflRushingFeatureRecord = NflFeatureCategories & {
  schemaVersion: typeof NFL_RUSHING_FEATURE_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  generatedAt: string;
};

export type NflReceivingFeatureRecord = NflFeatureCategories & {
  schemaVersion: typeof NFL_RECEIVING_FEATURE_SCHEMA_VERSION;
  season: number;
  week: number;
  playerId: string;
  generatedAt: string;
};
