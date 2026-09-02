/**
 * acquire-mlb-k-backtest-history.mjs  (backtest step 1)
 *
 * Drives the newly merged `acquireMlbKHistoryStatsApi` (schedule + completed-game
 * boxscores + starting-pitcher metadata + deterministic normalized outcomes)
 * across a multi-season range by splitting it into per-week windows, since that
 * helper intentionally refuses a range spanning two calendar years and exits
 * non-zero on any partial window.
 *
 * Every window is cached and hash-verified by the underlying helper, so an
 * interrupted run resumes without re-fetching completed windows. Windows that
 * come back `partial` are recorded as coverage gaps rather than aborting the
 * whole corpus.
 *
 * Output: data/mlb/k-history/raw/statsapi/<season>/<start>_to_<end>/  (per window)
 *         data/mlb/k-history/raw/statsapi/corpus-manifest.json        (roll-up)
 *
 * Usage:
 *   node scripts/acquire-mlb-k-backtest-history.mjs --seasons=2023,2024,2025
 *   node scripts/acquire-mlb-k-backtest-history.mjs --start=2025-03-27 --end=2025-09-28
 */
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { acquireMlbKHistoryStatsApi } from "./lib/mlb-k-history-statsapi.mjs";
import { createCachedFetch, directorySize, writeJsonAtomic } from "./lib/mlb-k-backtest-cache.mjs";

const ROOT = process.cwd();
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "data", "mlb", "k-history", "raw", "statsapi");
const HTTP_CACHE_DIR = path.join(ROOT, "data", "mlb", "k-history", "raw", "http-cache");

// Regular-season windows. MLB regular seasons run late March through early
// October; a generous envelope keeps opening day and Game 162 in range without
// pulling spring training or the postseason (the helper filters gameType=R).
const SEASON_ENVELOPE = { start: "03-15", end: "10-10" };

function isoAddDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weeklyWindows(startDate, endDate) {
  const windows = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const windowEnd = [isoAddDays(cursor, 6), endDate].sort()[0];
    windows.push({ startDate: cursor, endDate: windowEnd });
    cursor = isoAddDays(windowEnd, 1);
  }
  return windows;
}

export function resolveRanges(argv) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const explicitStart = value("--start=");
  const explicitEnd = value("--end=");
  if (explicitStart && explicitEnd) {
    if (explicitStart.slice(0, 4) !== explicitEnd.slice(0, 4)) {
      throw new Error("--start and --end must be in the same calendar year; pass --seasons for multi-year ranges");
    }
    return [{ season: Number(explicitStart.slice(0, 4)), startDate: explicitStart, endDate: explicitEnd }];
  }
  const seasons = (value("--seasons=") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!seasons.length) throw new Error("Pass --seasons=YYYY,YYYY or --start=YYYY-MM-DD --end=YYYY-MM-DD");
  return seasons.map((seasonText) => {
    const season = Number(seasonText);
    if (!Number.isInteger(season) || season < 2000 || season > 2100) throw new Error(`Invalid season: ${seasonText}`);
    return { season, startDate: `${season}-${SEASON_ENVELOPE.start}`, endDate: `${season}-${SEASON_ENVELOPE.end}` };
  });
}

export async function acquireBacktestHistory({
  ranges,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  concurrency = 2,
  fetchImpl,
  minIntervalMs = 90,
  log = (message) => console.log(message),
} = {}) {
  const startedAt = Date.now();
  // A throttled + retrying + cached fetch keeps StatsAPI from rate-limiting a
  // multi-thousand-request corpus pull and makes every window individually
  // resumable (not just window-at-a-time).
  const throttledFetch = fetchImpl ?? createCachedFetch({
    cacheDir: HTTP_CACHE_DIR,
    mode: "online",
    minIntervalMs,
    maxAttempts: 5,
    backoffMs: 600,
    timeoutMs: 20_000,
  });
  const seasons = [];

  for (const range of ranges) {
    const windows = weeklyWindows(range.startDate, range.endDate);
    const windowResults = [];
    log(`[acquire] season ${range.season}: ${windows.length} weekly windows ${range.startDate}..${range.endDate}`);

    for (const window of windows) {
      let manifest;
      try {
        manifest = await acquireMlbKHistoryStatsApi({
          startDate: window.startDate,
          endDate: window.endDate,
          outputRoot,
          concurrency,
          maxAttempts: 5,
          backoffMs: 600,
          timeoutMs: 20_000,
          fetchImpl: throttledFetch,
        });
      } catch (error) {
        manifest = { status: "error", error: error instanceof Error ? error.message : String(error), requestedDateRange: window };
      }
      const summary = {
        window,
        status: manifest.status ?? "unknown",
        scheduledGameCount: manifest.scheduledGameCount ?? null,
        uniqueCompletedGameCount: manifest.uniqueCompletedGameCount ?? null,
        boxscoresAcquired: manifest.boxscoresAcquired ?? null,
        uniqueStartingPitchers: manifest.uniqueStartingPitchers ?? null,
        startingPitcherRows: manifest.startingPitcherRows ?? null,
        rowsWithActualK_BF_IP_PitchCount: manifest.rowsWithActualK_BF_IP_PitchCount ?? null,
        failedRequestCount: (manifest.failedRequests ?? []).length,
        runDirectory: manifest.runDirectory
          ? path.relative(ROOT, manifest.runDirectory)
          : path.relative(ROOT, path.join(outputRoot, String(range.season), `${window.startDate}_to_${window.endDate}`)),
        error: manifest.error ?? null,
      };
      windowResults.push(summary);
      log(`[acquire]   ${window.startDate}..${window.endDate} -> ${summary.status} `
        + `games=${summary.uniqueCompletedGameCount ?? "?"} boxscores=${summary.boxscoresAcquired ?? "?"} `
        + `starters=${summary.startingPitcherRows ?? "?"} failed=${summary.failedRequestCount}`);
    }

    const completeWindows = windowResults.filter((entry) => entry.status === "complete");
    seasons.push({
      season: range.season,
      startDate: range.startDate,
      endDate: range.endDate,
      windowCount: windowResults.length,
      completeWindowCount: completeWindows.length,
      partialOrFailedWindows: windowResults.filter((entry) => entry.status !== "complete").map((entry) => ({
        window: entry.window, status: entry.status, failedRequestCount: entry.failedRequestCount, error: entry.error,
      })),
      completedGameCount: windowResults.reduce((sum, entry) => sum + (entry.uniqueCompletedGameCount ?? 0), 0),
      startingPitcherRows: windowResults.reduce((sum, entry) => sum + (entry.startingPitcherRows ?? 0), 0),
      rowsWithFullOutcome: windowResults.reduce((sum, entry) => sum + (entry.rowsWithActualK_BF_IP_PitchCount ?? 0), 0),
      windows: windowResults,
    });
  }

  const corpus = {
    schemaVersion: 1,
    kind: "mlb-k-backtest-statsapi-corpus",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    outputRoot: path.relative(ROOT, outputRoot),
    totalStorageBytes: directorySize(outputRoot),
    seasons,
    coverageGaps: seasons.flatMap((season) => season.partialOrFailedWindows.map((entry) => ({ season: season.season, ...entry }))),
  };
  writeJsonAtomic(path.join(outputRoot, "corpus-manifest.json"), corpus);
  return corpus;
}

export async function main(argv = process.argv.slice(2)) {
  const ranges = resolveRanges(argv);
  const concurrency = Math.max(1, Math.min(4, Number(argv.find((e) => e.startsWith("--concurrency="))?.slice(14) ?? 2)));
  const corpus = await acquireBacktestHistory({ ranges, concurrency });
  console.log(JSON.stringify({
    seasons: corpus.seasons.map((season) => ({
      season: season.season,
      completeWindows: `${season.completeWindowCount}/${season.windowCount}`,
      completedGames: season.completedGameCount,
      starterRows: season.startingPitcherRows,
      fullOutcomeRows: season.rowsWithFullOutcome,
    })),
    coverageGaps: corpus.coverageGaps.length,
    totalStorageMB: Math.round((corpus.totalStorageBytes / 1_048_576) * 10) / 10,
  }, null, 2));
  if (corpus.coverageGaps.length) {
    console.warn(`[acquire] ${corpus.coverageGaps.length} window(s) partial/failed - re-run to fill; recorded in corpus-manifest.json`);
  }
  return corpus;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[acquire-mlb-k-backtest-history] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
