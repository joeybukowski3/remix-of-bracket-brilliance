/**
 * Refresh the committed nflverse stats_team weekly cache for the in-progress
 * season.
 *
 * Feeds scripts/generate-nfl-matchup-metrics.mjs (conventional team metrics).
 * Written to data/nfl/nflverse/stats-team-week-current/ with its own manifest,
 * deliberately NOT to stats-team-week/: that directory is the validated
 * complete-season cache (2022-2025, REG+POST, checked by
 * scripts/validate-nfl-weekly-source-cache.mjs), and a partial in-progress
 * season does not satisfy its contract. Once a season completes it can be
 * promoted there by the normal historical-cache process.
 *
 * The committed bytes are exactly the upstream release bytes; the directory's
 * .gitattributes keeps them byte-stable on Windows. A season whose file does
 * not exist upstream yet is skipped, not an error.
 *
 * Usage:
 *   node scripts/refresh-nfl-stats-team-week-source-cache.mjs
 *   node scripts/refresh-nfl-stats-team-week-source-cache.mjs --seasons=2026
 *   node scripts/refresh-nfl-stats-team-week-source-cache.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { nflverseReleaseUrl, sha256Hex, csvHeaderColumns, csvRowCount } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-team-week-current");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");
const MANIFEST_VERSION = "nfl-weekly-source-cache-current-v1";
const SOURCE_LABEL = "nflverse (stats_team weekly release)";
const DEFAULT_SEASONS = [2026];
const REQUEST_TIMEOUT_MS = 60000;
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

function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
}

/** Manifest entry matching the shape already committed for earlier seasons. */
function buildEntry(season, filename, sourceUrl, bytes, retrievedDateUtc) {
  const text = bytes.toString("utf-8");
  const rows = parseCsv(text);
  const weeks = rows.map((r) => Number(r.week)).filter(Number.isFinite);
  return {
    season,
    filename,
    sourceUrl,
    retrievedDateUtc,
    byteSize: bytes.byteLength,
    sha256: sha256Hex(bytes),
    rowCount: csvRowCount(text),
    headerColumns: csvHeaderColumns(text),
    seasonTypes: [...new Set(rows.map((r) => r.season_type))].sort(),
    minimumWeek: Math.min(...weeks),
    maximumWeek: Math.max(...weeks),
    observedTeams: [...new Set(rows.map((r) => r.team))].sort(),
    sourceLabel: SOURCE_LABEL,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(CACHE_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"))
    : { schemaVersion: MANIFEST_VERSION, files: [] };
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);

  for (const season of args.seasons) {
    const filename = `stats_team_week_${season}.csv`;
    const sourceUrl = nflverseReleaseUrl("stats_team", filename);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(sourceUrl, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 404) {
      console.log(`[nfl:stats-team-week-cache] ${season}: not yet published upstream; skipped`);
      continue;
    }
    if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching ${sourceUrl}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error(`${season}: empty response`);
    const entry = buildEntry(season, filename, sourceUrl, bytes, retrievedDateUtc);
    if (entry.rowCount === 0) throw new Error(`${season}: file has no data rows`);
    console.log(
      `[nfl:stats-team-week-cache] ${season}: ${entry.rowCount} rows, weeks ${entry.minimumWeek}-${entry.maximumWeek}, ` +
        `${entry.observedTeams.length} teams, ${entry.byteSize} bytes`
    );

    if (args.dryRun) continue;
    writeAtomic(join(CACHE_DIR, filename), bytes);
    const index = manifest.files.findIndex((f) => f.filename === filename);
    if (index >= 0) manifest.files[index] = entry;
    else manifest.files.push(entry);
  }

  if (!args.dryRun) {
    manifest.files.sort((a, b) => a.season - b.season);
    writeAtomic(MANIFEST_PATH, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8"));
  }
  const attrs = join(CACHE_DIR, ".gitattributes");
  if (!args.dryRun && !existsSync(attrs)) {
    writeAtomic(attrs, Buffer.from("# Preserve the canonical nflverse release bytes on every platform.\n*.csv -text\n", "utf-8"));
  }
  console.log(`[nfl:stats-team-week-cache] done${args.dryRun ? " (dry run; nothing written)" : ""}`);
}

main().catch((err) => {
  console.error(`[nfl:stats-team-week-cache] FAILED: ${err.message}`);
  console.error("[nfl:stats-team-week-cache] existing cache left untouched");
  process.exit(1);
});
