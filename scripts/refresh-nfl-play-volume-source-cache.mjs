/**
 * Refresh the committed compact play-volume/pass-tendency cache from
 * nflverse play-by-play (NFL yardage-prop Phase 2).
 *
 * Mirrors `refresh-nfl-epa-source-cache.mjs` exactly: streams the gzipped
 * play-by-play through Node's built-in zlib, aggregates straight to one
 * row per (game_id, team), and never writes the raw play-by-play to disk.
 * Uses the exact same eligible-play classification as the EPA cache
 * (`nfl-epa-core.mjs`'s `classifyPlay`, re-used via `nfl-play-volume-core.mjs`)
 * so the two caches can never silently disagree about what counts as an
 * offensive play.
 *
 * Usage:
 *   node scripts/refresh-nfl-play-volume-source-cache.mjs
 *   node scripts/refresh-nfl-play-volume-source-cache.mjs --seasons=2022,2023,2024,2025
 *   node scripts/refresh-nfl-play-volume-source-cache.mjs --dry-run
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
  NEUTRAL_SITUATION_DEFINITION,
  NFL_PLAY_VOLUME_ATTRIBUTION,
  NFL_PLAY_VOLUME_SOURCE_LABEL,
  PLAY_VOLUME_COMPACT_COLUMNS,
  REQUIRED_PLAY_VOLUME_PBP_COLUMNS,
  aggregatePlayVolume,
  nflversePbpUrl,
  serializePlayVolumeCompact,
  validatePlayVolumeTeamGames,
} from "./lib/nfl-play-volume-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "play-volume-team-game");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");

export const PLAY_VOLUME_CACHE_MANIFEST_VERSION = "nfl-play-volume-team-game-cache-v1";

const DEFAULT_SEASONS = [2022, 2023, 2024, 2025];
const REQUEST_TIMEOUT_MS = 180000;
const USER_AGENT = "JoeKnowsBall-nfl-yardage-props/1.0 (+https://www.joeknowsball.com)";

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

  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = REQUIRED_PLAY_VOLUME_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) {
        throw new Error(`${season}: play-by-play is missing required columns ${missing.join(", ")}`);
      }
      indices = Object.fromEntries(REQUIRED_PLAY_VOLUME_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    const cells = splitCsvLine(line);
    const row = {};
    for (const column of REQUIRED_PLAY_VOLUME_PBP_COLUMNS) row[column] = cells[indices[column]] ?? "";
    rows.push(row);
  }

  if (rows.length === 0) throw new Error(`${season}: play-by-play parsed to zero rows`);

  const { teamGames, sourceRows, eligiblePlays } = aggregatePlayVolume(rows, { season, teamMap });
  const canonical = new Map([...teamMap.values()].map((team) => [team.abbr, team]));
  const problems = validatePlayVolumeTeamGames(teamGames, { teamMap: canonical });
  if (problems.length > 0) {
    throw new Error(`${season}: aggregated play-volume team-games failed validation:\n  - ${problems.slice(0, 8).join("\n  - ")}`);
  }

  return {
    notPublished: false,
    teamGames,
    sourceRows,
    eligiblePlays,
    compressedBytes: compressed.byteLength,
    headerColumnCount: header.length,
  };
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
      schemaVersion: PLAY_VOLUME_CACHE_MANIFEST_VERSION,
      source: NFL_PLAY_VOLUME_SOURCE_LABEL,
      attribution: NFL_PLAY_VOLUME_ATTRIBUTION,
      neutralSituationDefinition: NEUTRAL_SITUATION_DEFINITION,
      requiredSourceColumns: [...REQUIRED_PLAY_VOLUME_PBP_COLUMNS],
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
    const label = `play-volume ${season}`;
    const result = await streamSeason(season, { teamMap });

    if (result.notPublished) {
      console.log(`[nfl:play-volume-cache] ${label}: not yet published upstream (expected before the season starts)`);
      notPublished.push({ season, sourceUrl: nflversePbpUrl(season) });
      continue;
    }

    const filename = `play_volume_team_game_${season}.csv`;
    const text = serializePlayVolumeCompact(result.teamGames);
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
        headerColumns: [...REQUIRED_PLAY_VOLUME_PBP_COLUMNS],
      },
      projectedColumns: [...PLAY_VOLUME_COMPACT_COLUMNS],
      projectionFilter: NEUTRAL_SITUATION_DEFINITION,
    });
    entry.upstreamCompressedBytes = result.compressedBytes;
    entry.upstreamSourceRows = result.sourceRows;
    entry.upstreamColumnCount = result.headerColumnCount;
    entry.eligiblePlays = result.eligiblePlays;
    entry.compactRowCount = result.teamGames.length;
    entry.reductionRatio = Number((result.compressedBytes / Buffer.byteLength(text)).toFixed(1));

    console.log(
      `[nfl:play-volume-cache] ${label}: ${result.sourceRows} source rows -> ${result.eligiblePlays} eligible plays ` +
        `-> ${result.teamGames.length} team-games; ${(result.compressedBytes / 1024 / 1024).toFixed(1)} MiB gz ` +
        `-> ${(Buffer.byteLength(text) / 1024).toFixed(1)} KiB (${entry.reductionRatio}x reduction)`,
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
    manifest.schemaVersion = PLAY_VOLUME_CACHE_MANIFEST_VERSION;
    manifest.source = NFL_PLAY_VOLUME_SOURCE_LABEL;
    manifest.attribution = NFL_PLAY_VOLUME_ATTRIBUTION;
    manifest.neutralSituationDefinition = NEUTRAL_SITUATION_DEFINITION;
    manifest.requiredSourceColumns = [...REQUIRED_PLAY_VOLUME_PBP_COLUMNS];
    manifest.rawPlayByPlayCommitted = false;
    manifest.notPublished = notPublished;
    manifest.files.sort((a, b) => a.season - b.season);
    if (changed || !existsSync(MANIFEST_PATH)) {
      writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const attrs = join(CACHE_DIR, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Compact play-volume cache derived from nflverse play-by-play; keep bytes stable.\n*.csv -text\n");
    }
  }

  console.log(`[nfl:play-volume-cache] done${args.dryRun ? " (dry run; nothing written)" : ""}`);
  console.log("[nfl:play-volume-cache] raw play-by-play was streamed and discarded — never written to disk");
}

main().catch((err) => {
  console.error(`[nfl:play-volume-cache] FAILED: ${err.message}`);
  console.error("[nfl:play-volume-cache] existing cache left untouched");
  process.exit(1);
});
