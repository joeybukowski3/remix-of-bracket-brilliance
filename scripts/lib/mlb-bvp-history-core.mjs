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

/** Assemble the final BvpHistoryEntry record for one batter/opposing-pitcher pair. */
export function buildBvpHistoryEntry({ batterId, pitcherId, batter, pitcher, career, last5y }) {
  return {
    key: buildBvpHistoryKey(batterId, pitcherId),
    batterId,
    pitcherId,
    batter: batter ?? null,
    pitcher: pitcher ?? null,
    career: career ?? null,
    last5y: last5y ?? null,
  };
}
