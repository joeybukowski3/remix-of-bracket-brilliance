/**
 * check-pga-stats-freshness.mjs
 *
 * Validates that public/data/pga/player-stats-meta.json (written by
 * sync-pga-sheet.mjs) reports an export date within the acceptable window.
 *
 * Exits 0 (success) if fresh, exits 1 (failure) if stale or missing —
 * the GitHub Actions workflow uses this exit code to decide whether to
 * trigger the fetch-pga-player-stats.mjs fallback.
 *
 * "Stale" = export date is more than MAX_STALE_DAYS old, or missing entirely.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, "public", "data", "pga", "player-stats-meta.json");
const MAX_STALE_DAYS = parseInt(process.env.PGA_STATS_MAX_STALE_DAYS || "10", 10);

function daysBetween(a, b) {
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function main() {
  let meta;
  try {
    meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  } catch (err) {
    console.error(`[freshness] Could not read ${META_PATH}: ${err.message}`);
    console.error(`[freshness] Treating as STALE — no metadata means we can't trust the data.`);
    process.exitCode = 1;
    return;
  }

  if (!meta.exportDate) {
    console.error(`[freshness] No exportDate found in metadata. Treating as STALE.`);
    process.exitCode = 1;
    return;
  }

  const exportDate = new Date(meta.exportDate);
  if (Number.isNaN(exportDate.getTime())) {
    console.error(`[freshness] exportDate "${meta.exportDate}" is not a valid date. Treating as STALE.`);
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const age = daysBetween(now, exportDate);

  console.log(`[freshness] Sheet export date: ${meta.exportDate}`);
  console.log(`[freshness] Age: ${age.toFixed(1)} days (max allowed: ${MAX_STALE_DAYS} days)`);
  console.log(`[freshness] Player count: ${meta.playerCount}`);

  if (age > MAX_STALE_DAYS) {
    console.error(`[freshness] STALE — sheet data is ${age.toFixed(1)} days old, exceeds ${MAX_STALE_DAYS} day limit.`);
    console.error(`[freshness] The "PGA Stats Master" Google Sheet needs a manual refresh.`);
    console.error(`[freshness] Falling back to direct PGA Tour API pull for this run.`);
    process.exitCode = 1;
    return;
  }

  console.log(`[freshness] OK — sheet data is fresh.`);
}

main();
