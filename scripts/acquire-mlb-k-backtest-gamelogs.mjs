/**
 * acquire-mlb-k-backtest-gamelogs.mjs  (backtest step 2 CLI)
 *
 * Fetches pitching + team-hitting game logs for every starter/team referenced by
 * the StatsAPI corpus produced in step 1. Resumable and cached.
 *
 * Usage: node scripts/acquire-mlb-k-backtest-gamelogs.mjs [--concurrency=3]
 */
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { acquireBacktestGameLogs } from "./lib/mlb-k-backtest-gamelogs.mjs";

const ROOT = process.cwd();
const STATS_API_ROOT = path.join(ROOT, "data", "mlb", "k-history", "raw", "statsapi");
const CACHE_DIR = path.join(ROOT, "data", "mlb", "k-history", "raw", "gamelogs");
const MANIFEST_PATH = path.join(CACHE_DIR, "manifest.json");

export async function main(argv = process.argv.slice(2)) {
  const concurrency = Math.max(1, Math.min(4, Number(argv.find((e) => e.startsWith("--concurrency="))?.slice(14) ?? 2)));
  const manifest = await acquireBacktestGameLogs({
    statsApiRoot: STATS_API_ROOT,
    cacheDir: CACHE_DIR,
    manifestPath: MANIFEST_PATH,
    concurrency,
  });
  console.log(JSON.stringify({
    seasons: manifest.seasons,
    network: manifest.network,
    failedRequests: manifest.failedRequests.length,
  }, null, 2));
  if (manifest.failedRequests.length) {
    console.warn(`[gamelogs] ${manifest.failedRequests.length} request(s) failed - re-run to fill; recorded in manifest.json`);
    process.exitCode = 2;
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[acquire-mlb-k-backtest-gamelogs] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
