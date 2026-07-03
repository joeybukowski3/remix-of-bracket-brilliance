/**
 * mlb-hand-split-cache.mjs
 *
 * Pure cache-freshness and merge logic for the batter hand-split cache.
 * Deliberately has no filesystem or network dependency -- the build
 * script (scripts/build-mlb-batter-hand-splits.mjs) owns reading/writing
 * public/data/mlb/batter-hand-splits-cache.json and calls these functions
 * to decide what needs refreshing and how to merge results back in.
 *
 * Unlike the bullpen cache (which tracks season/workload sections
 * independently), a hand-split cache entry has a single freshness
 * dimension: one 3-day TTL for the whole per-player entry.
 */

export const FRESHNESS_HOURS = 72; // 3 days, per Phase 2 hand-split approval

export const FRESHNESS_STATUS = {
  FRESH: "fresh",
  STALE_FALLBACK: "stale-fallback",
  MISSING: "missing",
};

function hoursSince(isoTimestamp, now) {
  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return Infinity;
  return (now.getTime() - then) / 3_600_000;
}

/**
 * @param {object|null|undefined} playerCacheEntry
 * @param {Date} now
 * @param {number} [freshnessHours]
 * @returns {boolean}
 */
export function isPlayerFresh(playerCacheEntry, now, freshnessHours = FRESHNESS_HOURS) {
  const fetchedAt = playerCacheEntry?.fetchedAt;
  if (!fetchedAt) return false;
  return hoursSince(fetchedAt, now) <= freshnessHours;
}

/**
 * Determines which of the requested player ids need a refresh, given the
 * existing cache. Duplicate ids in allPlayerIds are collapsed (avoids
 * requesting the same player twice within one run).
 *
 * @param {Record<string, object>} cacheByPlayerId
 * @param {(number|string)[]} allPlayerIds
 * @param {Date} now
 * @returns {(number|string)[]}
 */
export function selectPlayersNeedingRefresh(cacheByPlayerId, allPlayerIds, now, freshnessHours = FRESHNESS_HOURS) {
  const uniquePlayerIds = Array.from(new Set(allPlayerIds));
  return uniquePlayerIds.filter((playerId) => !isPlayerFresh(cacheByPlayerId?.[playerId], now, freshnessHours));
}

/**
 * Merges a fresh refresh result for one player into the existing cache,
 * preserving the last valid cached entry if the refresh failed. Never
 * overwrites previously-valid data with an incomplete/failed result.
 *
 * @param {object|undefined} existingEntry - existing cache entry for this player, if any
 * @param {{ ok: boolean, data?: object }} refreshResult
 * @param {Date} now
 */
export function mergePlayerCacheEntry(existingEntry, refreshResult, now) {
  const warnings = [...(existingEntry?.warnings ?? [])].filter((w) => !w.startsWith("stale-fallback:"));

  if (refreshResult?.ok) {
    return {
      ...refreshResult.data,
      fetchedAt: now.toISOString(),
      freshnessStatus: FRESHNESS_STATUS.FRESH,
      warnings,
    };
  }

  // Refresh was attempted but failed -- keep the last valid data if
  // present, and mark it explicitly as a stale fallback.
  if (existingEntry) {
    return {
      ...existingEntry,
      freshnessStatus: FRESHNESS_STATUS.STALE_FALLBACK,
      warnings: [...warnings, "stale-fallback: refresh failed, retaining last valid cached data"],
    };
  }

  return {
    freshnessStatus: FRESHNESS_STATUS.MISSING,
    warnings: [...warnings, "stale-fallback: refresh failed and no prior cached data exists"],
  };
}
