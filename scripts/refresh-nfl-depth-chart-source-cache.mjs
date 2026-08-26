/**
 * Phase 9.2: refreshes the committed nflverse ESPN-sourced depth-chart cache.
 *
 * Source: `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv`
 * (CC-BY 4.0, ESPN-origin, republished by nflverse -- the same provider and
 * license class every other nflverse cache in this repo already uses).
 *
 * The upstream file is a DAILY snapshot history for the whole season
 * (verified: ~469K rows / ~45 MB for a season spanning offseason-to-date),
 * far too large to commit whole -- the same size problem `weekly_rosters`
 * already solved. This script commits a PROJECTION: only the rows for the
 * single most-recent `dt` timestamp present in the fetched file (verified:
 * ~3,300 rows / ~150 KB for one day, all 32 teams), with every column
 * preserved verbatim for those rows. The manifest records the upstream
 * byteSize/sha256/rowCount (Phase 4 injury-cache convention) AND the
 * source's own snapshot timestamp (`sourceSnapshotAt`, the `dt` value kept)
 * distinctly from `retrievedDateUtc` (when THIS script ran) -- staleness is
 * computed from the former, not the latter.
 *
 * Validates before ever writing: expected columns present, all 32 teams
 * represented, numeric positive pos_rank, non-blank gsis_id for offensive
 * skill positions, no duplicate (team, pos_name, gsis_id) within the kept
 * snapshot. A failed validation leaves the existing committed cache
 * untouched -- never overwrites a known-good cache with malformed data.
 *
 * Usage:
 *   node scripts/refresh-nfl-depth-chart-source-cache.mjs
 *   node scripts/refresh-nfl-depth-chart-source-cache.mjs --seasons=2026
 *   node scripts/refresh-nfl-depth-chart-source-cache.mjs --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildCacheManifestEntry, csvHeaderColumns, csvRowCount, nflverseReleaseUrl, sha256Hex } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "depth-charts");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");
const MANIFEST_VERSION = "nfl-depth-chart-source-cache-v1";
const RELEASE = "depth_charts";

const REQUEST_TIMEOUT_MS = 180000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 4000;
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

const EXPECTED_COLUMNS = Object.freeze([
  "dt", "team", "player_name", "espn_id", "gsis_id", "pos_grp_id", "pos_grp", "pos_id", "pos_name", "pos_abb", "pos_slot", "pos_rank",
]);
const OFFENSIVE_SKILL_POSITIONS = Object.freeze(["Quarterback", "Running Back", "Wide Receiver", "Tight End"]);
const NFL_TEAM_COUNT = 32;

const DEFAULT_SEASONS = [2025, 2026];

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map((v) => Number(v.trim())).filter(Number.isInteger);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAsset(url, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" }, signal: controller.signal });
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
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

const MAX_UNRESOLVED_IDENTITY_FRACTION = 0.1;

/**
 * Reduces the full daily-history upstream text to just its most-recent `dt`
 * snapshot's rows. Rows with a blank `gsis_id` are dropped (not committed --
 * this codebase's identity system requires a gsis_id; observed instances
 * are deep camp-body bench slots ESPN has not yet crosswalked, e.g.
 * rank 5-13 depth entries with no player_name either) and counted, never
 * silently kept. A large unresolved fraction (>10%) is treated as a
 * malformed-source signal and fails the whole refresh rather than
 * committing a degraded snapshot.
 */
function projectLatestSnapshot(upstreamText) {
  const rows = parseCsv(upstreamText);
  const missing = EXPECTED_COLUMNS.filter((c) => !(c in (rows[0] ?? {})));
  if (missing.length > 0) throw new Error(`upstream is missing expected columns: ${missing.join(", ")}`);
  const latestDt = rows.reduce((max, r) => (String(r.dt) > max ? String(r.dt) : max), "");
  if (!latestDt) throw new Error("could not determine a latest snapshot timestamp (no non-empty dt values)");
  const snapshotRows = rows.filter((r) => r.dt === latestDt);
  const unresolved = snapshotRows.filter((r) => String(r.gsis_id ?? "").trim() === "");
  const fraction = snapshotRows.length > 0 ? unresolved.length / snapshotRows.length : 1;
  if (fraction > MAX_UNRESOLVED_IDENTITY_FRACTION) {
    throw new Error(`${unresolved.length}/${snapshotRows.length} (${(fraction * 100).toFixed(1)}%) rows have a blank gsis_id -- exceeds the ${MAX_UNRESOLVED_IDENTITY_FRACTION * 100}% malformed-source threshold`);
  }
  const kept = snapshotRows.filter((r) => String(r.gsis_id ?? "").trim() !== "");
  return { latestDt, text: serializeCsv(kept, [...EXPECTED_COLUMNS]), unresolvedIdentityRowsDropped: unresolved.length };
}

/**
 * Validates a projected snapshot BEFORE it is ever written. Returns a list
 * of problems; empty means valid. Never throws -- caller decides fail-closed.
 */
function validateSnapshot(text) {
  const problems = [];
  const rows = parseCsv(text);
  if (rows.length === 0) {
    problems.push("snapshot has zero rows");
    return problems;
  }
  const teams = new Set(rows.map((r) => String(r.team ?? "").trim().toUpperCase()).filter(Boolean));
  if (teams.size < NFL_TEAM_COUNT) problems.push(`only ${teams.size}/${NFL_TEAM_COUNT} teams represented`);

  const seen = new Set();
  let badRank = 0;
  for (const r of rows) {
    const team = String(r.team ?? "").trim();
    const posName = String(r.pos_name ?? "").trim();
    const gsisId = String(r.gsis_id ?? "").trim();
    const key = `${team}|${posName}|${gsisId}`;
    if (gsisId && seen.has(key)) problems.push(`duplicate (team, pos_name, gsisId) row: ${key}`);
    seen.add(key);

    const rank = Number(r.pos_rank);
    if (!Number.isFinite(rank) || rank <= 0 || !Number.isInteger(rank)) badRank += 1;
  }
  if (badRank > 0) problems.push(`${badRank} row(s) have a non-positive/non-integer pos_rank`);

  const coveredSkillPositions = new Set(rows.filter((r) => OFFENSIVE_SKILL_POSITIONS.includes(String(r.pos_name ?? "").trim())).map((r) => r.pos_name));
  for (const position of OFFENSIVE_SKILL_POSITIONS) {
    if (!coveredSkillPositions.has(position)) problems.push(`no rows found for expected position "${position}"`);
  }
  return problems;
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
  if (!existsSync(MANIFEST_PATH)) return { schemaVersion: MANIFEST_VERSION, source: "nflverse/nflverse-data releases (depth_charts, ESPN origin)", files: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

async function refreshSeason(season, manifest, { dryRun }) {
  const filename = `depth_charts_${season}.csv`;
  const url = nflverseReleaseUrl(RELEASE, filename);
  const label = `depth-charts ${season}`;
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);

  const { notPublished, text: upstreamText } = await fetchAsset(url, label);
  if (notPublished) {
    console.log(`[nfl:depth-chart-cache] ${label}: not yet published upstream`);
    return { notPublished: true };
  }

  const upstreamBytes = Buffer.from(upstreamText, "utf-8");
  let projected;
  try {
    projected = projectLatestSnapshot(upstreamText);
  } catch (err) {
    console.error(`[nfl:depth-chart-cache] ${label}: FAILED to project latest snapshot: ${err.message}`);
    console.error(`[nfl:depth-chart-cache] ${label}: existing cache left untouched`);
    return { failed: true };
  }

  const problems = validateSnapshot(projected.text);
  if (problems.length > 0) {
    console.error(`[nfl:depth-chart-cache] ${label}: FAILED validation, refusing to write:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`[nfl:depth-chart-cache] ${label}: existing cache left untouched`);
    return { failed: true, problems };
  }

  const entry = buildCacheManifestEntry({
    season,
    filename,
    sourceUrl: url,
    sourceType: "projection",
    text: projected.text,
    retrievedDateUtc,
    upstream: {
      byteSize: upstreamBytes.byteLength,
      sha256: sha256Hex(upstreamBytes),
      rowCount: csvRowCount(upstreamText),
      headerColumns: csvHeaderColumns(upstreamText),
    },
    projectedColumns: [...EXPECTED_COLUMNS],
    projectionFilter: "dt == max(dt) present in the fetched upstream file (most-recent daily snapshot only)",
  });
  entry.sourceSnapshotAt = projected.latestDt;
  entry.unresolvedIdentityRowsDropped = projected.unresolvedIdentityRowsDropped;

  console.log(`[nfl:depth-chart-cache] ${label}: snapshot ${projected.latestDt}, ${entry.rowCount} rows, ${(entry.byteSize / 1024).toFixed(0)} KiB (projected from ${(upstreamBytes.byteLength / 1024 / 1024).toFixed(1)} MiB / ${entry.upstream.rowCount} rows upstream; ${projected.unresolvedIdentityRowsDropped} row(s) dropped for blank gsis_id)`);

  if (!dryRun) {
    writeAtomic(join(CACHE_DIR, filename), projected.text);
    const index = manifest.files.findIndex((f) => f.filename === filename);
    if (index >= 0) manifest.files[index] = entry;
    else manifest.files.push(entry);
  }
  return { entry };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[nfl:depth-chart-cache] seasons=${args.seasons.join(",")}${args.dryRun ? " (dry run)" : ""}`);

  const manifest = readManifest();
  const notPublished = [];
  let anyFailed = false;

  for (const season of args.seasons) {
    const result = await refreshSeason(season, manifest, { dryRun: args.dryRun });
    if (result.notPublished) notPublished.push({ season, filename: `depth_charts_${season}.csv` });
    if (result.failed) anyFailed = true;
  }

  if (!args.dryRun) {
    manifest.schemaVersion = MANIFEST_VERSION;
    manifest.source = "nflverse/nflverse-data releases (depth_charts release, ESPN origin, CC-BY 4.0)";
    manifest.attribution = "nflverse; depth chart data originates with ESPN";
    manifest.notPublished = notPublished;
    manifest.files.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.filename.localeCompare(b.filename));
    writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    const attrs = join(CACHE_DIR, ".gitattributes");
    if (!existsSync(attrs)) writeAtomic(attrs, "# Preserve the canonical nflverse release bytes on every platform.\n*.csv -text\n");
  }

  if (anyFailed) {
    console.error("[nfl:depth-chart-cache] FAILED: one or more seasons failed validation (see above); existing cache preserved.");
    process.exit(1);
  }
  console.log("[nfl:depth-chart-cache] done");
}

main().catch((err) => {
  console.error(`[nfl:depth-chart-cache] FAILED: ${err.message}`);
  console.error("[nfl:depth-chart-cache] existing cache left untouched");
  process.exit(1);
});
