/**
 * Single source of truth for every provisional, non-calibrated constant used
 * by the deterministic PGA Best Bets value pipeline (PR A).
 *
 * Nothing in this file has been backtested against settled results. Every
 * threshold below is a guardrail chosen to keep the pipeline from publishing
 * garbage while the probability model is provisional -- NOT a claim that the
 * number itself is optimal. Do not present these values to readers as
 * calibrated edges.
 */

/** Canonical betting markets. No other market key is valid anywhere in this pipeline. */
export const CANONICAL_MARKETS = Object.freeze(["outright", "top5", "top10", "top20"]);

/**
 * Market/model probability blend weights. Each pair MUST sum to 1 --
 * validated by assertValidBlendWeights below, called at module load and
 * again by the selection layer before any candidate is scored.
 */
export const BLEND_WEIGHTS = Object.freeze({
  outright: Object.freeze({ market: 0.8, model: 0.2 }),
  top5: Object.freeze({ market: 0.75, model: 0.25 }),
  top10: Object.freeze({ market: 0.7, model: 0.3 }),
  top20: Object.freeze({ market: 0.7, model: 0.3 }),
});

/** Minimum blended probability required for a candidate to be eligible in each market. */
export const PROBABILITY_FLOORS = Object.freeze({
  outright: 0.0125,
  top5: 0.05,
  top10: 0.1,
  top20: 0.18,
});

/** Minimum (blendedModelProbability - noVigMarketProbability) required for a candidate to be eligible. */
export const PROBABILITY_EDGE_THRESHOLDS = Object.freeze({
  outright: 0.0075,
  top5: 0.0125,
  top10: 0.015,
  top20: 0.015,
});

/** Minimum expected value (blendedModelProbability * decimalOdds - 1) required for a candidate to be eligible. */
export const EXPECTED_VALUE_THRESHOLDS = Object.freeze({
  outright: 0.08,
  top5: 0.06,
  top10: 0.05,
  top20: 0.04,
});

/** Maximum recommendations per market. These are ceilings, never quotas -- a market may legitimately publish zero. */
export const MARKET_CAPS = Object.freeze({
  outright: 3,
  top5: 3,
  top10: 4,
  top20: 5,
});

/** Ladder combinations allowed as a golfer's second appearance. All other combinations are disabled by default. */
export const ALLOWED_LADDER_COMBINATIONS = Object.freeze([
  Object.freeze(["outright", "top20"]),
  Object.freeze(["top5", "top20"]),
]);

/** A second ladder leg's EV must clear both this floor AND the proportional-to-primary rule below. */
export const LADDER_SECOND_LEG_MIN_EV = Object.freeze({
  outright: 0.08,
  top5: 0.06,
  top10: 0.05,
  top20: 0.04,
});

/** Second leg EV must be >= this fraction of the primary leg's EV. */
export const LADDER_SECOND_LEG_EV_RATIO = 0.6;

/**
 * Minimum meaningful gap, in canonical market "distance" (index into
 * CANONICAL_MARKETS), between a ladder's two legs -- prevents e.g. a top10
 * paired with a top20 finish-threshold that is not meaningfully different.
 * Both allowed combinations (outright+top20, top5+top20) already clear this.
 */
export const LADDER_MIN_MARKET_DISTANCE = 2;

/** Maximum appearances (as a unique recommendation entry) for one golfer across the whole slate. */
export const MAX_GOLFER_APPEARANCES = 2;

/** Market-completeness requirements before a no-vig calculation is trusted. */
export const MARKET_COMPLETENESS = Object.freeze({
  minOutcomeCount: 3,
  minModeledFieldCoverage: 0.6,
  minOfficialFieldCoverage: 0.5,
  maxOverround: 1.35,
});

/** Odds are considered stale after this many minutes since fetchedAt. */
export const ODDS_FRESHNESS_MAX_MINUTES = 180;

/** Event start-date tolerance (days) for provider event matching. */
export const EVENT_DATE_TOLERANCE_DAYS = 2;

/** Model Leans caps when verified odds are unavailable. Context-only, never a wager. */
export const MODEL_LEANS_CAPS = Object.freeze({
  total: 10,
  outright: 2,
  top5: 2,
  top10: 3,
  top20: 3,
});

export function assertValidBlendWeights(weights = BLEND_WEIGHTS) {
  for (const market of CANONICAL_MARKETS) {
    const pair = weights[market];
    if (!pair || typeof pair.market !== "number" || typeof pair.model !== "number") {
      throw new Error(`Invalid blend weights for market "${market}": missing market/model numbers.`);
    }
    const sum = pair.market + pair.model;
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`Blend weights for market "${market}" must sum to 1, got ${sum}.`);
    }
  }
  return true;
}

// Fail fast at import time -- a misconfigured blend must never silently ship.
assertValidBlendWeights(BLEND_WEIGHTS);
