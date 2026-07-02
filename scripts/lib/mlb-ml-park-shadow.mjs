/**
 * mlb-ml-park-shadow.mjs
 *
 * Phase 2.2 -- Park context for Moneyline (SHADOW ONLY).
 *
 * Treats park as a BOUNDED VARIANCE/UNCERTAINTY MODIFIER, not a directional
 * home/away strength signal. A hitter-friendly park does not "favor" the
 * home or away team -- it raises scoring variance for the game as a whole,
 * which makes any pre-park pick slightly less certain. This module never
 * changes which side is favored; it can only shrink an existing
 * differential toward "push," and only within a small, fixed bound. It
 * structurally cannot flip a pick to the other team (see
 * computeMlParkShadow's non-inversion guarantee below).
 *
 * NEVER read by any live scoring path. NEVER displayed publicly. Not yet
 * wired into generate-mlb-ml-picks.mjs, the archive, or workflows --
 * venue is accepted as a plain input parameter here, since venue isn't
 * fetched anywhere in the Moneyline pipeline yet (a later, explicitly
 * approved commit will add that plumbing).
 *
 * Design (approved 2026-07-02):
 *   - NEUTRAL_BAND_PTS: parks within +/-5 of the 100-index neutral point
 *     produce NO modifier at all (exactly 0), satisfying "neutral parks
 *     should produce no material change."
 *   - MAX_DEVIATION_PTS: a park run-factor deviation of 15+ points beyond
 *     the neutral band (i.e. runs <= 80 or runs >= 120) saturates the
 *     modifier at MAX_VARIANCE_REDUCTION. Coors Field (runs=118, the most
 *     extreme park currently in the table) lands at ~87% of that maximum,
 *     not at the hard cap -- see mlb-park-factors.test.mjs.
 *   - MAX_VARIANCE_REDUCTION: the modifier can shrink a base differential
 *     by at most 15%. Applied as a straight multiplier
 *     (differential * (1 - modifier)), so the result is ALWAYS the same
 *     sign/side as the input and ALWAYS >= 85% of the original magnitude.
 *     This is what makes "cannot flip a strong live pick" a structural
 *     guarantee rather than a tuning target: the pick can only weaken
 *     toward "push" (if it was already close to the push threshold), it
 *     can never flip to the other team.
 */

import { getParkFactors, getParkType, PARK_DATA_SOURCE } from "./mlb-park-factors.mjs";
import { getEdgeTierKeyCore } from "./mlb-ml-edge-core.mjs";
import { MLB_ML_MODEL_VERSION, MLB_ML_PHASE2_SHADOW_VERSION } from "./mlb-ml-model-version.mjs";

/** Run-factor points within which a park is treated as neutral (no modifier). */
export const NEUTRAL_BAND_PTS = 5;

/** Run-factor deviation (beyond the neutral band) at which the modifier saturates. */
export const MAX_DEVIATION_PTS = 20;

/** Hard ceiling on how much a base differential can shrink due to park variance. */
export const MAX_VARIANCE_REDUCTION = 0.15;

/** Same push threshold used by the live Moneyline formula (mlb-ml-edge-core.mjs), so park-adjusted and live/IP-shadow picks stay directly comparable. */
const PUSH_THRESHOLD = 2.5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {number} runFactor  100-indexed park run factor (100 = neutral).
 * @returns {number} variance modifier in [0, MAX_VARIANCE_REDUCTION]
 */
export function computeParkVarianceModifier(runFactor) {
  const deviation = Math.max(0, Math.abs(runFactor - 100) - NEUTRAL_BAND_PTS);
  const cappedDeviation = Math.min(deviation, MAX_DEVIATION_PTS - NEUTRAL_BAND_PTS);
  return (cappedDeviation / (MAX_DEVIATION_PTS - NEUTRAL_BAND_PTS)) * MAX_VARIANCE_REDUCTION;
}

/**
 * @param {object} input
 * @param {string|null|undefined} input.venue  Venue name (raw StatsAPI
 *   spelling is fine -- getParkFactors handles aliasing/normalization).
 * @param {number} input.baseDifferential  Non-negative differential to
 *   adjust (e.g. the live model's `differential`, or an upstream shadow
 *   component's differential -- whatever this is chained after).
 * @param {"away"|"home"|"push"} input.basePick  The side baseDifferential
 *   belongs to. Required so this function never has to guess a sign.
 * @returns {object} park-adjusted shadow result, fully namespaced so it
 *   can never be confused with a live or upstream shadow result.
 */
export function computeMlParkShadow({ venue, baseDifferential, basePick }) {
  const parkFactors = getParkFactors(venue);

  let parkDataQuality;
  if (venue == null || venue === "") parkDataQuality = "missing_venue";
  else if (!parkFactors) parkDataQuality = "unknown_venue";
  else parkDataQuality = "known_venue";

  // Missing or unknown venues fall back to neutral (runFactor = 100,
  // modifier = 0) -- explicit per Phase 2.2 requirement, never silently
  // treated as a "known" data point.
  const runFactor = parkFactors?.runs ?? 100;
  const varianceModifier = parkDataQuality === "known_venue" ? computeParkVarianceModifier(runFactor) : 0;

  // Non-inversion guarantee: this is a straight multiplicative shrink of
  // a non-negative magnitude by a factor in [0.85, 1.0]. The result can
  // never be negative and never changes which side basePick refers to.
  const adjustedDifferential = basePick === "push" ? 0 : baseDifferential * (1 - varianceModifier);

  const parkShadowPick = basePick === "push" || adjustedDifferential < PUSH_THRESHOLD ? "push" : basePick;
  const parkShadowConfidence = parkShadowPick === "push" ? 50 : Math.round(clamp(52 + (adjustedDifferential / 5) * 4, 50, 82));

  return {
    // -- identification / versioning --
    liveModelVersion: MLB_ML_MODEL_VERSION,
    shadowExperimentVersion: MLB_ML_PHASE2_SHADOW_VERSION,
    shadowComponent: "park-context",

    // -- park inputs --
    parkRunFactor: runFactor,
    parkContextTier: getParkType(runFactor),
    parkVarianceModifier: varianceModifier,
    parkDataSource: PARK_DATA_SOURCE,
    parkDataSeason: null, // intentionally null: PARK_DATA_SOURCE is a static multi-year table, not tied to a single season
    parkDataQuality,

    // -- shadow result (chained from basePick/baseDifferential) --
    parkShadowPick,
    parkShadowDifferential: Math.round(adjustedDifferential),
    parkShadowConfidence,
    parkShadowTier: getEdgeTierKeyCore(parkShadowConfidence),

    // -- audit trail: what this was adjusted FROM --
    baseDifferential,
    basePick,
  };
}
