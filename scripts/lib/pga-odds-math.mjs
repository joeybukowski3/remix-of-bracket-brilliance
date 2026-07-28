/**
 * Pure odds mathematics for the deterministic PGA Best Bets pipeline.
 *
 * Every function here is a pure numeric transform with no I/O. All inputs are
 * validated defensively: malformed odds return null rather than NaN/Infinity,
 * so callers can fail closed (drop the candidate) instead of propagating a
 * corrupt number into a probability or EV calculation.
 */

/** American odds -> decimal odds. Returns null for invalid input (zero, non-finite, or -100 < n < 100). */
export function americanToDecimal(americanOdds) {
  const n = Number(americanOdds);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 1 + n / 100;
  if (n <= -100) return 1 + 100 / Math.abs(n);
  // -100 < n < 0 is not a valid American price (e.g. -50).
  return null;
}

/** Decimal odds -> American odds. Returns null for invalid input (decimal must be > 1). */
export function decimalToAmerican(decimalOdds) {
  const d = Number(decimalOdds);
  if (!Number.isFinite(d) || d <= 1) return null;
  if (d >= 2) return Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1));
}

/** Raw (vig-inclusive) implied probability from decimal odds. Returns null for invalid input. */
export function rawImpliedProbability(decimalOdds) {
  const d = Number(decimalOdds);
  if (!Number.isFinite(d) || d <= 1) return null;
  return 1 / d;
}

/**
 * Overround (sum of raw implied probabilities) across a COMPLETE set of
 * outcomes for one market, one sportsbook, one snapshot. Callers must supply
 * every listed outcome's decimal odds -- see MARKET_COMPLETENESS in
 * pga-best-bets-config.mjs for the caller-side completeness gate. Returns
 * null if fewer than 1 valid outcome is supplied.
 */
export function overround(decimalOddsList) {
  if (!Array.isArray(decimalOddsList) || decimalOddsList.length === 0) return null;
  let sum = 0;
  let counted = 0;
  for (const decimalOdds of decimalOddsList) {
    const p = rawImpliedProbability(decimalOdds);
    if (p == null) continue;
    sum += p;
    counted += 1;
  }
  if (counted === 0) return null;
  return sum;
}

/**
 * Proportional no-vig probability for one outcome given the full market's
 * overround. This is NOT computed from a subset of "recommended" outcomes --
 * the overround argument must come from the entire sportsbook market
 * snapshot (see overround above), otherwise removing vig from a partial book
 * silently overstates every remaining outcome's probability.
 */
export function noVigProbability(decimalOdds, marketOverround) {
  const raw = rawImpliedProbability(decimalOdds);
  if (raw == null) return null;
  if (!Number.isFinite(marketOverround) || marketOverround <= 0) return null;
  const result = raw / marketOverround;
  if (!Number.isFinite(result)) return null;
  return result;
}
