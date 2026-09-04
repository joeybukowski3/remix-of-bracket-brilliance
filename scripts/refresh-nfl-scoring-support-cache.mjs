/**
 * Refresh the committed production "scoring support" compact per-team-game
 * cache from nflverse play-by-play -- the maintained artifact the NFL
 * projected-total model (`jkb-nfl-total-ridge-v1.0.0`,
 * src/lib/nfl/props/totals/**) reads for weekly/live predictions.
 *
 * Mirrors refresh-nfl-play-volume-source-cache.mjs exactly: streams the
 * gzipped play-by-play through Node's built-in zlib, aggregates straight to
 * one row per (game_id, team) via the SHARED engine in
 * scripts/lib/nfl-scoring-support-core.mjs, and never writes the raw
 * play-by-play to disk. Because the aggregation engine is shared with the
 * research builder
 * (scripts/analysis/nfl-total-model-research/fetch-scoring-support-cache.mjs),
 * this production cache carries the identical feature semantics as the
 * Phase A-Q research cache -- proven row-for-row in
 * src/lib/nfl/props/totals/scoringSupportProductionParity.test.ts.
 *
 * Leakage safety: every emitted row is a COMPLETED historical team-game
 * (REG season only). The model's own EWMA windows
 * (src/lib/nfl/research/total/ewmaWindow.ts) apply the strict
 * (season, week) cutoff -- this cache never itself decides what is "prior";
 * it only aggregates finished games. Historical rows for closed seasons are
 * preserved on every refresh; only the current season's file grows.
 *
 * Fail-closed: on ANY fetch/parse/validation failure the existing committed
 * cache is left byte-for-byte untouched and the process exits non-zero, so
 * a scheduled workflow stops before its commit step is ever reached.
 *
 * Usage:
 *   node scripts/refresh-nfl-scoring-support-cache.mjs
 *   node scripts/refresh-nfl-scoring-support-cache.mjs --seasons=2021,2022,2023,2024,2025
 *   node scripts/refresh-nfl-scoring-support-cache.mjs --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCacheManifestEntry } from "./lib/nfl-source-cache.mjs";
import {
  SCORING_SUPPORT_ATTRIBUTION,
  SCORING_SUPPORT_COMPACT_COLUMNS,
  SCORING_SUPPORT_ELIGIBLE_PLAY_FILTER,
  SCORING_SUPPORT_EXPLOSIVE_PLAY_DEFINITION,
  SCORING_SUPPORT_GARBAGE_TIME_FILTER,
  SCORING_SUPPORT_PBP_COLUMNS,
  SCORING_SUPPORT_SOURCE_LABEL,
  SCORING_SUPPORT_SUCCESS_RATE_DEFINITION,
  nflverseScoringSupportPbpUrl,
  serializeScoringSupportCompact,
  streamScoringSupportSeason,
} from "./lib/nfl-scoring-support-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "scoring-support-team-game");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");

export const SCORING_SUPPORT_CACHE_MANIFEST_VERSION = "nfl-scoring-support-team-game-cache-v1";

// 2021-2025: the research corpus window. 2022-2024 is the model's frozen
// training window; 2021 seeds Week-1 prior-season EWMA fallbacks for 2022;
// 2025 is the out-of-sample season and the first live-refresh target.
const DEFAULT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const USER_AGENT = "JoeKnowsBall-nfl-total-model/1.0 (+https://www.joeknowsball.com)";

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

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf-8");
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) { try { unlinkSync(tmp); } catch { /* best effort */ } }
    throw err;
  }
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      schemaVersion: SCORING_SUPPORT_CACHE_MANIFEST_VERSION,
      source: SCORING_SUPPORT_SOURCE_LABEL,
      attribution: SCORING_SUPPORT_ATTRIBUTION,
      eligiblePlayFilter: SCORING_SUPPORT_ELIGIBLE_PLAY_FILTER,
      successRateDefinition: SCORING_SUPPORT_SUCCESS_RATE_DEFINITION,
      explosivePlayDefinition: SCORING_SUPPORT_EXPLOSIVE_PLAY_DEFINITION,
      garbageTimeFilter: SCORING_SUPPORT_GARBAGE_TIME_FILTER,
      requiredSourceColumns: [...SCORING_SUPPORT_PBP_COLUMNS],
      rawPlayByPlayCommitted: false,
      files: [],
      notPublished: [],
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

/** Validate an aggregated season before it is allowed to touch disk. */
function validateSeasonRows(season, rows) {
  const problems = [];
  if (rows.length === 0) problems.push(`${season}: zero team-game rows`);
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.game_id}|${row.team}`;
    if (seen.has(key)) problems.push(`${season}: duplicate team-game ${key}`);
    seen.add(key);
    if (!row.team || !row.opponent || row.team === row.opponent) problems.push(`${season}: bad team identity in ${key}`);
    if (row.season !== season) problems.push(`${season}: row season ${row.season} != ${season} in ${key}`);
    if (!(row.eligible_plays > 0)) problems.push(`${season}: non-positive eligible_plays in ${key}`);
    if (row.success_den > row.eligible_plays || row.success_num > row.success_den) problems.push(`${season}: success counts out of range in ${key}`);
    if (row.explosive_count > row.eligible_plays) problems.push(`${season}: explosive_count > eligible_plays in ${key}`);
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = readManifest();
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const notPublished = [];
  let changed = false;

  for (const season of args.seasons) {
    const label = `scoring-support ${season}`;
    const result = await streamScoringSupportSeason(season, { userAgent: USER_AGENT });

    if (result.notPublished) {
      console.log(`[nfl:scoring-support-cache] ${label}: not yet published upstream`);
      notPublished.push({ season, sourceUrl: nflverseScoringSupportPbpUrl(season) });
      continue;
    }

    const problems = validateSeasonRows(season, result.rows);
    if (problems.length > 0) {
      throw new Error(`${label}: aggregated rows failed validation:\n  - ${problems.slice(0, 8).join("\n  - ")}`);
    }

    const filename = `scoring_support_team_game_${season}.csv`;
    const text = serializeScoringSupportCompact(result.rows);
    const entry = buildCacheManifestEntry({
      season,
      filename,
      sourceUrl: nflverseScoringSupportPbpUrl(season),
      sourceType: "projection",
      text,
      retrievedDateUtc,
      upstream: {
        byteSize: result.compressedBytes,
        sha256: "n/a — raw play-by-play is streamed and discarded, never stored",
        rowCount: result.sourceRows,
        headerColumns: [...SCORING_SUPPORT_PBP_COLUMNS],
      },
      projectedColumns: [...SCORING_SUPPORT_COMPACT_COLUMNS],
      projectionFilter: SCORING_SUPPORT_ELIGIBLE_PLAY_FILTER,
    });
    entry.upstreamCompressedBytes = result.compressedBytes;
    entry.upstreamSourceRows = result.sourceRows;
    entry.eligiblePlays = result.keptRows;
    entry.compactRowCount = result.rows.length;

    console.log(
      `[nfl:scoring-support-cache] ${label}: ${result.sourceRows} source rows -> ${result.keptRows} eligible plays ` +
        `-> ${result.rows.length} team-games; ${(result.compressedBytes / 1024 / 1024).toFixed(1)} MiB gz`,
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
    manifest.schemaVersion = SCORING_SUPPORT_CACHE_MANIFEST_VERSION;
    manifest.source = SCORING_SUPPORT_SOURCE_LABEL;
    manifest.attribution = SCORING_SUPPORT_ATTRIBUTION;
    manifest.eligiblePlayFilter = SCORING_SUPPORT_ELIGIBLE_PLAY_FILTER;
    manifest.successRateDefinition = SCORING_SUPPORT_SUCCESS_RATE_DEFINITION;
    manifest.explosivePlayDefinition = SCORING_SUPPORT_EXPLOSIVE_PLAY_DEFINITION;
    manifest.garbageTimeFilter = SCORING_SUPPORT_GARBAGE_TIME_FILTER;
    manifest.requiredSourceColumns = [...SCORING_SUPPORT_PBP_COLUMNS];
    manifest.rawPlayByPlayCommitted = false;
    manifest.notPublished = notPublished;
    manifest.files.sort((a, b) => a.season - b.season);
    if (changed || !existsSync(MANIFEST_PATH)) {
      writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const attrs = join(CACHE_DIR, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Compact scoring-support cache derived from nflverse play-by-play; keep bytes stable (Windows autocrlf must not touch it).\n*.csv -text\n");
    }
  }

  console.log(`[nfl:scoring-support-cache] done${args.dryRun ? " (dry run; nothing written)" : ""}`);
  console.log("[nfl:scoring-support-cache] raw play-by-play was streamed and discarded — never written to disk");
}

main().catch((err) => {
  console.error(`[nfl:scoring-support-cache] FAILED: ${err.message}`);
  console.error("[nfl:scoring-support-cache] existing cache left untouched");
  process.exit(1);
});
