/**
 * mlb-hand-split-fetch.mjs
 *
 * Network layer for the batter hand-split data pipeline. Fetches a
 * batter's platoon (vs left / vs right) hitting splits and overall
 * current-season hitting line from the MLB StatsAPI, with the same
 * concurrency-limit / timeout / bounded-retry approach already used in
 * mlb-bullpen-fetch.mjs.
 *
 * Every exported fetch function accepts an injectable `fetchImpl` so
 * tests can run with zero live network calls.
 *
 * Endpoints used (all public, unauthenticated MLB StatsAPI v1):
 *   GET /people/{id}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season={season}
 *   GET /people/{id}/stats?stats=season&season={season}&group=hitting
 *
 * Response shape verified live 2026-07-02 against real players (Aaron
 * Judge 592450, Shohei Ohtani 660271, Ozzie Albies 645277 -- a switch
 * hitter) and one unknown player id:
 *   - stats[0].splits[] has one entry per side, keyed by split.code
 *     ("vl" = vs Left, "vr" = vs Right).
 *   - StatsAPI's vl/vr splits are already keyed to the OPPOSING PITCHER's
 *     hand, not the batter's own side -- confirmed via the switch hitter,
 *     which returned ordinary vl/vr splits with no third "switch" case.
 *     Callers select vl vs vr using the opposing starter's pitchHand,
 *     never the batter's batSide.
 *   - avg/obp/slg/ops come back as STRINGS (e.g. ".246"), not numbers.
 *   - An unknown/invalid player id returns splits: [] (empty array, not
 *     an error) -- both vl and vr can be legitimately absent.
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
export { MLB_STATS_API };

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(250 * 2 ** attempt, 2000);
}

/**
 * Same bounded-concurrency runner as mlb-bullpen-fetch.mjs -- each
 * pipeline in this repo keeps its own local copy of this exact helper
 * (established convention, see mlb-projected-innings.mjs's
 * parseInningsPitchedString header note) rather than sharing a module.
 */
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

function toNumberOrNull(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalizes one raw MLB StatsAPI hitting `stat` block (from either the
 * statSplits or season endpoint -- both share the same stat shape) into
 * the plain-number metric shape consumed by mlb-hand-split-shrinkage.mjs.
 *
 * @param {object|null|undefined} stat
 * @returns {import("./mlb-hand-split-shrinkage.mjs").SplitMetrics|null}
 */
export function toSplitMetrics(stat) {
  if (!stat) return null;
  const plateAppearances = toNumberOrNull(stat.plateAppearances);
  const homeRuns = toNumberOrNull(stat.homeRuns);
  return {
    plateAppearances,
    atBats: toNumberOrNull(stat.atBats),
    hits: toNumberOrNull(stat.hits),
    homeRuns,
    walks: toNumberOrNull(stat.baseOnBalls),
    strikeouts: toNumberOrNull(stat.strikeOuts),
    battingAverage: toNumberOrNull(stat.avg),
    onBasePercentage: toNumberOrNull(stat.obp),
    sluggingPercentage: toNumberOrNull(stat.slg),
    ops: toNumberOrNull(stat.ops),
    hrRate: plateAppearances != null && plateAppearances > 0 && homeRuns != null ? homeRuns / plateAppearances : null,
  };
}

/**
 * Fetches one batter's vs-left / vs-right hitting splits for the season.
 * Either side (or both) may be null if the batter has no recorded
 * appearances against that hand.
 *
 * @returns {Promise<{ vsLeft: object|null, vsRight: object|null }>}
 */
export async function fetchBatterHandSplits(playerId, season, options = {}) {
  const json = await fetchJsonWithRetry(
    `${MLB_STATS_API}/people/${playerId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=${season}`,
    options
  );
  const splits = json?.stats?.[0]?.splits ?? [];
  const vsLeftSplit = splits.find((split) => split?.split?.code === "vl");
  const vsRightSplit = splits.find((split) => split?.split?.code === "vr");
  return {
    vsLeft: toSplitMetrics(vsLeftSplit?.stat),
    vsRight: toSplitMetrics(vsRightSplit?.stat),
  };
}

/**
 * Fetches one batter's overall current-season hitting line -- used as the
 * ONLY shrinkage fallback (see mlb-hand-split-shrinkage.mjs header note on
 * why this is not a static league-average baseline).
 *
 * @returns {Promise<object|null>}
 */
export async function fetchBatterOverallSeasonStats(playerId, season, options = {}) {
  const json = await fetchJsonWithRetry(
    `${MLB_STATS_API}/people/${playerId}/stats?stats=season&season=${season}&group=hitting`,
    options
  );
  const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  return toSplitMetrics(stat);
}

/**
 * Fetches hand-split + overall data for many players with bounded
 * concurrency. Individual failures are captured per-player rather than
 * failing the whole batch. Duplicate player ids in the input are
 * collapsed to a single request each (avoids redundant calls within a
 * run).
 *
 * @param {number[]} playerIds
 * @param {number} season
 * @returns {Promise<{ resultsByPlayerId: Map<number, {splits: object, overall: object|null}>, failedPlayerIds: number[] }>}
 */
export async function fetchHandSplitsForPlayers(playerIds, season, options = {}) {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const uniquePlayerIds = Array.from(new Set(playerIds));
  const entries = await runLimited(uniquePlayerIds, concurrency, async (playerId) => {
    try {
      const [splits, overall] = await Promise.all([
        fetchBatterHandSplits(playerId, season, options),
        fetchBatterOverallSeasonStats(playerId, season, options),
      ]);
      return { playerId, splits, overall, error: null };
    } catch (error) {
      return { playerId, splits: null, overall: null, error };
    }
  });

  const resultsByPlayerId = new Map();
  const failedPlayerIds = [];
  for (const entry of entries) {
    if (entry.splits) resultsByPlayerId.set(entry.playerId, { splits: entry.splits, overall: entry.overall });
    else failedPlayerIds.push(entry.playerId);
  }
  return { resultsByPlayerId, failedPlayerIds };
}
