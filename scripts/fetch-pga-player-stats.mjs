/**
 * fetch-pga-player-stats.mjs
 *
 * REPO-SIDE FALLBACK for player-stats-raw.json.
 *
 * The primary source of truth is the "PGA Stats Master" Google Sheet,
 * synced via scripts/sync-pga-sheet.mjs. That sheet depends on a manual
 * Apps Script run that has historically gone stale for weeks at a time
 * (last confirmed good run: 2026-04-14).
 *
 * This script pulls the same 9 stat categories directly from PGA Tour's
 * public GraphQL API (orchestrator.pgatour.com) using the AppSync API key
 * documented in the sheet's "StatID-PGATOUR" tab. It requires NO Google
 * Sheets access and can run entirely standalone as a safety net.
 *
 * Usage:
 *   PGA_API_KEY=da2-xxxxx node scripts/fetch-pga-player-stats.mjs
 *
 * If PGA_API_KEY is not set, falls back to the key documented in the
 * sheet as of 2026-06-18 (rotates periodically — see README note below).
 *
 * Output: public/data/pga/player-stats-raw.json (same schema as today)
 *
 * To get a fresh key if this one stops working:
 *   1. Open https://www.pgatour.com/stats/stat.02675.html in a browser
 *   2. Open DevTools > Network tab, reload the page
 *   3. Find a request to orchestrator.pgatour.com/graphql
 *   4. Copy the "x-api-key" header value
 *   5. Update DEFAULT_API_KEY below or pass PGA_API_KEY env var
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "public", "data", "pga", "player-stats-raw.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const SEASON = parseInt(process.env.PGA_STATS_YEAR || new Date().getFullYear(), 10);
const TOUR_CODE = "R"; // R = PGA Tour regular tour code

// Last known-good key as of 2026-06-18. Rotate via PGA_API_KEY env var if this fails.
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || DEFAULT_API_KEY;

// statId -> { outputKey, extractField, transform }
// extractField matches the "statName" returned by the API for that statId.
const STAT_MAP = [
  { id: "02675", outputKey: "sgTotal", field: "Avg", transform: Number },
  { id: "02567", outputKey: "sgOTT", field: "Avg", transform: Number },
  { id: "02568", outputKey: "sgApp", field: "Avg", transform: Number },
  { id: "02569", outputKey: "sgAtG", field: "Avg", transform: Number },
  { id: "02564", outputKey: "sgPutt", field: "Avg", transform: Number },
  { id: "102", outputKey: "drivingAccuracy", field: "%", transform: parsePercent },
  { id: "02414", outputKey: "bogeyAvoidance", field: "% Makes Bogey", transform: (v) => parsePercent(v) / 100 },
  { id: "02415", outputKey: "birdieBogeyRatio", field: "Birdie to Bogey Ratio", transform: Number },
];

function parsePercent(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

const QUERY = `
  query StatDetails($tourCode: TourCode!, $statId: String!, $year: Int!) {
    statDetails(tourCode: $tourCode, statId: $statId, year: $year) {
      rows {
        ... on StatDetailsPlayer {
          playerName
          stats { statName statValue }
        }
      }
    }
  }
`;

async function fetchStat(statId) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { tourCode: TOUR_CODE, statId, year: SEASON },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for stat ${statId}`);
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error for stat ${statId}: ${JSON.stringify(json.errors).slice(0, 200)}`);
  }
  const rows = json?.data?.statDetails?.rows ?? [];
  return rows;
}

function statValueFor(row, fieldName) {
  const stat = row.stats?.find((s) => s.statName === fieldName);
  return stat?.statValue ?? null;
}

async function main() {
  console.log(`[pga-player-stats] Fetching ${STAT_MAP.length} stat categories for season ${SEASON}...`);
  console.log(`[pga-player-stats] Using API key: ${API_KEY.slice(0, 10)}...`);

  const playerData = new Map(); // playerName -> { sgTotal, sgOTT, ... }

  for (const { id, outputKey, field, transform } of STAT_MAP) {
    console.log(`[pga-player-stats] Fetching ${outputKey} (statId ${id})...`);
    let rows;
    try {
      rows = await fetchStat(id);
    } catch (err) {
      console.error(`[pga-player-stats] FAILED to fetch ${outputKey}: ${err.message}`);
      console.error(`[pga-player-stats] This usually means the API key has rotated.`);
      console.error(`[pga-player-stats] See the usage comment at the top of this script for how to get a fresh key.`);
      process.exitCode = 1;
      return;
    }
    for (const row of rows) {
      const name = row.playerName;
      if (!name) continue;
      if (!playerData.has(name)) playerData.set(name, { player: name, trendRank: null });
      const raw = statValueFor(row, field);
      const value = raw != null ? transform(raw) : null;
      playerData.get(name)[outputKey] = value;
    }
    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 150));
  }

  const result = Array.from(playerData.values())
    .filter((p) => p.sgTotal != null) // only keep players with real SG data
    .sort((a, b) => a.player.localeCompare(b.player));

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + "\n");
  console.log(`[pga-player-stats] Wrote ${result.length} players to ${OUTPUT_PATH}`);

  const metaPath = path.join(path.dirname(OUTPUT_PATH), "player-stats-meta.json");
  const today = new Date().toISOString().split("T")[0];
  writeFileSync(metaPath, JSON.stringify({
    exportDate: today,
    syncedAt: new Date().toISOString(),
    playerCount: result.length,
    source: "pga-tour-api-fallback",
  }, null, 2) + "\n");
  console.log(`[pga-player-stats] Wrote metadata to ${metaPath}`);

  // Spot-check
  const scheffler = result.find((p) => p.player === "Scottie Scheffler");
  if (scheffler) {
    console.log(`[pga-player-stats] Spot-check Scottie Scheffler:`, JSON.stringify(scheffler));
  }
}

main().catch((err) => {
  console.error("[pga-player-stats] Fatal error:", err.message);
  process.exitCode = 1;
});
