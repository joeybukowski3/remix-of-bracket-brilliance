/**
 * check-pga-stats-freshness.mjs
 *
 * Validates that public/data/pga/player-stats-meta.json reports a source date
 * within the acceptable window. The source may be Google Sheet data or the
 * direct PGA Tour API fallback; both are safe only when the metadata is fresh.
 *
 * Exits 0 (success) if fresh, exits 1 (failure) if stale or missing — the
 * GitHub Actions workflow uses this exit code to decide whether to trigger the
 * fetch-pga-player-stats.mjs fallback.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, "public", "data", "pga", "player-stats-meta.json");
const MAX_STALE_DAYS = parseInt(process.env.PGA_STATS_MAX_STALE_DAYS || "10", 10);

function daysBetween(left, right) {
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

function main() {
  let meta;
  try {
    meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  } catch (err) {
    console.error(`[freshness] Could not read ${META_PATH}: ${err.message}`);
    console.error("[freshness] Treating as STALE — no metadata means we cannot trust the model input.");
    process.exitCode = 1;
    return;
  }

  const source = meta.source ?? "unknown";
  const exportDateValue = meta.exportDate ?? meta.fetchedAt ?? meta.syncedAt;
  if (!exportDateValue) {
    console.error(`[freshness] No exportDate/fetchedAt/syncedAt found in metadata. Source=${source}. Treating as STALE.`);
    process.exitCode = 1;
    return;
  }

  const exportDate = new Date(exportDateValue);
  if (Number.isNaN(exportDate.getTime())) {
    console.error(`[freshness] Source date "${exportDateValue}" is not valid. Source=${source}. Treating as STALE.`);
    process.exitCode = 1;
    return;
  }

  const age = daysBetween(new Date(), exportDate);

  console.log(`[freshness] Player stats source: ${source}`);
  console.log(`[freshness] Source date: ${exportDateValue}`);
  console.log(`[freshness] Age: ${age.toFixed(1)} days (max allowed: ${MAX_STALE_DAYS} days)`);
  console.log(`[freshness] Player count: ${meta.playerCount ?? "unknown"}`);

  if (age > MAX_STALE_DAYS) {
    console.error(`[freshness] STALE — player stats are ${age.toFixed(1)} days old, exceeding the ${MAX_STALE_DAYS} day limit.`);
    console.error("[freshness] The Monday workflow will use the direct PGA Tour API fallback before generating model rankings.");
    process.exitCode = 1;
    return;
  }

  console.log("[freshness] OK — player stats metadata is fresh.");
}

main();
