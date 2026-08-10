/**
 * Reusable normalization utilities for the JKB CFB model.
 *
 * Method: percentile-rank normalization ("percent of the field strictly below
 * this value"), the same conservative approach used elsewhere in this repo
 * (see src/lib/mlb/percentileColorScale.ts computePercentileRanks). Chosen over:
 * - min-max: a single outlier team compresses everyone else toward the middle.
 * - z-score: with real CFB variance this is workable, but a raw z-score does not
 *   guarantee a visually separated 0-100 display range on its own — it still
 *   needs a rescale step, and percentile rank gives that for free while also
 *   being distribution-shape agnostic (CFB score margins are not normally
 *   distributed the way NFL EPA/play tends to be).
 *
 * Ties share the same percentile (a tie does not let one team "jump ahead").
 * Nulls are excluded from the distribution and pass through as null.
 */

export type CfbDisplayScale = { min: number; max: number };

/**
 * Percent of the (non-null) field strictly below each value, as a 0-1 fraction.
 * Preserves input order; null entries stay null.
 */
export function computePercentileRanks(
  values: ReadonlyArray<number | null>,
): Array<number | null> {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) {
    return values.map(() => null);
  }
  if (known.length === 1) {
    return values.map((v) => (v === null ? null : 0.5));
  }

  const sorted = [...known].sort((a, b) => a - b);

  return values.map((value) => {
    if (value === null) return null;
    let countBelow = 0;
    let lo = 0;
    let hi = sorted.length;
    // binary search for first index >= value → count of strictly-less elements
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    countBelow = lo;
    return countBelow / sorted.length;
  });
}

/** Maps a 0-1 percentile onto a display scale, e.g. [40, 99]. */
export function percentileToDisplayRating(percentile: number, scale: CfbDisplayScale): number {
  return scale.min + percentile * (scale.max - scale.min);
}

/**
 * Full pipeline: raw values → percentile ranks → display-scale ratings.
 * Ordering is guaranteed to match the ordering of the input raw values
 * (higher raw → higher or equal display rating).
 */
export function normalizeToDisplayScale(
  rawValues: ReadonlyArray<number | null>,
  scale: CfbDisplayScale,
): Array<number | null> {
  const percentiles = computePercentileRanks(rawValues);
  return percentiles.map((p) => (p === null ? null : percentileToDisplayRating(p, scale)));
}
