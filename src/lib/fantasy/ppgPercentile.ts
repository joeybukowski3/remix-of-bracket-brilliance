/**
 * Percentile-based color scale for projected PPG in the Top Fantasy Picks
 * board. Population is player rows WITHIN ONE POSITION — a QB's PPG must
 * never be compared against a TE's, since the positions score on entirely
 * different scales. Callers compute one percentile set per position.
 *
 * Uses the same worst -> best, n-1 divisor technique as
 * `computeTeamPercentiles` (src/lib/fantasy/teamPercentiles.ts) rather than
 * `computePercentileRanks` (src/lib/mlb/percentileColorScale.ts): that MLB
 * scale divides by n and is calibrated for populations of hundreds, which
 * caps the single best player in a ~30-60 row position pool short of its own
 * 98-percentile "Elite" band. Dividing by n-1 makes the endpoints exact, so
 * the top projected player at a position always reads a true 100.
 *
 * Color is presentation only — it never changes projected PPG values or rank
 * order.
 */

import { getPercentileTier } from "@/lib/mlb/percentileColorScale";

export type PpgColorStyle = {
  backgroundColor: string;
  color: string;
};

/**
 * Percentiles for one position's projected PPG population. Rows keep their
 * caller-supplied order; a row with a non-finite/missing PPG resolves to
 * `null` rather than being coerced into the population.
 */
export function computePpgPercentiles(
  rows: ReadonlyArray<{ key: string; projectedPpg: number | null | undefined }>,
): Map<string, number> {
  const result = new Map<string, number>();
  const finite = rows.filter(
    (row): row is { key: string; projectedPpg: number } =>
      row.projectedPpg != null && Number.isFinite(row.projectedPpg),
  );
  if (finite.length === 0) return result;
  if (finite.length === 1) {
    result.set(finite[0].key, 50);
    return result;
  }

  const sorted = [...finite].sort((a, b) => a.projectedPpg - b.projectedPpg);
  const denominator = finite.length - 1;
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].projectedPpg === sorted[index].projectedPpg) end += 1;
    const percentile = (index / denominator) * 100;
    for (let i = index; i < end; i += 1) result.set(sorted[i].key, percentile);
    index = end;
  }
  return result;
}

/**
 * Visual style for one player's PPG percentile within their position.
 * `null` percentile (missing/unranked) renders with no special styling.
 */
export function ppgPercentileStyle(percentile: number | null | undefined): PpgColorStyle | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  const clamped = Math.min(100, Math.max(0, percentile));
  return getPercentileTier(clamped).style;
}
