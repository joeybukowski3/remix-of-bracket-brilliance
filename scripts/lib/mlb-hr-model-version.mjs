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
 * HR Quality Score methodology copy, reused anywhere the score is shown
 * publicly so the language stays consistent (UI, social, docs).
 */
export const HR_QUALITY_SCORE_METHODOLOGY =
  "HR Quality Score is a relative matchup-quality ranking, not a calibrated probability.";
