/**
 * Refresh the committed nflverse caches backing the Phase 4 injury pipeline.
 *
 * This is the only script here that touches the network. The artifact generator
 * reads the committed cache and never fetches, so `npm run nfl:matchup-injuries`
 * stays reproducible and offline.
 *
 *   injuries_{season}.csv       verbatim   (~0.7 MB)
 *   snap_counts_{season}.csv    verbatim   (~2.4 MB)
 *   roster_weekly_{season}.csv  projection (15.4 MB upstream -> ~1.4 MB)
 *
 * The roster file is committed as a documented column+row projection because
 * the upstream asset is far too large to version. The manifest records the
 * upstream byteSize/sha256/rowCount alongside the projection's own digest, so
 * the reduction is auditable and re-derivable from the recorded release.
 *
 * A season whose upstream files do not exist yet (a regular season that has not
 * started) is reported as "not yet published" and skipped. That is an expected
 * state, not a failure, and it never removes or rewrites an existing cache.
 *
 * Usage:
 *   node scripts/refresh-nfl-injury-source-cache.mjs
 *   node scripts/refresh-nfl-injury-source-cache.mjs --seasons=2025,2026
 *   node scripts/refresh-nfl-injury-source-cache.mjs --dry-run
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
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

const MANIFEST_VERSION = "nfl-injury-source-cache-v1";

/** Columns retained from roster_weekly. Everything the join and UI need. */
const ROSTER_PROJECTION_COLUMNS = Object.freeze([
  "season", "week", "game_type", "team", "gsis_id", "pfr_id", "espn_id",
  "full_name", "position", "depth_chart_position", "status", "status_description_abbr",
]);

const ROSTER_PROJECTION_FILTER = "game_type == REG";

/**
 * Columns retained from the league-wide players release — the authoritative
 * gsis_id -> pfr_id crosswalk. Only rows carrying both ids are kept.
 */
const PLAYERS_PROJECTION_COLUMNS = Object.freeze([
  "gsis_id", "pfr_id", "espn_id", "display_name", "position", "position_group", "status",
]);

const PLAYERS_PROJECTION_FILTER = "gsis_id != '' AND pfr_id != ''";

export const CACHE_SPECS = Object.freeze([
  {
    key: "injuries",
    dir: "injuries",
    release: "injuries",
    filename: (season) => `injuries_${season}.csv`,
    sourceType: "verbatim",
    seasonScoped: true,
  },
  {
    key: "snapCounts",
    dir: "snap-counts",
    release: "snap_counts",
    filename: (season) => `snap_counts_${season}.csv`,
    sourceType: "verbatim",
    seasonScoped: true,
  },
  {
    key: "weeklyRosters",
    dir: "weekly-rosters",
    release: "weekly_rosters",
    filename: (season) => `roster_weekly_${season}.csv`,
    sourceType: "projection",
    seasonScoped: true,
  },
  {
    key: "players",
    dir: "players",
    release: "players",
    filename: () => "players.csv",
    sourceType: "projection",
    seasonScoped: false,
  },
]);

const DEFAULT_SEASONS = [2025, 2026];

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw
        .slice(10)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Number.isInteger);
    } else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a release asset.
 *
 * A 404 is returned as `notPublished` rather than thrown: nflverse does not
 * create a season's injury/snap assets until that regular season begins.
 */
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

/** Reduce an upstream release to its committed projection. */
function project(spec, text) {
  const columns = spec.key === "players" ? PLAYERS_PROJECTION_COLUMNS : ROSTER_PROJECTION_COLUMNS;
  const rows = parseCsv(text);
  const missing = columns.filter((column) => !(column in (rows[0] ?? {})));
  if (missing.length > 0) {
    throw new Error(`${spec.key}: upstream is missing projected columns ${missing.join(", ")}`);
  }
  const kept =
    spec.key === "players"
      ? rows.filter(
          (row) => String(row.gsis_id ?? "").trim() !== "" && String(row.pfr_id ?? "").trim() !== ""
        )
      : rows.filter((row) => String(row.game_type ?? "").trim().toUpperCase() === "REG");
  return serializeCsv(kept, [...columns]);
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

async function refreshSpec(spec, seasons, { dryRun }) {
  const dir = join(CACHE_ROOT, spec.dir);
  const manifestPath = join(dir, "manifest.json");
  const manifest = readManifest(manifestPath);
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const notPublished = [];
  let changed = false;

  // League-wide files are fetched once, not per season.
  const targets = spec.seasonScoped ? seasons : [null];

  for (const season of targets) {
    const filename = spec.filename(season);
    const url = nflverseReleaseUrl(spec.release, filename);
    const label = spec.seasonScoped ? `${spec.key} ${season}` : spec.key;

    const { notPublished: missing, text: upstreamText } = await fetchAsset(url, label);
    if (missing) {
      console.log(`[nfl:injury-cache] ${label}: not yet published upstream (expected before the season starts)`);
      notPublished.push({ season, filename, sourceUrl: url });
      continue;
    }

    const committedText =
      spec.sourceType === "projection" ? project(spec, upstreamText) : upstreamText;

    const entry = buildCacheManifestEntry({
      season,
      filename,
      sourceUrl: url,
      sourceType: spec.sourceType,
      text: committedText,
      retrievedDateUtc,
      upstream:
        spec.sourceType === "projection"
          ? {
              byteSize: Buffer.from(upstreamText, "utf-8").byteLength,
              sha256: sha256Hex(Buffer.from(upstreamText, "utf-8")),
              rowCount: csvRowCount(upstreamText),
              headerColumns: csvHeaderColumns(upstreamText),
            }
          : null,
      projectedColumns:
        spec.sourceType !== "projection"
          ? null
          : [...(spec.key === "players" ? PLAYERS_PROJECTION_COLUMNS : ROSTER_PROJECTION_COLUMNS)],
      projectionFilter:
        spec.sourceType !== "projection"
          ? null
          : spec.key === "players"
            ? PLAYERS_PROJECTION_FILTER
            : ROSTER_PROJECTION_FILTER,
    });

    console.log(
      `[nfl:injury-cache] ${label}: ${entry.rowCount} rows, ${(entry.byteSize / 1024).toFixed(0)} KiB` +
        (spec.sourceType === "projection"
          ? ` (projected from ${(entry.upstream.byteSize / 1024 / 1024).toFixed(1)} MiB / ${entry.upstream.rowCount} rows)`
          : "")
    );

    if (!dryRun) {
      writeAtomic(join(dir, filename), committedText);
      const index = manifest.files.findIndex((file) => file.filename === filename);
      if (index >= 0) manifest.files[index] = entry;
      else manifest.files.push(entry);
      changed = true;
    }
  }

  if (!dryRun) {
    manifest.schemaVersion = MANIFEST_VERSION;
    manifest.source = "nflverse/nflverse-data releases";
    manifest.attribution =
      spec.key === "snapCounts"
        ? "nflverse; snap counts originate with Pro-Football-Reference"
        : "nflverse";
    manifest.notPublished = notPublished;
    manifest.files.sort(
      (a, b) => (a.season ?? 0) - (b.season ?? 0) || a.filename.localeCompare(b.filename)
    );
    if (changed || !existsSync(manifestPath)) {
      writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const attrs = join(dir, ".gitattributes");
    if (!existsSync(attrs)) {
      writeAtomic(attrs, "# Preserve the canonical nflverse release bytes on every platform.\n*.csv -text\n");
    }
  }

  return { notPublished };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[nfl:injury-cache] seasons=${args.seasons.join(",")}${args.dryRun ? " (dry run)" : ""}`);

  for (const spec of CACHE_SPECS) {
    await refreshSpec(spec, args.seasons, { dryRun: args.dryRun });
  }

  console.log("[nfl:injury-cache] done");
}

main().catch((err) => {
  console.error(`[nfl:injury-cache] FAILED: ${err.message}`);
  console.error("[nfl:injury-cache] existing cache left untouched");
  process.exit(1);
});
