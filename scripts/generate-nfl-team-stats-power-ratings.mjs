/**
 * Generate public/data/nfl/<season>/team-stats.json + power-ratings.json
 * (PR-4 v0.1, upgraded to nfl-power-v0.2 in PR-8).
 *
 * Inputs: repo results.json + free nflverse stats_team weekly CSVs
 * (~185 KB/season, no API key). No paid sources, no betting columns.
 *
 * Usage:
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs                  # 2022-2026
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --season=2025
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --start-season=2022 --end-season=2026
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --dry-run
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --sanity
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --stats-dir=fixtures   # offline stats_team files
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --no-advanced          # skip EPA source entirely
 *   node scripts/generate-nfl-team-stats-power-ratings.mjs --input-dir=... --output-dir=...
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_END_SEASON,
  DEFAULT_START_SEASON,
  runRatingsPipeline,
} from "./lib/nfl-team-ratings-core.mjs";
import { computeAdvancedTeamMetrics, nflTeamStatsUrl } from "./lib/nfl-advanced-stats.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_DIR = join(ROOT, "public", "data", "nfl");

function parseArgs(argv) {
  const args = {
    dryRun: false,
    sanity: false,
    noAdvanced: false,
    statsDir: null,
    inputDir: DEFAULT_DATA_DIR,
    outputDir: DEFAULT_DATA_DIR,
  };
  let season = null;
  let startSeason = null;
  let endSeason = null;
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sanity") args.sanity = true;
    else if (arg === "--no-advanced") args.noAdvanced = true;
    else if (arg.startsWith("--season=")) season = Number(arg.slice("--season=".length));
    else if (arg.startsWith("--start-season=")) startSeason = Number(arg.slice("--start-season=".length));
    else if (arg.startsWith("--end-season=")) endSeason = Number(arg.slice("--end-season=".length));
    else if (arg.startsWith("--stats-dir=")) args.statsDir = resolve(arg.slice("--stats-dir=".length));
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

function buildAdvancedLoader(args, teamsJson) {
  if (args.noAdvanced) {
    return async () => null;
  }
  return async (season) => {
    let csvText = null;
    if (args.statsDir) {
      const file = join(args.statsDir, `stats_team_week_${season}.csv`);
      if (existsSync(file)) csvText = readFileSync(file, "utf-8");
      else console.log(`[nfl:team-ratings] no local stats file for ${season}; advanced metrics null`);
    } else {
      const url = nflTeamStatsUrl(season);
      const response = await fetch(url);
      if (response.ok) {
        csvText = await response.text();
      } else if (response.status === 404) {
        console.log(`[nfl:team-ratings] stats_team file for ${season} not published yet (404); advanced metrics null`);
      } else {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
    }
    return computeAdvancedTeamMetrics(csvText, season, teamsJson);
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const teamsJson = JSON.parse(readFileSync(join(args.inputDir, "teams.json"), "utf-8"));

  const summaries = await runRatingsPipeline({
    inputDir: args.inputDir,
    outputDir: args.outputDir,
    seasons: args.seasons,
    dryRun: args.dryRun,
    sanity: args.sanity,
    loadAdvanced: buildAdvancedLoader(args, teamsJson),
    log: (msg) => console.log(msg),
  });

  const totalRated = summaries.reduce((sum, s) => sum + s.ratedCount, 0);
  console.log(
    `[nfl:team-ratings] done: ${summaries.length} seasons, ${totalRated} rated team-seasons${args.dryRun ? " (dry-run)" : ""}`
  );
}

main().catch((error) => {
  console.error(`[nfl:team-ratings] FAILED: ${error.message}`);
  process.exit(1);
});
