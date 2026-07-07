/**
 * Generate public/data/nfl/<season>/games.json + results.json from free
 * nflverse data (PR-2). No API key, no paid sources.
 *
 * Usage:
 *   node scripts/generate-nfl-schedules-results.mjs                 # 2022-2026
 *   node scripts/generate-nfl-schedules-results.mjs --season=2026
 *   node scripts/generate-nfl-schedules-results.mjs --start-season=2022 --end-season=2026
 *   node scripts/generate-nfl-schedules-results.mjs --dry-run
 *   node scripts/generate-nfl-schedules-results.mjs --input=path/to/games.csv   # offline fixture
 *   node scripts/generate-nfl-schedules-results.mjs --output-dir=some/dir       # test target
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_END_SEASON,
  DEFAULT_START_SEASON,
  NFL_GAMES_SOURCE_URL,
  runPipeline,
} from "./lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { dryRun: false, input: null, outputDir: join(ROOT, "public", "data", "nfl") };
  let season = null;
  let startSeason = null;
  let endSeason = null;
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--season=")) season = Number(arg.slice("--season=".length));
    else if (arg.startsWith("--start-season=")) startSeason = Number(arg.slice("--start-season=".length));
    else if (arg.startsWith("--end-season=")) endSeason = Number(arg.slice("--end-season=".length));
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
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

async function loadCsvText(input) {
  if (input) {
    console.log(`[nfl:schedules] reading local input ${input}`);
    return readFileSync(input, "utf-8");
  }
  console.log(`[nfl:schedules] fetching ${NFL_GAMES_SOURCE_URL}`);
  const response = await fetch(NFL_GAMES_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch games.csv: HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8"));
  const csvText = await loadCsvText(args.input);

  const summaries = runPipeline({
    csvText,
    teamsJson,
    seasons: args.seasons,
    outputDir: args.outputDir,
    dryRun: args.dryRun,
    log: (msg) => console.log(msg),
  });

  const totalGames = summaries.reduce((sum, s) => sum + s.gameCount, 0);
  const totalResults = summaries.reduce((sum, s) => sum + s.resultCount, 0);
  console.log(
    `[nfl:schedules] done: ${summaries.length} seasons, ${totalGames} games, ${totalResults} results${args.dryRun ? " (dry-run)" : ""}`
  );
}

main().catch((error) => {
  console.error(`[nfl:schedules] FAILED: ${error.message}`);
  process.exit(1);
});
