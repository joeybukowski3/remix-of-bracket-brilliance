/**
 * Narrow refresh of ONLY `data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv`
 * (and its manifest entry), following the exact same cache conventions as
 * `refresh-nfl-injury-source-cache.mjs`'s `weeklyRosters` spec (same release,
 * same column projection, same `game_type == REG` filter, same manifest
 * shape via `buildCacheManifestEntry`). Deliberately scoped to season 2026
 * only -- it never touches 2023/2024/2025 entries, `players.csv`, `injuries`,
 * or `snap-counts`. Network-touching; run manually, not wired into CI.
 *
 * Usage: node scripts/refresh-fantasy-2026-weekly-roster-cache.mjs [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildCacheManifestEntry, csvHeaderColumns, csvRowCount, nflverseReleaseUrl, sha256Hex } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "nfl", "nflverse", "weekly-rosters");
const MANIFEST_PATH = join(DIR, "manifest.json");
const SEASON = 2026;
const FILENAME = `roster_weekly_${SEASON}.csv`;
const RELEASE = "weekly_rosters";
const USER_AGENT = "JoeKnowsBall-fantasy-weekly-projections/1.0 (+https://www.joeknowsball.com)";
const REQUEST_TIMEOUT_MS = 120000;

const PROJECTED_COLUMNS = Object.freeze([
  "season", "week", "game_type", "team", "gsis_id", "pfr_id", "espn_id",
  "full_name", "position", "depth_chart_position", "status", "status_description_abbr",
]);
const PROJECTION_FILTER = "game_type == REG";

function serializeCsv(rows, columns) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(","));
  return `${lines.join("\n")}\n`;
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = nflverseReleaseUrl(RELEASE, FILENAME);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let upstreamText;
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" }, signal: controller.signal });
    if (!response.ok) throw new Error(`roster_weekly_${SEASON}: HTTP ${response.status}`);
    upstreamText = await response.text();
    if (upstreamText.trim() === "") throw new Error(`roster_weekly_${SEASON}: empty response body`);
  } finally {
    clearTimeout(timer);
  }

  const rows = parseCsv(upstreamText);
  const missing = PROJECTED_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
  if (missing.length) throw new Error(`roster_weekly_${SEASON}: upstream is missing projected columns ${missing.join(", ")}`);
  const kept = rows.filter((row) => String(row.game_type ?? "").trim().toUpperCase() === "REG");
  const committedText = serializeCsv(kept, [...PROJECTED_COLUMNS]);

  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const entry = buildCacheManifestEntry({
    season: SEASON, filename: FILENAME, sourceUrl: url, sourceType: "projection",
    text: committedText, retrievedDateUtc,
    upstream: {
      byteSize: Buffer.from(upstreamText, "utf-8").byteLength,
      sha256: sha256Hex(Buffer.from(upstreamText, "utf-8")),
      rowCount: csvRowCount(upstreamText),
      headerColumns: csvHeaderColumns(upstreamText),
    },
    projectedColumns: [...PROJECTED_COLUMNS],
    projectionFilter: PROJECTION_FILTER,
  });

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const before = manifest.files.find((file) => file.filename === FILENAME);

  console.log(JSON.stringify({
    before: before ? { retrievedDateUtc: before.retrievedDateUtc, byteSize: before.byteSize, rowCount: before.rowCount, sha256: before.sha256 } : null,
    after: { retrievedDateUtc: entry.retrievedDateUtc, byteSize: entry.byteSize, rowCount: entry.rowCount, sha256: entry.sha256 },
    upstream: entry.upstream,
    dryRun,
  }, null, 2));

  if (dryRun) return;

  writeAtomic(join(DIR, FILENAME), committedText);
  const index = manifest.files.findIndex((file) => file.filename === FILENAME);
  if (index >= 0) manifest.files[index] = entry;
  else manifest.files.push(entry);
  manifest.files.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.filename.localeCompare(b.filename));
  writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((err) => {
  console.error(`[refresh-fantasy-2026-weekly-roster-cache] FAILED: ${err.message}`);
  console.error("[refresh-fantasy-2026-weekly-roster-cache] existing cache left untouched");
  process.exit(1);
});
