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
 *
 * Rate limiting: every HTTP request start -- career, last5y, and every
 * retry attempt -- goes through one shared, global rate limiter capped at
 * DEFAULT_RATE_PER_SECOND request starts per second, regardless of how
 * many pairs are being processed concurrently by runLimited. This is
 * pacing (evenly spaced request starts), not just a concurrency cap: two
 * requests can never start less than 1000/rate ms apart.
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_RATE_PER_SECOND = 5;
export { MLB_STATS_API, DEFAULT_CONCURRENCY, DEFAULT_RATE_PER_SECOND };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(250 * 2 ** attempt, 2000);
}

/**
 * A global request-start pacer: acquire() resolves only once it's this
 * caller's turn, spacing consecutive resolutions at least
 * 1000/ratePerSecond ms apart. Deterministically testable via injectable
 * now()/sleepFn() (no reliance on real timers) -- see
 * mlb-bvp-history-rate-limiter.test.mjs.
 */
export function createRateLimiter(ratePerSecond = DEFAULT_RATE_PER_SECOND, options = {}) {
  const intervalMs = 1000 / ratePerSecond;
  const now = options.now ?? (() => Date.now());
  const sleepFn = options.sleep ?? sleep;
  let nextAvailableAt = 0;

  return {
    async acquire() {
      const current = now();
      const scheduledAt = Math.max(current, nextAvailableAt);
      nextAvailableAt = scheduledAt + intervalMs;
      const delay = scheduledAt - current;
      if (delay > 0) await sleepFn(delay);
    },
    /** Exposed for tests only -- the next timestamp (in the limiter's own clock) a caller would be scheduled at. */
    _peekNextAvailableAt: () => nextAvailableAt,
  };
}

/**
 * One process-wide limiter shared by every fetch call by default, so
 * career, last5y, and retries across every pair in a single generator run
 * are all paced against the same clock. Tests inject their own limiter
 * via options.rateLimiter to avoid real waiting and to assert pacing
 * deterministically.
 */
const sharedRateLimiter = createRateLimiter();

async function fetchJsonWithRetry(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const rateLimiter = options.rateLimiter ?? sharedRateLimiter;
  const sleepFn = options.sleep ?? sleep;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await rateLimiter.acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleepFn(boundedBackoffMs(attempt));
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

/** Fetches both career (vsPlayerTotal) and trailing-5-year (vsPlayer5Y) splits for one batter/pitcher pair, in parallel -- both share whatever rateLimiter is passed in options. */
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
