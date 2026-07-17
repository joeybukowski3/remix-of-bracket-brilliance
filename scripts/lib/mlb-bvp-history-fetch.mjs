/**
 * Network layer for MLB batter-vs-pitcher historical context.
 *
 * Free, unauthenticated MLB StatsAPI v1 only — no paid vendor, no new
 * external package. Follows the same fetchJsonWithRetry / runLimited /
 * injectable-fetchImpl approach already used by
 * scripts/lib/mlb-strikeout-prop-details-fetch.mjs, kept self-contained
 * here so this feature does not couple to that (unrelated) pipeline.
 *
 * Endpoint used (two calls per batter/pitcher pair):
 *   GET /people/{batterId}/stats?stats=vsPlayerTotal&opposingPlayerId={pitcherId}&group=hitting&sportId=1
 *   GET /people/{batterId}/stats?stats=vsPlayer5Y&opposingPlayerId={pitcherId}&group=hitting&sportId=1
 * Both return a single pre-aggregated split (career, trailing 5 years) —
 * no manual season-by-season aggregation needed.
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;
export { MLB_STATS_API, DEFAULT_CONCURRENCY };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(250 * 2 ** attempt, 2000);
}

async function fetchJsonWithRetry(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(boundedBackoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Failed request: ${url}`);
}

export async function runLimited(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

/**
 * Fetches one vsPlayer-family stat split (vsPlayerTotal or vsPlayer5Y) for
 * a batter against a specific opposing pitcher. Never throws — returns
 * { json: null, error } on any network/HTTP failure so the caller can fail
 * softly per pair.
 */
export async function fetchVsPlayerSplit(batterId, pitcherId, statsType, options = {}) {
  try {
    const json = await fetchJsonWithRetry(
      `${MLB_STATS_API}/people/${batterId}/stats?stats=${statsType}&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`,
      options,
    );
    return { json, error: null };
  } catch (error) {
    return { json: null, error };
  }
}

/** Fetches both career (vsPlayerTotal) and trailing-5-year (vsPlayer5Y) splits for one batter/pitcher pair, in parallel. */
export async function fetchBvpHistoryForPair(batterId, pitcherId, options = {}) {
  const [careerResult, last5yResult] = await Promise.all([
    fetchVsPlayerSplit(batterId, pitcherId, "vsPlayerTotal", options),
    fetchVsPlayerSplit(batterId, pitcherId, "vsPlayer5Y", options),
  ]);
  return {
    careerJson: careerResult.json,
    careerError: careerResult.error,
    last5yJson: last5yResult.json,
    last5yError: last5yResult.error,
  };
}
