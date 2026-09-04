/**
 * NFL projected game total -- frozen v1 production model contract.
 *
 * Locked by the Phase A-Q research program (see
 * docs/modeling/JKB_MODELING_MASTER_SPEC.md's "JKB total" section and
 * scripts/analysis/nfl-total-model-research/README.md for the full
 * evidence trail). This file is the single source of truth for the
 * contract; nothing here should be changed without a new research phase
 * and a new model version string.
 *
 * NAMING: follows the established JKB football model-version convention
 * (spread: `jkb-power-number-v1.0.0`; WU4A: `nfl-team-opportunity-ridge-market-v1.0.0`;
 * passing: `nfl-passing-direct-ridge-alpha10-production-2022-2025-v1`;
 * receiving: `nfl-receiving-share-x-efficiency-v2.0.0`) -- `<sport-prefix>-<what>-<method>-v<major>.<minor>.<patch>`.
 */

export const NFL_TOTAL_MODEL_VERSION = "jkb-nfl-total-ridge-v1.0.0" as const;
export const NFL_TOTAL_MODEL_NAME = "nfl-total-ridge" as const;
export const NFL_TOTAL_FEATURE_SCHEMA_VERSION = "nfl-total-feature-v1" as const;

/** Fixed feature order -- must match every consumer (fit, score, archive) exactly. */
export const NFL_TOTAL_FEATURE_NAMES = [
  "offenseEpaPerPlay",
  "offenseSuccessRate",
  "opponentDefenseEpaAllowed",
  "opponentDefenseSuccessAllowed",
  "homeIndicator",
] as const;

export const NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES = 6;
export const NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES = 4;
export const NFL_TOTAL_RIDGE_LAMBDA = 1;

/**
 * Training window: 2022-2024, matching the research program's retrospective
 * fold -- the strongest-evidenced configuration (Phase Q pooled/bootstrap
 * results were strongest with 3 seasons pooled; Fold1's single-season fit
 * was a statistical tie with Baseline1). 2025 and 2026 are deliberately
 * excluded from the v1 training window: 2025 is reserved as the
 * out-of-sample evaluation season this model version was validated
 * against, and 2026 outcomes must never enter fitting per this phase's
 * explicit instruction.
 */
export const NFL_TOTAL_TRAINING_SEASONS = [2022, 2023, 2024] as const;

/** Explicitly excluded from v1 -- do not add without a new research phase and version bump. */
export const NFL_TOTAL_EXCLUDED_FROM_V1 = [
  "scoringEnvironment",
  "explosiveRate",
  "vegasSpread",
  "vegasTotal",
  "vegasImpliedTotal",
  "thirdDown",
  "trenches",
  "sacks",
  "turnovers",
  "pace",
  "redZone",
  "weather",
  "injuries",
] as const;

export type NflTotalHistoryStatus = "normal" | "sparse-history" | "limited-history";

/** Minimum EWMA-window games-used before a team's row is considered "normal" rather than sparse/limited. Documented, not a probabilistic confidence score. */
export const NFL_TOTAL_SPARSE_HISTORY_MAX_GAMES = 1;
export const NFL_TOTAL_LIMITED_HISTORY_MAX_GAMES = 3;

export function classifyHistoryStatus(gamesUsed: number): NflTotalHistoryStatus {
  if (gamesUsed <= NFL_TOTAL_SPARSE_HISTORY_MAX_GAMES) return "sparse-history";
  if (gamesUsed <= NFL_TOTAL_LIMITED_HISTORY_MAX_GAMES) return "limited-history";
  return "normal";
}
