/**
 * Generate public/data/nfl/<season>/team-stats.json + power-ratings.json
 * from the repo's own pipeline data (PR-4). No network, no API keys,
 * no betting columns.
 *
 * Usage:
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs                  # 2022-2026
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --season=2025
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --start-season=2022 --end-season=2026
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --dry-run
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --sanity
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --input-dir=... --output-dir=...
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_END_SEASON,
  DEFAULT_START_SEASON,
  runRatingsPipeline,
} from "./lib/nfl-team-ratings-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_DIR = join(ROOT, "public", "data", "nfl");

function parseArgs(argv) {
  const args = { dryRun: false, sanity: false, inputDir: DEFAULT_DATA_DIR, outputDir: DEFAULT_DATA_DIR };
  let season = null;
  let startSeason = null;
  let endSeason = null;
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sanity") args.sanity = true;
    else if (arg.startsWith("--season=")) season = Number(arg.slice("--season=".length));
    else if (arg.startsWith("--start-season=")) startSeason = Number(arg.slice("--start-season=".length));
    else if (arg.startsWith("--end-season=")) endSeason = Number(arg.slice("--end-season=".length));
    else if (arg.startsWith("--input-dir=")) args.inputDir = resolve(arg.slice("--input-dir=".length));
    else if (arg.startsWith("--output-dir=")) args.outputDir = resolve(arg.slice("--output-dir=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (season != null && (startSeason != null || endSeason != null)) {
    throw new Error("Use either --season or --start-season/--end-season, not both");
  }
  const start = season ?? startSeason ?? DEFAULT_START_SEASON;
  const end = season ?? endSeason ?? DEFAULT_END_SEASON;
  for (const value of [start, end]) {
    if (!Number.isInteger(value) || value < 2000 || value > 2100) {
      throw new Error(`Season out of range: ${value}`);
    }
  }
  if (start > end) throw new Error(`start-season ${start} is after end-season ${end}`);
  args.seasons = [];
  for (let y = start; y <= end; y += 1) args.seasons.push(y);
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const summaries = runRatingsPipeline({
    inputDir: args.inputDir,
    outputDir: args.outputDir,
    seasons: args.seasons,
    dryRun: args.dryRun,
    sanity: args.sanity,
    log: (msg) => console.log(msg),
  });
  const totalRated = summaries.reduce((sum, s) => sum + s.ratedCount, 0);
  console.log(
    `[nfl:team-ratings] done: ${summaries.length} seasons, ${totalRated} rated team-seasons${args.dryRun ? " (dry-run)" : ""}`
  );
}

try {
  main();
} catch (error) {
  console.error(`[nfl:team-ratings] FAILED: ${error.message}`);
  process.exit(1);
}
