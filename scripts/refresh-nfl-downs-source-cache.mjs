/**
 * Refresh the committed compact first-down / third-down cache from nflverse
 * play-by-play.
 *
 * Sibling of scripts/refresh-nfl-epa-source-cache.mjs: the same nflverse
 * play-by-play release (nflversePbpUrl), the same eligible-play classifier and
 * the same canonical team map, streamed and discarded the same way. Only the
 * per-team-game counts differ. See scripts/lib/nfl-downs-core.mjs for the exact
 * definitions.
 *
 * A season whose play-by-play does not exist yet is reported and skipped; that
 * never removes or rewrites an existing cache.
 *
 * Usage:
 *   node scripts/refresh-nfl-downs-source-cache.mjs                     (current season)
 *   node scripts/refresh-nfl-downs-source-cache.mjs --seasons=2025,2026 (explicit backfill)
 *   node scripts/refresh-nfl-downs-source-cache.mjs --dry-run
 */

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflverseTeamMap } from "./lib/nfl-schedules-results-core.mjs";
import { buildCacheManifestEntry } from "./lib/nfl-source-cache.mjs";
import { nflversePbpUrl } from "./lib/nfl-epa-core.mjs";
import {
  DOWNS_COMPACT_COLUMNS,
  DOWNS_ELIGIBLE_PLAY_FILTER,
  NFL_DOWNS_ATTRIBUTION,
  NFL_DOWNS_SOURCE_LABEL,
  REQUIRED_DOWNS_PBP_COLUMNS,
  aggregateDownsPlays,
  serializeDownsCompact,
  validateDownsTeamGames,
} from "./lib/nfl-downs-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "downs-team-game");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");

export const DOWNS_CACHE_MANIFEST_VERSION = "nfl-downs-team-game-cache-v1";

// Current (in-progress) season only: completed seasons are frozen in the cache
// and must not be re-fetched and re-stamped by a weekly refresh. Backfill a
// historical season explicitly with --seasons=2025.
const DEFAULT_SEASONS = [2026];
const REQUEST_TIMEOUT_MS = 180000;
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

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

/** Split one CSV line, honouring quoted fields. */
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(nflversePbpUrl(season), {
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
      const missing = REQUIRED_DOWNS_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) throw new Error(`${season}: play-by-play is missing required columns ${missing.join(", ")}`);
      indices = Object.fromEntries(REQUIRED_DOWNS_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    const cells = splitCsvLine(line);
    const row = {};
    for (const column of REQUIRED_DOWNS_PBP_COLUMNS) row[column] = cells[indices[column]] ?? "";
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`${season}: play-by-play parsed to zero rows`);

  const { teamGames, sourceRows, eligiblePlays } = aggregateDownsPlays(rows, { season, teamMap });
  const canonical = new Map([...teamMap.values()].map((team) => [team.abbr, team]));
  const problems = validateDownsTeamGames(teamGames, { teamMap: canonical });
  if (problems.length > 0) {
    throw new Error(`${season}: aggregated team-games failed validation:\n  - ${problems.slice(0, 8).join("\n  - ")}`);
  }
  return { notPublished: false, teamGames, sourceRows, eligiblePlays, compressedBytes: compressed.byteLength };
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
  if (!existsSync(MANIFEST_PATH)) return { files: [], notPublished: [] };
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
    const label = `downs ${season}`;
    const result = await streamSeason(season, { teamMap });
    if (result.notPublished) {
      console.log(`[nfl:downs-cache] ${label}: not yet published upstream (expected before the season starts)`);
      notPublished.push({ season, sourceUrl: nflversePbpUrl(season) });
      continue;
    }

    const filename = `downs_team_game_${season}.csv`;
    const text = serializeDownsCompact(result.teamGames);
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
        headerColumns: [...REQUIRED_DOWNS_PBP_COLUMNS],
      },
      projectedColumns: [...DOWNS_COMPACT_COLUMNS],
      projectionFilter: DOWNS_ELIGIBLE_PLAY_FILTER,
    });
    entry.upstreamSourceRows = result.sourceRows;
    entry.eligiblePlays = result.eligiblePlays;
    entry.compactRowCount = result.teamGames.length;

    console.log(
      `[nfl:downs-cache] ${label}: ${result.sourceRows} source rows -> ${result.eligiblePlays} eligible plays ` +
        `-> ${result.teamGames.length} team-games`
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
    manifest.schemaVersion = DOWNS_CACHE_MANIFEST_VERSION;
    manifest.source = NFL_DOWNS_SOURCE_LABEL;
    manifest.attribution = NFL_DOWNS_ATTRIBUTION;
    manifest.eligiblePlayFilter = DOWNS_ELIGIBLE_PLAY_FILTER;
    manifest.requiredSourceColumns = [...REQUIRED_DOWNS_PBP_COLUMNS];
    manifest.rawPlayByPlayCommitted = false;
    manifest.notPublished = notPublished;
    manifest.files.sort((a, b) => a.season - b.season);
    if (changed || !existsSync(MANIFEST_PATH)) {
      writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const attrs = join(CACHE_DIR, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Compact down cache derived from nflverse play-by-play; keep bytes stable.\n*.csv -text\n");
    }
  }

  console.log(`[nfl:downs-cache] done${args.dryRun ? " (dry run; nothing written)" : ""}`);
}

main().catch((err) => {
  console.error(`[nfl:downs-cache] FAILED: ${err.message}`);
  console.error("[nfl:downs-cache] existing cache left untouched");
  process.exit(1);
});
