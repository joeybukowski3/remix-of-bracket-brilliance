/**
 * League-relative "+/-" rating for the Weekly Matchups matrix.
 *
 * There is no existing z-score/percentile infrastructure for raw metrics
 * (EPA, YPP, Success Rate, trench win rates) anywhere in the repository. This
 * module is the single place that formula is evaluated, so Rankings and
 * Ratings mode can never silently diverge in method across the matrix's
 * metric columns.
 *
 * Formula (approved):
 *   rating = direction * ((value - leagueMean) / leagueStdDev) * RATING_SCALE_FACTOR
 * where `direction` is +1 for higher-is-better metrics and -1 for
 * lower-is-better metrics, so positive always means "better than league
 * average" regardless of the metric's raw polarity.
 *
 * OVR is deliberately NOT computed here: it is the JKB composite rating
 * itself, displayed on its native scale in both Rankings and Ratings mode
 * (see buildOvrCells in matchupMatrixData.ts), never standardized against a
 * league mean/SD.
 *
 * The displayed rating is never clamped. Heatmap color is derived entirely
 * from league rank/percentile (see rankTier.ts), never from this rating's
 * magnitude — two teams with wildly different ratings can share a tier, and
 * that is by design.
 */

export const RATING_SCALE_FACTOR = 10;

export type NflMatrixMetricDirection = "higher-is-better" | "lower-is-better";

/**
 * Compute one metric's league-relative rating for every team in `valuesByAbbr`.
 *
 * The mean/SD are computed from exactly the population passed in — callers are
 * responsible for passing the same data-window population used to resolve each
 * team's own value (e.g. all 32 teams' Blended EPA when the team value is also
 * Blended EPA), per the "population must match the selected window" rule.
 *
 * Population variance (not sample variance) is used, matching a full-league
 * (N=32) denominator rather than a sample estimate. Fewer than two finite
 * league values makes a meaningful spread undefined, so every rating in that
 * case is null rather than a divide-by-zero artifact.
 */
export function computeMatrixRatings(
  valuesByAbbr: ReadonlyMap<string, number | null>,
  direction: NflMatrixMetricDirection
): Map<string, number | null> {
  const finiteValues = [...valuesByAbbr.values()].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );

  const out = new Map<string, number | null>();
  if (finiteValues.length < 2) {
    for (const abbr of valuesByAbbr.keys()) out.set(abbr, null);
    return out;
  }

  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const variance =
    finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finiteValues.length;
  const stdDev = Math.sqrt(variance);
  const sign = direction === "lower-is-better" ? -1 : 1;

  for (const [abbr, value] of valuesByAbbr) {
    if (value == null || !Number.isFinite(value)) {
      out.set(abbr, null);
      continue;
    }
    if (stdDev === 0) {
      // Every team tied — league-average by construction, not "no data".
      out.set(abbr, 0);
      continue;
    }
    out.set(abbr, sign * ((value - mean) / stdDev) * RATING_SCALE_FACTOR);
  }
  return out;
}

/** "+18.4" / "-8.7" / "0.0" — sign always shown except for an exact zero. */
export function formatMatrixRating(rating: number | null): string {
  if (rating == null || !Number.isFinite(rating)) return "N/A";
  const fixed = rating.toFixed(1);
  if (Number(fixed) === 0) return "0.0";
  return rating > 0 ? `+${fixed}` : fixed;
}
