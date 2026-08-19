/**
 * Refresh the committed compact Performance-Rating cache from nflverse
 * play-by-play (Phase 6). Sibling to scripts/refresh-nfl-epa-source-cache.mjs
 * — same streaming/gunzip/never-write-raw-to-disk approach, same
 * data/nfl/nflverse/ tree, same manifest conventions — but reads the wider
 * column set the Performance Rating metric engine needs (down, ydstogo,
 * wp, drive/fixed_drive_result, scoreboard columns, etc — see
 * scripts/lib/nfl-performance-metrics-core.mjs) and aggregates via that
 * engine instead of nfl-epa-core.mjs's 6-metric aggregator. This is
 * intentionally a second compact cache next to epa-team-game/, not a
 * replacement for it or a second raw-PBP ingestion system: the raw
 * play-by-play is still streamed once per run and discarded, never stored.
 *
 * Usage:
 *   node scripts/refresh-nfl-performance-source-cache.mjs
 *   node scripts/refresh-nfl-performance-source-cache.mjs --seasons=2026
 *   node scripts/refresh-nfl-performance-source-cache.mjs --dry-run
 */

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflverseTeamMap } from "./lib/nfl-schedules-results-core.mjs";
import { buildCacheManifestEntry } from "./lib/nfl-source-cache.mjs";
import {
  REQUIRED_PERFORMANCE_PBP_COLUMNS,
  PERFORMANCE_COMPACT_COLUMNS,
  aggregateSeason,
  serializePerformanceCompact,
} from "./lib/nfl-performance-metrics-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "performance-team-game");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");

export const PERFORMANCE_CACHE_MANIFEST_VERSION = "nfl-performance-team-game-cache-v1";
export const PERFORMANCE_SOURCE_LABEL = "nflverse (play-by-play, nflfastR EPA + traditional Success Rate + drives)";
export const PERFORMANCE_ATTRIBUTION = "EPA/play-by-play data: nflverse / nflfastR";

const DEFAULT_SEASONS = [2026];
const REQUEST_TIMEOUT_MS = 180000;
const USER_AGENT = "JoeKnowsBall-nfl-performance-analytics/1.0 (+https://www.joeknowsball.com)";

function nflversePbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw.slice(10).split(",").map((s) => Number(s.trim())).filter(Number.isInteger);
    } else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

async function streamSeason(season, { teamMap }) {
  const url = nflversePbpUrl(season);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return { notPublished: true };
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching play-by-play`);

  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength === 0) throw new Error(`${season}: empty play-by-play response`);

  const lines = createInterface({
    input: Readable.from(compressed).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let header = null;
  let indices = null;
  const rows = [];
  let sourceRows = 0;

  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = REQUIRED_PERFORMANCE_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) {
        throw new Error(`${season}: play-by-play missing required columns ${missing.join(", ")}`);
      }
      indices = Object.fromEntries(REQUIRED_PERFORMANCE_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    const cells = splitCsvLine(line);
    if (cells[indices.season_type] !== "REG") continue;
    sourceRows += 1;
    const row = {};
    for (const column of REQUIRED_PERFORMANCE_PBP_COLUMNS) row[column] = cells[indices[column]] ?? "";
    rows.push(row);
  }

  if (rows.length === 0) {
    // A season that has started publishing but has zero completed REG games
    // yet (e.g. preseason-only rows exist upstream) is not an error — the
    // generator must treat this exactly like "not published".
    return { notPublished: true, zeroRegRows: true };
  }

  const teamGames = aggregateSeason(rows, { season, teamMap });

  return { notPublished: false, teamGames, sourceRows, compressedBytes: compressed.byteLength, headerColumnCount: header.length };
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      schemaVersion: PERFORMANCE_CACHE_MANIFEST_VERSION,
      source: PERFORMANCE_SOURCE_LABEL,
      attribution: PERFORMANCE_ATTRIBUTION,
      requiredSourceColumns: [...REQUIRED_PERFORMANCE_PBP_COLUMNS],
      files: [],
      notPublished: [],
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

async function main() {
  const args = parseArgs(process.argv);
  const teamsJson = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf-8"));
  const teamMap = buildNflverseTeamMap(teamsJson);
  const manifest = readManifest();
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const notPublished = [];
  let changed = false;

  for (const season of args.seasons) {
    const label = `performance ${season}`;
    const result = await streamSeason(season, { teamMap });

    if (result.notPublished) {
      const reason = result.zeroRegRows ? "no completed REG-season games yet" : "not yet published upstream";
      console.log(`[nfl:performance-cache] ${label}: ${reason} (expected before/early in the season)`);
      notPublished.push({ season, sourceUrl: nflversePbpUrl(season), reason });
      continue;
    }

    const filename = `performance_team_game_${season}.csv`;
    const text = serializePerformanceCompact(result.teamGames);
    const entry = buildCacheManifestEntry({
      season,
      filename,
      sourceUrl: nflversePbpUrl(season),
      sourceType: "projection",
      text,
      retrievedDateUtc,
      upstream: {
        byteSize: result.compressedBytes,
        sha256: "n/a — raw play-by-play is streamed and discarded, never stored",
        rowCount: result.sourceRows,
        headerColumns: [...REQUIRED_PERFORMANCE_PBP_COLUMNS],
      },
      projectedColumns: [...PERFORMANCE_COMPACT_COLUMNS],
      projectionFilter: "REG season only; per-team-game EPA/success/drive sums, unfiltered + garbage-time-filtered",
    });
    entry.upstreamCompressedBytes = result.compressedBytes;
    entry.upstreamSourceRows = result.sourceRows;
    entry.compactRowCount = result.teamGames.length;

    console.log(
      `[nfl:performance-cache] ${label}: ${result.sourceRows} REG rows -> ${result.teamGames.length} team-games; ` +
        `${(result.compressedBytes / 1024 / 1024).toFixed(1)} MiB gz -> ${(Buffer.byteLength(text) / 1024).toFixed(1)} KiB`
    );

    if (!args.dryRun) {
      writeAtomic(join(CACHE_DIR, filename), text);
      const index = manifest.files.findIndex((f) => f.filename === filename);
      if (index >= 0) manifest.files[index] = entry;
      else manifest.files.push(entry);
      changed = true;
    }
  }

  if (!args.dryRun) {
    manifest.schemaVersion = PERFORMANCE_CACHE_MANIFEST_VERSION;
    manifest.source = PERFORMANCE_SOURCE_LABEL;
    manifest.attribution = PERFORMANCE_ATTRIBUTION;
    manifest.requiredSourceColumns = [...REQUIRED_PERFORMANCE_PBP_COLUMNS];
    manifest.rawPlayByPlayCommitted = false;
    manifest.notPublished = notPublished;
    manifest.files.sort((a, b) => a.season - b.season);
    if (changed || !existsSync(MANIFEST_PATH)) {
      writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const attrs = join(CACHE_DIR, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Compact Performance-Rating cache derived from nflverse play-by-play; keep bytes stable.\n*.csv -text\n");
    }
  }

  console.log(`[nfl:performance-cache] done${args.dryRun ? " (dry run; nothing written)" : ""}`);
}

main().catch((err) => {
  console.error(`[nfl:performance-cache] FAILED: ${err.message}`);
  console.error("[nfl:performance-cache] existing cache left untouched");
  process.exit(1);
});
