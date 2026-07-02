/**
 * mlb-bullpen-cache.mjs
 *
 * Pure cache-freshness and merge logic for the bullpen stats cache.
 * Deliberately has no filesystem or network dependency -- the build
 * script (scripts/build-mlb-team-bullpen-stats.mjs) owns reading/writing
 * public/data/mlb/team-bullpen-stats.json and calls these functions to
 * decide what needs refreshing and how to merge results back in.
 *
 * Season aggregates and recent-workload data have different freshness
 * needs, so each team cache entry tracks its own generatedAt per
 * section (see SECTION_SEASON / SECTION_WORKLOAD) rather than one
 * top-level timestamp for the whole entry.
 */

export const SECTION_SEASON = "season";
export const SECTION_WORKLOAD = "workload";

export const SEASON_FRESHNESS_HOURS = 18; // within the target 12-24h window
export const WORKLOAD_FRESHNESS_HOURS = 3; // recent workload refreshes more often

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
 * @param {object|null|undefined} teamCacheEntry
 * @param {"season"|"workload"} section
 * @param {Date} now
 * @param {number} freshnessHours
 * @returns {boolean}
 */
export function isSectionFresh(teamCacheEntry, section, now, freshnessHours) {
  const generatedAt = teamCacheEntry?.[section]?.generatedAt;
  if (!generatedAt) return false;
  return hoursSince(generatedAt, now) <= freshnessHours;
}

/**
 * Determines which teams need a season-aggregate refresh and which need
 * a recent-workload refresh, given the existing cache.
 *
 * @param {Record<string, object>} cacheByTeamId
 * @param {string[]} allTeamIds
 * @param {Date} now
 * @returns {{ seasonRefreshTeamIds: string[], workloadRefreshTeamIds: string[] }}
 */
export function selectTeamsNeedingRefresh(cacheByTeamId, allTeamIds, now) {
  const seasonRefreshTeamIds = [];
  const workloadRefreshTeamIds = [];
  for (const teamId of allTeamIds) {
    const entry = cacheByTeamId?.[teamId];
    if (!isSectionFresh(entry, SECTION_SEASON, now, SEASON_FRESHNESS_HOURS)) seasonRefreshTeamIds.push(teamId);
    if (!isSectionFresh(entry, SECTION_WORKLOAD, now, WORKLOAD_FRESHNESS_HOURS)) workloadRefreshTeamIds.push(teamId);
  }
  return { seasonRefreshTeamIds, workloadRefreshTeamIds };
}

/**
 * Merges a fresh refresh result for one team into the existing cache,
 * preserving the last valid cached section if that section's refresh
 * failed. Never overwrites a previously-valid section with an
 * incomplete/failed result.
 *
 * @param {object|undefined} existingEntry - existing cache entry for this team, if any
 * @param {{ season?: {ok: boolean, data?: object}, workload?: {ok: boolean, data?: object} }} refreshResult
 * @param {Date} now
 */
export function mergeTeamCacheEntry(existingEntry, refreshResult, now) {
  const merged = { ...existingEntry };
  const warnings = [...(existingEntry?.warnings ?? [])].filter(
    (w) => !w.startsWith("stale-fallback:")
  );

  for (const section of [SECTION_SEASON, SECTION_WORKLOAD]) {
    const attempted = refreshResult?.[section];
    if (attempted?.ok) {
      merged[section] = { ...attempted.data, generatedAt: now.toISOString() };
    } else if (attempted && !attempted.ok) {
      // Refresh was attempted but failed -- keep the last valid data if
      // present, and mark it explicitly as a stale fallback.
      if (merged[section]) {
        warnings.push(`stale-fallback: ${section} refresh failed, retaining last valid cached data`);
      } else {
        warnings.push(`stale-fallback: ${section} refresh failed and no prior cached data exists`);
      }
    }
    // If `attempted` is undefined, this section simply wasn't in scope
    // for this refresh pass -- leave whatever was already cached alone.
  }

  merged.freshnessStatus = computeFreshnessStatus(merged, refreshResult, now);
  merged.warnings = warnings;
  return merged;
}

function computeFreshnessStatus(mergedEntry, refreshResult, now) {
  const seasonFresh = isSectionFresh(mergedEntry, SECTION_SEASON, now, SEASON_FRESHNESS_HOURS);
  const workloadFresh = isSectionFresh(mergedEntry, SECTION_WORKLOAD, now, WORKLOAD_FRESHNESS_HOURS);
  if (!mergedEntry[SECTION_SEASON] && !mergedEntry[SECTION_WORKLOAD]) return FRESHNESS_STATUS.MISSING;
  if (seasonFresh && workloadFresh) return FRESHNESS_STATUS.FRESH;
  return FRESHNESS_STATUS.STALE_FALLBACK;
}
