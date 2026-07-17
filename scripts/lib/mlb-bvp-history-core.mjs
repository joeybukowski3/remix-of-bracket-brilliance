/**
 * Pure, browser-safe transform logic for MLB batter-vs-pitcher historical
 * context (career and trailing-5-year PA/H/AVG/HR).
 *
 * No Node-only imports (no fs/path) so this module can be imported directly
 * by both the Node generator script and the Vite/React frontend — the same
 * key-building logic runs on both sides, so a table row can never disagree
 * with its generated history record about which key it maps to.
 *
 * Keyed by (batter MLB id, pitcher MLB id) — a numeric identity pair rather
 * than a name-based key, since career/trailing-5Y splits are specific to
 * that exact batter/pitcher pair, not merely "this pitcher's opponent
 * today". Display-only: this module has no awareness of and never touches
 * hrScore, matchup scores, rankings, filters, or sorting.
 */

/** Stable key mapping a table row's batter/opposing-pitcher identity to its history record. */
export function buildBvpHistoryKey(batterId, pitcherId) {
  return `${batterId}|${pitcherId}`;
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Extracts { pa, h, avg, hr } from one MLB StatsAPI vsPlayer-family response
 * (vsPlayerTotal or vsPlayer5Y — both return at most one split). Returns
 * null when the batter has no recorded plate appearances against that
 * pitcher in the requested window, or when the response could not be
 * parsed — the caller is responsible for distinguishing "unavailable" from
 * "genuinely never faced" only insofar as both render the same way (a dash),
 * matching this codebase's existing "never fabricate, fail to null" pattern.
 */
export function parseVsPlayerSplit(json) {
  const stat = json?.stats?.[0]?.splits?.[0]?.stat;
  if (!stat) return null;

  const pa = toFiniteNumberOrNull(stat.plateAppearances);
  const h = toFiniteNumberOrNull(stat.hits);
  const avg = toFiniteNumberOrNull(stat.avg);
  const hr = toFiniteNumberOrNull(stat.homeRuns);

  if (pa == null && h == null && avg == null && hr == null) return null;
  return { pa, h, avg, hr };
}

/**
 * True when a counting stat (PA, H, or HR -- not AVG, which is a ratio and
 * has no monotonic relationship across windows) is higher in the
 * trailing-5-year split than in the career split. A trailing window can
 * never contain more career events than the all-time total for the same
 * pair, so a violation means the two source endpoints disagree about the
 * same batter/pitcher matchup and neither can be trusted in isolation.
 *
 * Confirmed root cause (see scripts/lib/__fixtures__/mlb-bvp-history/):
 * MLB StatsAPI's vsPlayerTotal endpoint can lag vsPlayer5Y by more than 24
 * hours in reflecting a just-completed game (verified against the
 * pitcher's own game log and a boxscore), and vsPlayer5Y has independently
 * shown its own data-quality issues (a mismatched team field in one
 * fixture) in cases unrelated to same-day lag. Neither endpoint is proven
 * authoritative when they disagree.
 */
export function violatesCareerInvariant(career, last5y) {
  if (career == null || last5y == null) return false;
  if (last5y.pa != null && career.pa != null && last5y.pa > career.pa) return true;
  if (last5y.h != null && career.h != null && last5y.h > career.h) return true;
  if (last5y.hr != null && career.hr != null && last5y.hr > career.hr) return true;
  return false;
}

/**
 * Assemble the final BvpHistoryEntry record for one batter/opposing-pitcher
 * pair. When the two windows fail violatesCareerInvariant, the entire pair
 * is treated as unreliable -- both windows are set to null (never
 * zero-filled) rather than publishing a value that can't be trusted. This
 * is a display-only feature: failing soft to "no history" is safer than
 * presenting a potentially wrong number.
 */
export function buildBvpHistoryEntry({ batterId, pitcherId, batter, pitcher, career, last5y }) {
  const rejected = violatesCareerInvariant(career, last5y);
  return {
    key: buildBvpHistoryKey(batterId, pitcherId),
    batterId,
    pitcherId,
    batter: batter ?? null,
    pitcher: pitcher ?? null,
    career: rejected ? null : (career ?? null),
    last5y: rejected ? null : (last5y ?? null),
  };
}
