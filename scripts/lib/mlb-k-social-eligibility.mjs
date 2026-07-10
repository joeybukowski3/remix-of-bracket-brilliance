/**
 * mlb-k-social-eligibility.mjs
 *
 * Independent eligibility gate for social posting of K props (see
 * scripts/post-mlb-strikeout-props-to-x.mjs). Never trust that the page's
 * own row selection already excluded low-confidence rows -- even if a
 * future change to the site's sort/selection logic stops filtering by
 * status, the poster must refuse to include anything but an explicit
 * VALID row. A missing/unrecognized status (e.g. a page render that
 * predates the data-k-status attribute) is treated as ineligible, not an
 * implicit pass -- see src/lib/mlb/kPropStatus.ts for the shared
 * VALID/LOW_CONFIDENCE/INSUFFICIENT_DATA/INVALID_ODDS/INVALID_WORKLOAD/
 * NO_MARKET classification this status value comes from.
 *
 * Kept in its own side-effect-free module (rather than inline in the
 * poster script) so it can be unit tested without importing the poster
 * script itself, which runs main() unconditionally at import time.
 *
 * @param {Array<{ status?: string|null }>} rows
 * @returns {{ eligibleRows: Array<object>, excludedCount: number, excludedStatuses: string[] }}
 */
export function filterEligibleKRows(rows) {
  const eligibleRows = rows.filter((row) => row.status === "VALID");
  const excludedCount = rows.length - eligibleRows.length;
  const excludedStatuses = rows.filter((row) => row.status !== "VALID").map((row) => row.status || "missing");
  return { eligibleRows, excludedCount, excludedStatuses };
}
