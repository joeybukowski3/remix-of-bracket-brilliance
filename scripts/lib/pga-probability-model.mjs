/**
 * Provisional deterministic PGA finish-probability model.
 *
 * NOT historically calibrated. This is a field-relative strength transform
 * plus a Plackett-Luce-style independent exponential-race approximation --
 * clearly documented below -- not a backtested statistical model. Treat every
 * output as a guardrail-quality estimate, never as a validated probability.
 *
 * ─── Method ──────────────────────────────────────────────────────────────
 * 1. Each player gets a positive "strength" from their tournament model rank
 *    via a monotonic exponential decay (deriveFieldStrength) -- a better
 *    (lower-numbered) rank always yields strictly higher strength.
 * 2. Plackett-Luce admits an exact equivalent representation (Yellott's
 *    independent-race construction): assign each player an independent
 *    Exponential race-time with rate = strength; the player with the
 *    smallest race-time finishes first, and so on. Under that
 *    representation, the pairwise probability that competitor j's race-time
 *    beats player i's is exactly q_j = strength_j / (strength_i + strength_j)
 *    -- an exact result, not an approximation.
 * 3. The APPROXIMATION: treating each competitor's "beats player i" event as
 *    an independent Bernoulli(q_j) is not exactly true jointly (the true
 *    joint race outcome has some dependence across competitors), but it is a
 *    standard, well-behaved simplification used in practical multi-competitor
 *    ranking models. Under this approximation, the number of competitors who
 *    beat player i, K, follows a Poisson-Binomial distribution, computed here
 *    via an exact O(field size * maxThreshold) DP (no simulation, no
 *    randomness).
 * 4. win/top5/top10/top20 are ALL read off the SAME K distribution at
 *    different thresholds (K<=0 / K<=4 / K<=9 / K<=19), which is what
 *    guarantees win <= top5 <= top10 <= top20 by construction -- P(K<=n) is
 *    non-decreasing in n for any distribution.
 *
 * This keeps every required invariant (monotonic in strength, monotonic
 * ordering across markets, bounded in [0,1], deterministic, no randomness,
 * field-size sensitive) while staying exactly tractable for a ~150-player
 * field. Replacing this with a fully joint, historically calibrated model is
 * explicitly out of scope for this PR.
 */

/** Rank -> strength decay rate. Provisional; not fit to any outcome data. */
const DEFAULT_DECAY_RATE = 0.045;

/** Positions counted as "beating player i" for each canonical market (K <= threshold). */
export const FINISH_THRESHOLDS = Object.freeze({ win: 0, top5: 4, top10: 9, top20: 19 });

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Monotonic rank -> strength transform. A lower (better) rank always
 * produces a strictly higher strength than any higher (worse) rank, for any
 * fixed decayRate. Returns null for a non-positive/non-finite rank.
 */
export function deriveFieldStrength(rank, { decayRate = DEFAULT_DECAY_RATE } = {}) {
  const r = Number(rank);
  if (!Number.isFinite(r) || r < 1) return null;
  return Math.exp(-decayRate * (r - 1));
}

/**
 * Build a Map of playerKey -> strength from field rows `{ playerKey, rank }`.
 * Rows with an invalid rank are dropped rather than defaulted, so a
 * malformed row can never silently inflate or deflate the field.
 */
export function buildFieldStrengthMap(rows, options = {}) {
  const map = new Map();
  for (const row of rows ?? []) {
    const strength = deriveFieldStrength(row?.rank, options);
    if (strength == null || !row?.playerKey) continue;
    map.set(row.playerKey, strength);
  }
  return map;
}

/**
 * Finish probabilities for one player given the full field's strength map.
 * Order of iteration over `fieldStrengthMap` does not affect the result
 * (Poisson-Binomial convolution is commutative).
 */
export function computeFinishProbabilities(fieldStrengthMap, playerKey) {
  const strengthI = fieldStrengthMap.get(playerKey);
  if (!Number.isFinite(strengthI) || strengthI <= 0) {
    return { win: 0, top5: 0, top10: 0, top20: 0 };
  }

  const maxThreshold = FINISH_THRESHOLDS.top20;
  let dp = new Array(maxThreshold + 1).fill(0);
  dp[0] = 1;

  for (const [key, strengthJ] of fieldStrengthMap) {
    if (key === playerKey) continue;
    if (!Number.isFinite(strengthJ) || strengthJ <= 0) continue;
    const q = strengthJ / (strengthJ + strengthI);
    const next = new Array(maxThreshold + 1).fill(0);
    for (let k = 0; k <= maxThreshold; k++) {
      const stay = dp[k] * (1 - q);
      const advance = k > 0 ? dp[k - 1] * q : 0;
      next[k] = stay + advance;
    }
    dp = next;
  }

  const cumulative = (n) => {
    let sum = 0;
    for (let k = 0; k <= Math.min(n, maxThreshold); k++) sum += dp[k];
    return clamp01(sum);
  };

  const win = cumulative(FINISH_THRESHOLDS.win);
  const top5 = Math.max(win, cumulative(FINISH_THRESHOLDS.top5));
  const top10 = Math.max(top5, cumulative(FINISH_THRESHOLDS.top10));
  const top20 = Math.max(top10, cumulative(FINISH_THRESHOLDS.top20));

  return { win: clamp01(win), top5: clamp01(top5), top10: clamp01(top10), top20: clamp01(top20) };
}

/**
 * Finish probabilities for every player in the field, keyed by playerKey.
 * Deterministic and input-order-invariant: the same set of `{ playerKey,
 * rank }` rows in any order produces byte-identical output.
 */
export function computeFieldProbabilities(rows, options = {}) {
  const strengthMap = buildFieldStrengthMap(rows, options);
  const result = {};
  for (const key of strengthMap.keys()) {
    result[key] = computeFinishProbabilities(strengthMap, key);
  }
  return result;
}
