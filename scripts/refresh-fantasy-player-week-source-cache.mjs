/**
 * Fetches an auditable QB/RB/WR/TE projection of nflverse's weekly player-stat
 * release. This script is the only network step; history generation is offline.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import {
  FANTASY_PLAYER_POSITIONS,
  validateCompletedPlayerWeekSeason,
} from "./lib/fantasy-player-week-source-core.mjs";
import {
  buildCacheManifestEntry, csvHeaderColumns, csvRowCount, nflverseReleaseUrl, sha256Hex,
} from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-player-week");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");
const SCHEMA_VERSION = "fantasy-player-week-source-cache-v1";
const DEFAULT_SEASONS = [2023, 2024, 2025];
const POSITIONS = new Set(FANTASY_PLAYER_POSITIONS);
const USER_AGENT = "JoeKnowsBall-fantasy-weekly/1.0 (+https://www.joeknowsball.com)";

export const PLAYER_WEEK_PROJECTED_COLUMNS = Object.freeze([
  "player_id", "player_name", "player_display_name", "position", "position_group", "recent_team",
  "season", "week", "season_type", "opponent_team", "completions", "attempts", "passing_yards",
  "passing_tds", "interceptions", "carries", "rushing_yards", "rushing_tds", "receptions", "targets",
  "receiving_yards", "receiving_tds", "receiving_air_yards", "target_share", "air_yards_share",
  "sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost", "passing_2pt_conversions",
  "rushing_2pt_conversions", "receiving_2pt_conversions", "special_teams_tds", "fantasy_points_ppr",
]);

const PLAYER_WEEK_UPSTREAM_ALIASES = Object.freeze({
  recent_team: "team",
  interceptions: "passing_interceptions",
});

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false, localDir: null, partialSeason: null, throughWeek: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    } else if (raw.startsWith("--local-dir=")) {
      args.localDir = resolve(ROOT, raw.slice(12));
    } else if (raw.startsWith("--partial-season=")) {
      args.partialSeason = Number(raw.slice(17));
    } else if (raw.startsWith("--through-week=")) {
      args.throughWeek = Number(raw.slice(15));
    } else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.seasons.length) throw new Error("No valid seasons requested.");
  if ((args.partialSeason == null) !== (args.throughWeek == null)) {
    throw new Error("--partial-season and --through-week must be supplied together.");
  }
  if (args.partialSeason != null && (!Number.isInteger(args.partialSeason) || !args.seasons.includes(args.partialSeason))) {
    throw new Error("--partial-season must be an integer included in --seasons.");
  }
  if (args.throughWeek != null && (!Number.isInteger(args.throughWeek) || args.throughWeek < 1 || args.throughWeek > 18)) {
    throw new Error("--through-week must be an integer from 1 through 18.");
  }
  return args;
}

function validatePartialPlayerWeekSeason(rows, season, throughWeek, filename) {
  const expectedWeeks = Array.from({ length: throughWeek }, (_, index) => index + 1);
  const coverage = {};
  for (const position of FANTASY_PLAYER_POSITIONS) {
    const positionRows = rows.filter((row) => String(row.position).toUpperCase() === position);
    const weeks = [...new Set(positionRows.map((row) => Number(row.week)).filter((week) => week <= throughWeek))].sort((a, b) => a - b);
    if (weeks.length !== expectedWeeks.length || weeks.some((week, index) => week !== expectedWeeks[index])) {
      throw new Error(`${filename}: ${position} coverage through Week ${throughWeek} is incomplete (${weeks.join(",") || "none"})`);
    }
    coverage[position] = {
      rows: positionRows.filter((row) => Number(row.week) <= throughWeek).length,
      players: new Set(positionRows.filter((row) => Number(row.week) <= throughWeek).map((row) => String(row.player_id))).size,
      weeks,
    };
  }
  const wrongSeason = rows.find((row) => Number(row.season) !== season);
  if (wrongSeason) throw new Error(`${filename}: contains a row outside season ${season}`);
  return coverage;
}

function serializeCsv(rows, columns) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error(`${url}: empty response`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

async function main() {
  const { seasons, dryRun, localDir, partialSeason, throughWeek } = parseArgs(process.argv);
  const existing = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : { schemaVersion: SCHEMA_VERSION, source: "nflverse/nflverse-data releases", files: [] };
  const entries = new Map((existing.files ?? []).map((entry) => [entry.season, entry]));
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const staged = [];

  for (const season of seasons) {
    const filename = `stats_player_week_${season}.csv`;
    const sourceUrl = nflverseReleaseUrl("player_stats", filename);
    const upstreamText = localDir
      ? readFileSync(join(localDir, filename), "utf8")
      : await fetchText(sourceUrl);
    const upstreamColumns = csvHeaderColumns(upstreamText);
    const missing = PLAYER_WEEK_PROJECTED_COLUMNS.filter((column) => {
      const upstreamColumn = PLAYER_WEEK_UPSTREAM_ALIASES[column] ?? column;
      return !upstreamColumns.includes(column) && !upstreamColumns.includes(upstreamColumn);
    });
    if (missing.length) throw new Error(`${filename}: missing required columns ${missing.join(", ")}`);
    const rows = parseCsv(upstreamText).filter(
      (row) => String(row.season_type).toUpperCase() === "REG" && POSITIONS.has(String(row.position).toUpperCase()),
    );
    if (!rows.length) throw new Error(`${filename}: no supported regular-season rows`);
    const coverage = season === partialSeason
      ? validatePartialPlayerWeekSeason(rows, season, throughWeek, filename)
      : validateCompletedPlayerWeekSeason(rows, season, filename);
    const projectedRows = rows.map((row) => ({
      ...row,
      recent_team: row.recent_team || row.team,
      interceptions: row.interceptions || row.passing_interceptions,
    }));
    const projected = serializeCsv(projectedRows, PLAYER_WEEK_PROJECTED_COLUMNS);
    const entry = buildCacheManifestEntry({
      season, filename, sourceUrl, sourceType: "projection", text: projected, retrievedDateUtc,
      upstream: {
        byteSize: Buffer.byteLength(upstreamText), sha256: sha256Hex(upstreamText),
        rowCount: csvRowCount(upstreamText), headerColumns: upstreamColumns,
      },
      projectedColumns: [...PLAYER_WEEK_PROJECTED_COLUMNS],
      projectionFilter: "season_type == REG AND position IN (QB,RB,WR,TE)",
    });
    entry.coverage = coverage;
    staged.push({ season, filename, projected, entry });
    console.log(`${dryRun ? "Validated" : "Cached"} ${filename}: ${entry.rowCount} rows`);
  }

  for (const item of staged) {
    entries.set(item.season, item.entry);
    if (!dryRun) writeAtomic(join(CACHE_DIR, item.filename), item.projected);
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    source: "nflverse/nflverse-data player_stats release",
    attribution: "nflverse",
    files: [...entries.values()].sort((a, b) => a.season - b.season),
  };
  if (!dryRun) writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
