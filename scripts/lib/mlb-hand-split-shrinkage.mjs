/**
 * mlb-hand-split-shrinkage.mjs
 *
 * Pure empirical-Bayes-style shrinkage for a batter's platoon (vs left /
 * vs right) hitting split, blending the raw split metric toward the
 * batter's own current-season overall hitting line as plate appearances
 * grow. No filesystem or network dependency.
 *
 * Approved formula (2026-07-02):
 *   sampleWeight = PA / (PA + 80)
 *   shrunkMetric = sampleWeight * rawSplitMetric + (1 - sampleWeight) * fallbackMetric
 *
 * Approved informational sample-size tiers (labels only -- the continuous
 * sampleWeight above, not these tiers, controls actual influence):
 *   insufficient: PA < 20
 *   low:          20-79 PA
 *   medium:       80-199 PA
 *   high:         PA >= 200
 *
 * Fallback source and availability (approved 2026-07-02): the ONLY
 * fallback is the batter's own current-season overall hitting line --
 * NOT a static or dynamic league-average baseline ("Do not add or
 * fabricate static league-average vs-hand baselines in this
 * implementation"). If that fallback is unavailable (the batter's
 * overall-season plate appearances are missing/zero), the entire
 * hand-split component for that side is unavailable and returns a
 * neutral/no-op result -- regardless of how many plate appearances the
 * split itself has. This is a deliberate, approved design choice: the
 * shrinkage formula always needs a fallback metric to blend toward, so
 * "no trustworthy fallback" and "no-op" are the same condition here.
 */

export const SAMPLE_WEIGHT_K = 80;

export const SAMPLE_SIZE_TIER = {
  INSUFFICIENT: "insufficient",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

/** Metrics blended by the shrinkage formula. hrRate = homeRuns / plateAppearances. */
export const SHRUNK_METRIC_KEYS = ["battingAverage", "onBasePercentage", "sluggingPercentage", "ops", "hrRate"];

/** Sanity clamp applied only to OPS as defense-in-depth against pathological blends; a convex blend of two valid rate stats is already bounded, this is a belt-and-suspenders guard. */
const METRIC_BOUNDS = {
  ops: [0.3, 1.3],
};

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampMetric(key, value) {
  const bounds = METRIC_BOUNDS[key];
  if (!bounds || value == null) return value;
  return Math.min(bounds[1], Math.max(bounds[0], value));
}

/**
 * @param {number|null|undefined} plateAppearances
 * @returns {"insufficient"|"low"|"medium"|"high"}
 */
export function classifySampleSizeTier(plateAppearances) {
  const pa = Number(plateAppearances);
  if (!Number.isFinite(pa) || pa < 20) return SAMPLE_SIZE_TIER.INSUFFICIENT;
  if (pa < 80) return SAMPLE_SIZE_TIER.LOW;
  if (pa < 200) return SAMPLE_SIZE_TIER.MEDIUM;
  return SAMPLE_SIZE_TIER.HIGH;
}

/**
 * @param {number|null|undefined} plateAppearances
 * @returns {number} in [0, 1); exactly 0 for PA <= 0 or non-finite input
 */
export function computeSampleWeight(plateAppearances) {
  const pa = Number(plateAppearances);
  if (!Number.isFinite(pa) || pa <= 0) return 0;
  return pa / (pa + SAMPLE_WEIGHT_K);
}

/**
 * Whether a batter's overall-season line is usable as the shrinkage
 * fallback. Deliberately minimal: any recorded plate appearance counts --
 * this is a missing-data guard (catches a call-up with zero season PA, or
 * a failed/empty fetch), not an additional maturity threshold beyond the
 * approved sample-size tiers above.
 *
 * @param {{ plateAppearances?: number|null }|null|undefined} fallback
 * @returns {boolean}
 */
export function isFallbackTrustworthy(fallback) {
  const pa = Number(fallback?.plateAppearances);
  return Boolean(fallback) && Number.isFinite(pa) && pa > 0;
}

/**
 * @typedef {object} SplitMetrics
 * @property {number|null} plateAppearances
 * @property {number|null} battingAverage
 * @property {number|null} onBasePercentage
 * @property {number|null} sluggingPercentage
 * @property {number|null} ops
 * @property {number|null} hrRate
 */

/**
 * Computes the shrunk metrics for one platoon split given its raw metrics
 * and the batter's overall-season fallback metrics.
 *
 * @param {object} input
 * @param {SplitMetrics|null|undefined} input.raw  Raw split metrics (may be null -- a batter with zero appearances against this hand).
 * @param {SplitMetrics|null|undefined} input.fallback  Batter's overall current-season metrics.
 * @returns {{
 *   available: boolean, reason: string,
 *   sampleSizeTier: "insufficient"|"low"|"medium"|"high",
 *   shrinkageWeight: number, shrinkageApplied: boolean,
 *   fallbackUsed: boolean, fallbackSource: string|null,
 *   shrunk: SplitMetrics|null,
 * }}
 */
export function shrinkSplitMetrics({ raw, fallback } = {}) {
  const plateAppearances = Number(raw?.plateAppearances) || 0;
  const sampleSizeTier = classifySampleSizeTier(plateAppearances);

  if (!isFallbackTrustworthy(fallback)) {
    return {
      available: false,
      reason: "no_trustworthy_fallback",
      sampleSizeTier,
      shrinkageWeight: 0,
      shrinkageApplied: false,
      fallbackUsed: false,
      fallbackSource: null,
      shrunk: null,
    };
  }

  const sampleWeight = computeSampleWeight(plateAppearances);
  const shrunk = {};
  for (const key of SHRUNK_METRIC_KEYS) {
    const rawVal = raw?.[key];
    const fallbackVal = fallback?.[key];
    if (rawVal == null && fallbackVal == null) {
      shrunk[key] = null;
      continue;
    }
    const effectiveRaw = rawVal ?? fallbackVal;
    const effectiveFallback = fallbackVal ?? rawVal;
    const blended = sampleWeight * effectiveRaw + (1 - sampleWeight) * effectiveFallback;
    shrunk[key] = clampMetric(key, round(blended, 3));
  }

  return {
    available: true,
    reason: "ok",
    sampleSizeTier,
    shrinkageWeight: round(sampleWeight, 3),
    shrinkageApplied: true,
    fallbackUsed: true,
    fallbackSource: "batter_overall_season",
    shrunk,
  };
}
