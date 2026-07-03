/**
 * mlb-hr-model-version.mjs
 *
 * Centralized HR model version constant. Per the model audit, the live
 * scoring formula (computeBatterHrScore in generate-mlb-hr-props.mjs) is
 * NOT changed by this version bump — this marks the version of the overall
 * HR data pipeline (schema, archive format, confidence rules), so that
 * future scoring-formula changes have a clear place to increment.
 *
 * Increment MLB_HR_MODEL_VERSION whenever:
 *  - The live HR Quality Score weighting or inputs change
 *  - The archive record schema changes in a backward-incompatible way
 *  - The confidence-level rules change
 *
 * Do NOT scatter hardcoded version strings elsewhere — import this constant.
 */

export const MLB_HR_MODEL_VERSION = "mlb-hr-quality-v1.1";

/** Candidate/shadow scoring model version. Never publicly displayed. */
export const MLB_HR_CANDIDATE_MODEL_VERSION = "mlb-hr-candidate-v0.1";

/**
 * Phase 2 opposing-bullpen HR-vulnerability shadow version. Identifies
 * ONLY the bounded, shadow-only bullpen-vulnerability component
 * (mlb-hr-bullpen-shadow.mjs) -- NEVER the live HR Quality Score
 * (computeBatterHrScore in generate-mlb-hr-props.mjs), which remains
 * versioned solely by MLB_HR_MODEL_VERSION above. A shadow record must
 * never be mistaken for a production model version; always store this
 * alongside, not in place of, MLB_HR_MODEL_VERSION.
 */
export const MLB_HR_BULLPEN_SHADOW_VERSION = "mlb-hr-bullpen-shadow-v1";

/**
 * Phase 2 batter platoon (vs-pitcher-hand) shadow version. Identifies
 * ONLY the bounded, shadow-only hand-split component
 * (mlb-hr-hand-split-shadow.mjs) -- NEVER the live HR Quality Score.
 * Same never-in-place-of-MLB_HR_MODEL_VERSION rule as
 * MLB_HR_BULLPEN_SHADOW_VERSION above.
 */
export const MLB_HR_HAND_SPLIT_SHADOW_VERSION = "mlb-hr-hand-split-shadow-v1";

/**
 * Phase 2 HR shadow COMPOSITION version. Identifies the combined result of
 * mlb-hr-phase2-shadow.mjs (bullpen shadow + hand-split shadow blended
 * on top of the untouched live score) -- NEVER the live HR Quality Score,
 * and distinct from the two per-component shadow versions above, which
 * still separately identify each component's own methodology.
 */
export const MLB_HR_PHASE2_SHADOW_VERSION = "mlb-hr-phase2-shadow-v1";

/**
 * HR Quality Score methodology copy, reused anywhere the score is shown
 * publicly so the language stays consistent (UI, social, docs).
 */
export const HR_QUALITY_SCORE_METHODOLOGY =
  "HR Quality Score is a relative matchup-quality ranking, not a calibrated probability.";
