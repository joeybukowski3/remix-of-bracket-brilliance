/**
 * mlb-k-odds-math.mjs
 *
 * Pure American-odds math for the MLB K probability/value shadow layer
 * (docs/features/mlb-k.md "K +EV" family is a SEPARATE, dormant model --
 * this is new, independent code). No I/O, no clock, no randomness. Mirrors
 * the shape of scripts/lib/pga-odds-math.mjs (implied probability -> no-vig)
 * but works directly in American odds since that is what every K-prop odds
 * field in this repo already stores (kOddsOver / kOddsUnder as strings like
 * "-169").
 *
 * Every function returns null on invalid input rather than NaN/Infinity, so
 * a malformed price fails closed (the row drops out of the probability
 * layer) instead of poisoning a downstream calculation.
 */

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * American odds -> vig-inclusive implied probability.
 *   -110 -> 0.5238
 *   +110 -> 0.4762
 *   -150 -> 0.6000
 *   +150 -> 0.4000
 * Rejects the impossible band -100 < price < 100 (not a valid American
 * price) and any non-finite input.
 */
export function americanToImpliedProbability(price) {
  const n = toFiniteNumber(price);
  if (n === null || n === 0) return null;
  if (n >= 100) return 100 / (n + 100);
  if (n <= -100) return Math.abs(n) / (Math.abs(n) + 100);
  return null;
}

/** American odds -> decimal odds, for callers that want the intermediate form. */
export function americanToDecimal(price) {
  const n = toFiniteNumber(price);
  if (n === null || n === 0) return null;
  if (n >= 100) return 1 + n / 100;
  if (n <= -100) return 1 + 100 / Math.abs(n);
  return null;
}

/**
 * Two-way de-vig for a strikeout Over/Under market.
 *
 * When BOTH sides are present and valid, returns proportional no-vig
 * probabilities (rawOver / (rawOver + rawUnder), the standard two-outcome
 * de-vig used throughout this repo's PGA odds pipeline). When only one side
 * is present, the no-vig fields are explicitly null and `twoSided` is false
 * -- callers must not fabricate a de-vig probability from a single price
 * (STEP 2 / STEP 9 requirement: "do not fabricate a de-vig probability").
 */
export function noVigTwoWayProbabilities(overPrice, underPrice) {
  const overRaw = americanToImpliedProbability(overPrice);
  const underRaw = americanToImpliedProbability(underPrice);

  if (overRaw === null && underRaw === null) {
    return {
      overRawProbability: null,
      underRawProbability: null,
      overround: null,
      overNoVigProbability: null,
      underNoVigProbability: null,
      twoSided: false,
    };
  }

  if (overRaw === null || underRaw === null) {
    return {
      overRawProbability: overRaw,
      underRawProbability: underRaw,
      overround: null,
      overNoVigProbability: null,
      underNoVigProbability: null,
      twoSided: false,
    };
  }

  const overround = overRaw + underRaw;
  if (!Number.isFinite(overround) || overround <= 0) {
    return {
      overRawProbability: overRaw,
      underRawProbability: underRaw,
      overround: null,
      overNoVigProbability: null,
      underNoVigProbability: null,
      twoSided: false,
    };
  }

  return {
    overRawProbability: overRaw,
    underRawProbability: underRaw,
    overround,
    overNoVigProbability: overRaw / overround,
    underNoVigProbability: underRaw / overround,
    twoSided: true,
  };
}
