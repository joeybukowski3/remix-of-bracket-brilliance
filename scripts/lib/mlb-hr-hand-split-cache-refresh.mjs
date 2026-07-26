/**
 * mlb-hr-hand-split-cache-refresh.mjs
 *
 * Slate-scoped hand-split cache refresh for the live HR props generator.
 * Reuses the existing hand-split fetch + cache merge helpers; only requests
 * current-slate player ids; never fabricates splits. Failures keep last-valid
 * cache entries (or mark missing) so scoring can fail neutral.
 */
import { writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { selectPlayersNeedingRefresh, mergePlayerCacheEntry } from "./mlb-hand-split-cache.mjs";
import { fetchAndBuildPlayerHandSplits, SCHEMA_VERSION } from "./mlb-batter-hand-splits.mjs";
import { runLimited } from "./mlb-hand-split-fetch.mjs";

const DEFAULT_CONCURRENCY = 6;

/**
 * @param {unknown} playerIds
 * @returns {number[]}
 */
export function normalizeSlatePlayerIds(playerIds) {
  if (!Array.isArray(playerIds)) return [];
  return Array.from(
    new Set(
      playerIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
}

/**
 * Refresh only missing/stale entries for the given slate player ids.
 *
 * @param {object|null|undefined} cache  Existing cache ({ players: {...} }) or empty
 * @param {(number|string)[]} playerIds
 * @param {object} [options]
 * @param {Date} [options.now]
 * @param {number} [options.season]
 * @param {boolean} [options.force]
 * @param {number} [options.concurrency]
 * @param {typeof fetchAndBuildPlayerHandSplits} [options.fetchAndBuild]
 * @param {object} [options.fetchOptions]
 * @returns {Promise<{ cache: object, stats: object }>}
 */
export async function refreshHandSplitCacheForPlayerIds(cache, playerIds, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const season = Number.isFinite(options.season) ? options.season : now.getFullYear();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const fetchAndBuild = options.fetchAndBuild ?? fetchAndBuildPlayerHandSplits;
  const force = options.force === true;

  const requestedIds = normalizeSlatePlayerIds(playerIds);
  const players = { ...(cache?.players && typeof cache.players === "object" ? cache.players : {}) };
  const toRefresh = force
    ? requestedIds
    : selectPlayersNeedingRefresh(players, requestedIds, now).map(Number);

  let refreshedOk = 0;
  let refreshedFailed = 0;

  if (toRefresh.length > 0) {
    await runLimited(toRefresh, Math.min(concurrency, toRefresh.length), async (playerId) => {
      const key = String(playerId);
      try {
        const built = await fetchAndBuild(playerId, season, options.fetchOptions ?? {});
        players[key] = mergePlayerCacheEntry(players[key], { ok: true, data: built }, now);
        refreshedOk += 1;
      } catch {
        players[key] = mergePlayerCacheEntry(players[key], { ok: false }, now);
        refreshedFailed += 1;
      }
    });
  }

  const nextCache = {
    schemaVersion: cache?.schemaVersion ?? SCHEMA_VERSION,
    season,
    generatedAt: now.toISOString(),
    players,
  };

  return {
    cache: nextCache,
    stats: {
      requested: requestedIds.length,
      needingRefresh: toRefresh.length,
      refreshedOk,
      refreshedFailed,
      skippedFresh: Math.max(0, requestedIds.length - toRefresh.length),
    },
  };
}

/**
 * Same-directory temporary path for atomic publication.
 * Includes pid + high-resolution time so overlapping processes do not collide
 * on a fixed `.tmp` name.
 * @param {string} filePath
 * @returns {string}
 */
export function handSplitCacheTempPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const unique = `${process.pid}.${process.hrtime.bigint().toString()}`;
  return path.join(dir, `.${base}.${unique}.tmp`);
}

/**
 * Persist cache to disk via same-directory atomic write+rename.
 * On failure, attempts to remove the temporary file, then rethrows so the
 * generator's best-effort catch remains authoritative.
 * @param {string} filePath
 * @param {object} cache
 */
export function writeHandSplitCacheFile(filePath, cache) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const payload = `${JSON.stringify(cache, null, 2)}\n`;
  const tmpPath = handSplitCacheTempPath(filePath);

  try {
    writeFileSync(tmpPath, payload);
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup only; original error is authoritative.
    }
    throw error;
  }
}
