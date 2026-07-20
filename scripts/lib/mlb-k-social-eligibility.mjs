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

/**
 * The live K Props table (SocialTableK in MlbGameDetail.tsx) renders one
 * `[data-k-row]` block for mobile (`sm:hidden`) and a second, separate one
 * for desktop (`hidden sm:block`) -- a normal responsive pattern for human
 * visitors, but Tailwind's responsive classes only toggle CSS `display`,
 * they never remove either block from the DOM. The poster's Playwright
 * scrape (post-mlb-strikeout-props-to-x.mjs) selects `[data-k-row]` without
 * a visibility filter, so at any single viewport width it collects BOTH the
 * visible and the CSS-hidden copy of every row -- every pitcher scraped
 * twice, identical in every field. That duplication survives selection and
 * trips the artifact's own duplicate-row-identity guard
 * (mlb-x-selection-artifact.mjs), which then fails closed with
 * FAILED_ARTIFACT_SELECTION_MISMATCH and blocks the post entirely.
 *
 * Dedupe defensively at the scrape boundary instead of relying on DOM
 * visibility timing: two scraped rows for the same pitcher/team/opponent on
 * the same page load are always the responsive-duplicate case, never two
 * genuinely different plays (a pitcher can only start once, for one team,
 * against one opponent, per slate day).
 *
 * @param {Array<{ pitcher?: string, team?: string, opponent?: string }>} rows
 * @returns {{ rows: Array<object>, duplicatesRemoved: number }}
 */
export function dedupeScrapedKRows(rows) {
  const seen = new Set();
  const deduped = [];
  let duplicatesRemoved = 0;
  for (const row of rows) {
    const key = [row.pitcher, row.team, row.opponent].map((v) => String(v ?? "").trim().toUpperCase()).join("|");
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }
  return { rows: deduped, duplicatesRemoved };
}
