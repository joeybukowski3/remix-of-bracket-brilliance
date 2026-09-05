/**
 * Refresh the committed nflverse source caches backing Phase 1 of the NFL
 * fantasy weekly historical dataset (player-week stats + season schedules).
 *
 * This is the only script here that touches the network. The historical
 * artifact generator (generate-fantasy-weekly-history.mts) reads these
 * committed caches and never fetches, mirroring the pattern established by
 * scripts/refresh-nfl-injury-source-cache.mjs.
 *
 *   stats_player_week_{season}.csv  projection (~8.3-8.6 MB upstream -> QB/RB/WR/TE REG rows only)
 *   games.csv                       projection (one file, all seasons -> season/week/team columns only)
 *
 * Usage:
 *   node scripts/refresh-nfl-fantasy-history-source-cache.mjs
 *   node scripts/refresh-nfl-fantasy-history-source-cache.mjs --seasons=2022,2023,2024,2025
 *   node scripts/refresh-nfl-fantasy-history-source-cache.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import {
  buildCacheManifestEntry,
  csvHeaderColumns,
  csvRowCount,
  nflverseReleaseUrl,
  sha256Hex,
} from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_ROOT = join(ROOT, "data", "nfl", "nflverse");

const REQUEST_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 4000;
const USER_AGENT = "JoeKnowsBall-nfl-fantasy-history/1.0 (+https://www.joeknowsball.com)";

const MANIFEST_VERSION = "nfl-fantasy-history-source-cache-v1";
const DEFAULT_SEASONS = [2022, 2023, 2024, 2025];
const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

const PLAYER_WEEK_PROJECTION_COLUMNS = Object.freeze([
  "player_id", "player_name", "player_display_name", "position", "season", "week",
  "season_type", "game_id", "team", "opponent_team",
  "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
  "sack_fumbles_lost", "passing_2pt_conversions",
  "carries", "rushing_yards", "rushing_tds", "rushing_fumbles_lost", "rushing_2pt_conversions",
  "receptions", "targets", "receiving_yards", "receiving_tds", "receiving_fumbles_lost",
  "receiving_2pt_conversions", "receiving_air_yards", "target_share", "air_yards_share",
  "special_teams_tds",
]);

const GAMES_PROJECTION_COLUMNS = Object.freeze([
  "game_id", "season", "game_type", "week", "away_team", "home_team", "location",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAsset(url, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
        signal: controller.signal,
      });
      if (response.status === 404) return { notPublished: true, text: null };
      if (!response.ok) {
        const transient = response.status >= 500 || response.status === 429;
        if (!transient) throw new Error(`${label}: HTTP ${response.status}`);
        lastError = new Error(`${label}: HTTP ${response.status}`);
      } else {
        const text = await response.text();
        if (text.trim() === "") throw new Error(`${label}: empty response body`);
        return { notPublished: false, text };
      }
    } catch (err) {
      if (/HTTP 4\d\d/.test(err.message ?? "")) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS * attempt);
  }
  throw lastError ?? new Error(`${label}: request failed`);
}

function serializeCsv(rows, columns) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  return `${lines.join("\n")}\n`;
}

function projectPlayerWeek(text) {
  const rows = parseCsv(text);
  const missing = PLAYER_WEEK_PROJECTION_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
  if (missing.length > 0) {
    throw new Error(`stats_player_week: upstream is missing projected columns ${missing.join(", ")}`);
  }
  const kept = rows.filter(
    (row) =>
      String(row.season_type ?? "").trim().toUpperCase() === "REG" &&
      FANTASY_POSITIONS.has(String(row.position ?? "").trim().toUpperCase())
  );
  return serializeCsv(kept, [...PLAYER_WEEK_PROJECTION_COLUMNS]);
}

function projectGames(text) {
  const rows = parseCsv(text);
  const missing = GAMES_PROJECTION_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
  if (missing.length > 0) {
    throw new Error(`games: upstream is missing projected columns ${missing.join(", ")}`);
  }
  const kept = rows.filter((row) => String(row.game_type ?? "").trim().toUpperCase() === "REG");
  return serializeCsv(kept, [...GAMES_PROJECTION_COLUMNS]);
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
}

function readManifest(path) {
  if (!existsSync(path)) {
    return { schemaVersion: MANIFEST_VERSION, source: "nflverse/nflverse-data releases", files: [] };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function upstreamMeta(text) {
  const bytes = Buffer.from(text, "utf-8");
  return {
    byteSize: bytes.byteLength,
    sha256: sha256Hex(bytes),
    rowCount: csvRowCount(text),
    headerColumns: csvHeaderColumns(text),
  };
}

async function refreshPlayerWeekStats(seasons, { dryRun }) {
  const dir = join(CACHE_ROOT, "player-week-stats");
  const manifestPath = join(dir, "manifest.json");
  const manifest = readManifest(manifestPath);
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  let changed = false;

  for (const season of seasons) {
    const filename = `stats_player_week_${season}.csv`;
    const url = nflverseReleaseUrl("stats_player", filename);
    const label = `player-week-stats ${season}`;
    const { notPublished, text: upstreamText } = await fetchAsset(url, label);
    if (notPublished) {
      console.log(`[nfl:fantasy-history-cache] ${label}: not yet published upstream`);
      continue;
    }
    const committedText = projectPlayerWeek(upstreamText);
    const entry = buildCacheManifestEntry({
      season,
      filename,
      sourceUrl: url,
      sourceType: "projection",
      text: committedText,
      retrievedDateUtc,
      upstream: upstreamMeta(upstreamText),
      projectedColumns: [...PLAYER_WEEK_PROJECTION_COLUMNS],
      projectionFilter: "season_type == REG AND position IN (QB, RB, WR, TE)",
    });
    console.log(
      `[nfl:fantasy-history-cache] ${label}: ${entry.rowCount} rows, ${(entry.byteSize / 1024).toFixed(0)} KiB` +
        ` (projected from ${(entry.upstream.byteSize / 1024 / 1024).toFixed(1)} MiB / ${entry.upstream.rowCount} rows)`
    );
    if (!dryRun) {
      writeAtomic(join(dir, filename), committedText);
      const index = manifest.files.findIndex((file) => file.filename === filename);
      if (index >= 0) manifest.files[index] = entry;
      else manifest.files.push(entry);
      changed = true;
    }
  }

  if (!dryRun && changed) {
    manifest.schemaVersion = MANIFEST_VERSION;
    manifest.source = "nflverse/nflverse-data releases (stats_player)";
    manifest.attribution = "nflverse";
    manifest.files.sort((a, b) => (a.season ?? 0) - (b.season ?? 0));
    writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const attrs = join(dir, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Preserve the canonical nflverse release bytes on every platform.\n*.csv -text\n");
    }
  }
}

async function refreshGames({ dryRun }) {
  const dir = join(CACHE_ROOT, "schedules");
  const manifestPath = join(dir, "manifest.json");
  const manifest = readManifest(manifestPath);
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const filename = "games.csv";
  const url = nflverseReleaseUrl("schedules", filename);
  const label = "games";
  const { notPublished, text: upstreamText } = await fetchAsset(url, label);
  if (notPublished) {
    console.log(`[nfl:fantasy-history-cache] ${label}: not yet published upstream`);
    return;
  }
  const committedText = projectGames(upstreamText);
  const entry = buildCacheManifestEntry({
    season: null,
    filename,
    sourceUrl: url,
    sourceType: "projection",
    text: committedText,
    retrievedDateUtc,
    upstream: upstreamMeta(upstreamText),
    projectedColumns: [...GAMES_PROJECTION_COLUMNS],
    projectionFilter: "game_type == REG",
  });
  console.log(
    `[nfl:fantasy-history-cache] ${label}: ${entry.rowCount} rows, ${(entry.byteSize / 1024).toFixed(0)} KiB` +
      ` (projected from ${(entry.upstream.byteSize / 1024 / 1024).toFixed(1)} MiB / ${entry.upstream.rowCount} rows)`
  );
  if (!dryRun) {
    writeAtomic(join(dir, filename), committedText);
    manifest.schemaVersion = MANIFEST_VERSION;
    manifest.source = "nflverse/nflverse-data releases (schedules)";
    manifest.attribution = "nflverse";
    manifest.files = [entry];
    writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const attrs = join(dir, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Preserve the canonical nflverse release bytes on every platform.\n*.csv -text\n");
    }
  }
}

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw.slice(10).split(",").map((v) => Number(v.trim())).filter(Number.isInteger);
    } else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[nfl:fantasy-history-cache] seasons=${args.seasons.join(",")}${args.dryRun ? " (dry run)" : ""}`);
  await refreshPlayerWeekStats(args.seasons, args);
  await refreshGames(args);
  console.log("[nfl:fantasy-history-cache] done");
}

main().catch((err) => {
  console.error(`[nfl:fantasy-history-cache] FAILED: ${err.message}`);
  console.error("[nfl:fantasy-history-cache] existing cache left untouched");
  process.exit(1);
});
