/**
 * Generate public/data/nfl/matchup-production-allowed.json -- a shared
 * factual NFL artifact: literal yardage production allowed per team, split
 * by market (passing/rushing/receiving), position where the source data can
 * attribute it cleanly, and window (season/last5).
 *
 * This is deliberately NOT Fantasy Points Allowed
 * (src/lib/fantasy/pointsAllowed2025.ts) -- that is a composite fantasy
 * scoring metric. This artifact is raw yards allowed, suitable for yardage
 * prop context and, eventually, fantasy presentation as factual context (see
 * scripts/lib/nfl-production-allowed-core.mjs for the aggregation rules).
 *
 * Reads only the committed nflverse player-week stats cache under
 * data/nfl/nflverse/stats-player-week/ -- never touches the network.
 *
 * Usage:
 *   node scripts/generate-nfl-production-allowed.mjs
 *   node scripts/generate-nfl-production-allowed.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  PRODUCTION_ALLOWED_MARKET_POSITIONS,
  buildProductionAllowedTeams,
  normalizeStatRows,
} from "./lib/nfl-production-allowed-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const STATS_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-player-week");
const OUT_FILE = join(DATA_DIR, "matchup-production-allowed.json");

export const PRODUCTION_ALLOWED_SCHEMA_VERSION = "nfl-matchup-production-allowed-v1";

/**
 * Week 1 2026 has zero completed 2026 games, so the only pregame-safe source
 * season is 2025 -- see AGENTS temporal-safety rule for this artifact. This
 * script intentionally has no "current season" branch: bump this constant
 * (and re-derive the temporal-safety argument) when a future week needs a
 * rolling source season instead of a fixed one.
 */
const SOURCE_SEASON = 2025;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

function loadStatRows(season) {
  const path = join(STATS_DIR, `stats_player_week_${season}.csv`);
  if (!existsSync(path)) throw new Error(`stats_player_week cache missing at ${path}`);
  const text = readFileSync(path, "utf-8");
  return parseCsv(text);
}

function main() {
  const args = parseArgs(process.argv);
  const teamsJson = readJson(join(DATA_DIR, "teams.json"));
  const nflverseAbbrs = teamsJson.teams.map((t) => t.nflverseAbbr).sort();

  const rawRows = loadStatRows(SOURCE_SEASON);
  const normalized = normalizeStatRows(rawRows, SOURCE_SEASON);
  if (normalized.length === 0) {
    throw new Error(`no ${SOURCE_SEASON} REG-season rows found; refusing to overwrite a known-good artifact`);
  }

  const teams = buildProductionAllowedTeams(normalized, nflverseAbbrs);
  const teamsWithData = Object.keys(teams);
  if (teamsWithData.length === 0) {
    throw new Error("no team produced any window; refusing to overwrite a known-good artifact");
  }

  const coverage = {};
  for (const [market, positions] of Object.entries(PRODUCTION_ALLOWED_MARKET_POSITIONS)) {
    coverage[market] = {};
    for (const position of positions) {
      let season = 0;
      let last5 = 0;
      for (const team of teamsWithData) {
        if (teams[team][market][position].season) season += 1;
        if (teams[team][market][position].last5) last5 += 1;
      }
      coverage[market][position] = { season, last5, ofTeams: teamsWithData.length };
    }
  }

  const artifact = {
    _meta: buildNflMeta({
      source: "nflverse stats_player_week (player-week box score)",
      season: SOURCE_SEASON,
      week: null,
      notes: [
        "Yardage production ALLOWED, not fantasy points allowed -- see src/lib/fantasy/pointsAllowed2025.ts for the separate fantasy-scoring metric.",
        `Regular season only (season_type === "REG"); source season fixed at ${SOURCE_SEASON} so no 2026 outcome can enter a Week 1 2026 value.`,
        "passing/QB sums passing_yards conceded to opposing rows recorded at position QB only -- a trick-play pass thrown by a non-QB does not count as passing offense allowed.",
        "rushing/ALL sums rushing_yards across every ball-carrier position (the conventional team rush-yards-allowed figure); rushing/RB isolates the RB slice.",
        "receiving/{WR,TE,RB} is strictly position-specific -- no team-wide receiving slice is produced, since a team-wide number would misrepresent position-specific defense.",
        "last5 is each team's final five REG-season games in the source data, ordered by week number; bye weeks never appear as rows, so this is always five actual games.",
        "A team with zero recorded games in a window is omitted from that window entirely, never zero-filled.",
        "This compact stats_player_week cache carries no sack/sack-yardage column at all -- sacks are simply absent from passing_yards, neither added nor subtracted. QB rushing (scrambles) lands only in rushing/ALL; rushing/QB is not a produced slice, so QB scramble yards never enter the RB rushing slice.",
      ],
    }),
    schemaVersion: PRODUCTION_ALLOWED_SCHEMA_VERSION,
    sourceSeason: SOURCE_SEASON,
    marketPositions: PRODUCTION_ALLOWED_MARKET_POSITIONS,
    teams,
    coverage,
    provenance: {
      generatedAt: new Date().toISOString(),
      sourceFile: `data/nfl/nflverse/stats-player-week/stats_player_week_${SOURCE_SEASON}.csv`,
      teamsWithData: teamsWithData.length,
      teamsRequested: nflverseAbbrs.length,
    },
  };

  console.log(
    `[nfl:production-allowed] teams ${teamsWithData.length}/${nflverseAbbrs.length}; ` +
      Object.entries(coverage)
        .map(([market, byPos]) => `${market}:${Object.entries(byPos).map(([p, c]) => `${p}=${c.season}/${c.ofTeams}`).join(",")}`)
        .join(" "),
  );

  if (args.dryRun) {
    console.log("[nfl:production-allowed] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
  console.log(`[nfl:production-allowed] wrote ${OUT_FILE}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:production-allowed] FAILED: ${err.message}`);
  console.error("[nfl:production-allowed] existing artifact left untouched");
  process.exit(1);
}
