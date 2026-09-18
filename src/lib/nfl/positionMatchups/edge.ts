/**
 * EDGE +/- formula audit (see report for the full write-up):
 *
 * FOR rank and ALLOWED rank both already run 1 (fewest fantasy points) to
 * 32 (most fantasy points), i.e. both are already oriented so that a HIGHER
 * rank is better for the offense's fantasy upside (a productive offense has
 * a high FOR rank; a generous defense has a high ALLOWED rank). That shared
 * orientation is what makes a simple sum-then-recenter formula correct here
 * -- no per-side inversion is needed first.
 *
 * EDGE = FOR rank + ALLOWED rank - 33
 *
 * - Range: -31 (rank 1 offense vs. rank 1 defense, worst possible matchup)
 *   to +31 (rank 32 offense vs. rank 32 defense, best possible matchup).
 * - Zero is the exact center: a rank-16/17 offense against a rank-16/17
 *   defense (average vs. average) lands at/near 0, not at some off-center
 *   value that needs a lookup table to interpret.
 * - Positive = favorable matchup, negative = unfavorable -- directly
 *   satisfies the "no Very Strong (-28) confusion" requirement, because the
 *   sign and the rating always agree.
 *
 * This is algebraically identical to option A from the brief
 * (`ALLOWED rank - (33 - FOR rank)`), just simplified: both reduce to
 * `FOR rank + ALLOWED rank - 33`. It was chosen over a percentile/normalized
 * blend (option C) because the two inputs are already same-scale integer
 * ranks (1..32) -- converting to percentiles first would only add a lossy
 * rounding step without changing the ordering.
 */
export function computeEdge(forRank: number | null, allowedRank: number | null): number | null {
  if (forRank == null || allowedRank == null) return null;
  return forRank + allowedRank - 33;
}
