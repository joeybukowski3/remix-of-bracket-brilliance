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

function isPositiveFiniteInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/**
 * Stable key mapping a table row's batter/opposing-pitcher identity to its
 * history record. Returns null (never a key built from garbage input)
 * unless both ids are positive finite integers -- a real MLB player id is
 * always a positive integer, so anything else (null, undefined, NaN,
 * Infinity, zero, negative, a float, a string) means the identity itself
 * can't be trusted, and no lookup should ever be attempted against it.
 * Every caller (generator and frontend) must handle a null return by
 * treating the row/pair as having no resolvable history.
 */
export function buildBvpHistoryKey(batterId, pitcherId) {
  if (!isPositiveFiniteInteger(batterId) || !isPositiveFiniteInteger(pitcherId)) return null;
  return `${batterId}|${pitcherId}`;
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Extracts a validated { pa, h, avg, hr } split from one MLB StatsAPI
 * response, identifying the correct stats[] block by its explicit
 * type.displayName metadata (expectedStatsType) instead of assuming index
 * 0 -- MLB's StatsAPI can return multiple stats[] blocks in a single
 * response (e.g. the combined stats=vsPlayer query returns both "vsPlayer"
 * and "vsPlayerTotal" blocks, and their order is not guaranteed), so
 * positional access risks silently reading the wrong stat type.
 *
 * Returns null (never fabricates, never zero-fills) when:
 *   - no block's type.displayName matches expectedStatsType, or more than
 *     one does (an ambiguous/malformed response -- can't safely pick one)
 *   - the matched block doesn't contain exactly one split (zero splits is
 *     the normal "no data on record for this pair" case; more than one is
 *     unexpected/ambiguous for a single-aggregate stat type like
 *     vsPlayerTotal or vsPlayer5Y and is rejected rather than guessed at)
 *   - plate appearances is missing, non-finite, zero, or negative -- a
 *     window with no plate appearances carries no meaningful H/AVG/HR
 *   - hits or home runs is missing, non-finite, or negative
 *   - avg is missing or non-finite
 */
export function parseVsPlayerSplit(json, expectedStatsType) {
  const statsBlocks = Array.isArray(json?.stats) ? json.stats : [];
  const matchingBlocks = statsBlocks.filter((block) => block?.type?.displayName === expectedStatsType);
  if (matchingBlocks.length !== 1) return null;

  const splits = Array.isArray(matchingBlocks[0].splits) ? matchingBlocks[0].splits : [];
  if (splits.length !== 1) return null;

  const stat = splits[0]?.stat;
  if (!stat) return null;

  const pa = toFiniteNumberOrNull(stat.plateAppearances);
  const h = toFiniteNumberOrNull(stat.hits);
  const avg = toFiniteNumberOrNull(stat.avg);
  const hr = toFiniteNumberOrNull(stat.homeRuns);

  if (pa == null || pa <= 0) return null;
  if (h == null || h < 0) return null;
  if (hr == null || hr < 0) return null;
  if (avg == null) return null;

  return { pa, h, avg, hr };
}

/**
 * True only when the response POSITIVELY CONFIRMS zero prior matchups for
 * this exact window: the correct stats[] block (matched by
 * type.displayName, same rule as parseVsPlayerSplit) was found
 * unambiguously, and it contains exactly zero splits. This is narrower
 * than "parseVsPlayerSplit returned null" -- that also happens for a
 * mismatched/ambiguous block, a block with more than one split, or invalid
 * stat values, none of which confirm anything about whether the matchup
 * happened. Only this function's true result may ever justify telling a
 * user "no prior at-bats" instead of an unqualified dash.
 */
export function isConfirmedEmptyVsPlayerResponse(json, expectedStatsType) {
  const statsBlocks = Array.isArray(json?.stats) ? json.stats : [];
  const matchingBlocks = statsBlocks.filter((block) => block?.type?.displayName === expectedStatsType);
  if (matchingBlocks.length !== 1) return false;
  const splits = Array.isArray(matchingBlocks[0].splits) ? matchingBlocks[0].splits : [];
  return splits.length === 0;
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
 * True when a cached entry is complete enough that this run doesn't need
 * to re-fetch it at all: both windows already resolved to real data (see
 * the generator, which only ever caches entries after parseVsPlayerSplit
 * has already validated them, so a non-null cached window is never
 * zero-filled or fabricated), AND the entry already carries a
 * status of "available" -- this fast path always returns the cached
 * object as-is (see the generator's cache-reuse branch), so requiring
 * status here (rather than just checking career/last5y) guarantees an
 * older-shaped cache entry written before the status field existed can
 * never be reused verbatim without one; it instead falls through to a
 * fresh fetch, which re-derives status correctly via buildBvpHistoryEntry.
 * A pair with even one null window, or a "no_matchups" status, is still
 * eligible for a fresh fetch attempt this run -- re-confirming a confirmed
 * no-matchups pair every run is safer than permanently trusting a stale
 * confirmation, and a null window may resolve on retry.
 */
export function isCachedEntryFullyValid(entry) {
  return Boolean(entry) && entry.career != null && entry.last5y != null && entry.status === "available";
}

/**
 * Resolves one window (career or last5y) for a pair being actively
 * refreshed this run: uses the freshly-fetched value whenever the fetch
 * attempt itself succeeded -- including when that fresh result is a clean
 * null (no data on record is a real, current answer, not a failure, and
 * must not be silently overridden by a stale cached value). Only falls
 * back to the cached value when the fetch attempt errored (network/HTTP
 * failure), so a transient outage doesn't destroy a previously-good
 * result.
 */
export function resolveWindow(freshValue, fetchErrored, cachedValue) {
  if (fetchErrored) return cachedValue ?? null;
  return freshValue ?? null;
}

/**
 * Pure decision logic for same-slate cache reuse: given a previously
 * written payload (or null/undefined/malformed), returns a Map of
 * key -> cached entry usable for lookup this run. Prior-slate values (a
 * payload whose date doesn't match slateDate) are discarded outright --
 * this never mixes cached data across slate dates, and a malformed
 * payload (no history array) is treated the same as no cache at all
 * rather than throwing. Keys not present in the returned Map are simply
 * absent from any lookup -- the caller's own iteration over today's pairs
 * (not over this Map) is what makes a pair no longer on the slate vanish
 * from the eventual output, so no separate "prune" step is needed here.
 */
export function filterCacheForSlate(previousPayload, slateDate) {
  if (previousPayload?.date !== slateDate) return new Map();
  const entries = Array.isArray(previousPayload?.history) ? previousPayload.history : [];
  return new Map(entries.filter((entry) => entry?.key).map((entry) => [entry.key, entry]));
}

/** Machine-readable availability state for one BvpHistoryEntry -- see resolveBvpHistoryStatus. */
export const BVP_HISTORY_STATUSES = ["available", "no_matchups", "unavailable", "inconsistent"];

/**
 * Derives the pair-level status from the two resolved windows plus whether
 * each window's own fetch this run positively confirmed zero prior
 * matchups (see isConfirmedEmptyVsPlayerResponse). This is the single
 * source of truth the frontend relies on to distinguish a genuine
 * "No ABs" (both windows independently confirmed empty) from every other
 * reason a value could be missing:
 *
 *   - "inconsistent": the two windows disagreed on a counting stat (see
 *     violatesCareerInvariant) -- neither endpoint is trustworthy here.
 *   - "available": at least one window has real, validated data.
 *   - "no_matchups": both windows are null, AND both were positively
 *     confirmed empty this run (not merely null for some other reason).
 *   - "unavailable": both windows are null, but at least one of them is
 *     null for a reason OTHER than a confirmed-empty response (a fetch
 *     error, a malformed/ambiguous response, or a cache-fallback that
 *     itself couldn't confirm anything this run) -- we genuinely don't
 *     know whether this pair has ever met, so this must never render as
 *     "No ABs".
 */
export function resolveBvpHistoryStatus({ career, last5y, careerConfirmedEmpty, last5yConfirmedEmpty, invariantViolated }) {
  if (invariantViolated) return "inconsistent";
  if (career != null || last5y != null) return "available";
  if (careerConfirmedEmpty && last5yConfirmedEmpty) return "no_matchups";
  return "unavailable";
}

/**
 * Assemble the final BvpHistoryEntry record for one batter/opposing-pitcher
 * pair. When the two windows fail violatesCareerInvariant, the entire pair
 * is treated as unreliable -- both windows are set to null (never
 * zero-filled) rather than publishing a value that can't be trusted. This
 * is a display-only feature: failing soft to "no history" is safer than
 * presenting a potentially wrong number.
 *
 * If batterId/pitcherId don't resolve to a valid key (see
 * buildBvpHistoryKey), the entry's key is null -- callers must not publish
 * or look up an entry in that state; the generator filters invalid ids out
 * before ever reaching this function.
 */
export function buildBvpHistoryEntry({
  batterId,
  pitcherId,
  batter,
  pitcher,
  career,
  last5y,
  careerConfirmedEmpty = false,
  last5yConfirmedEmpty = false,
}) {
  const rejected = violatesCareerInvariant(career, last5y);
  const finalCareer = rejected ? null : (career ?? null);
  const finalLast5y = rejected ? null : (last5y ?? null);
  return {
    key: buildBvpHistoryKey(batterId, pitcherId),
    batterId,
    pitcherId,
    batter: batter ?? null,
    pitcher: pitcher ?? null,
    status: resolveBvpHistoryStatus({
      career: finalCareer,
      last5y: finalLast5y,
      careerConfirmedEmpty,
      last5yConfirmedEmpty,
      invariantViolated: rejected,
    }),
    career: finalCareer,
    last5y: finalLast5y,
  };
}
