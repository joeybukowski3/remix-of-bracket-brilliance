/**
 * fetch-pga-player-stats.mjs
 *
 * Repo-side fallback for public/data/pga/player-stats-raw.json.
 * Pulls current PGA Tour player statistics directly from the PGA Tour site
 * GraphQL endpoint and preserves stable player IDs for history backfills.
 *
 * Usage:
 *   PGA_API_KEY=da2-xxxxx node scripts/fetch-pga-player-stats.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "public", "data", "pga", "player-stats-raw.json");
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const SEASON = parseInt(process.env.PGA_STATS_YEAR || new Date().getFullYear(), 10);
const TOUR_CODE = "R";

const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || DEFAULT_API_KEY;

const STAT_MAP = [
  { id: "02675", outputKey: "sgTotal", fields: ["Avg"], transform: Number },
  { id: "02567", outputKey: "sgOTT", fields: ["Avg"], transform: Number },
  { id: "02568", outputKey: "sgApp", fields: ["Avg"], transform: Number },
  { id: "02569", outputKey: "sgAtG", fields: ["Avg"], transform: Number },
  { id: "02564", outputKey: "sgPutt", fields: ["Avg"], transform: Number },
  { id: "101", outputKey: "drivingDistance", fields: ["AVG.", "Avg.", "Avg", "Average"], transform: Number },
  { id: "102", outputKey: "drivingAccuracy", fields: ["%"], transform: parsePercent },
  { id: "02414", outputKey: "bogeyAvoidance", fields: ["% Makes Bogey"], transform: (v) => parsePercent(v) / 100 },
  { id: "02415", outputKey: "birdieBogeyRatio", fields: ["Birdie to Bogey Ratio"], transform: Number },
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
          playerId
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
      "x-pgat-platform": "web",
      Referer: "https://www.pgatour.com/",
      Origin: "https://www.pgatour.com",
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
  return json?.data?.statDetails?.rows ?? [];
}

function statValueFor(row, fieldNames) {
  for (const fieldName of fieldNames) {
    const stat = row.stats?.find((entry) => entry.statName === fieldName);
    if (stat?.statValue != null) return stat.statValue;
  }

  if (row.stats?.length === 1) return row.stats[0]?.statValue ?? null;
  return null;
}

async function main() {
  console.log(`[pga-player-stats] Fetching ${STAT_MAP.length} stat categories for season ${SEASON}...`);
  console.log(`[pga-player-stats] Using API key: ${API_KEY.slice(0, 10)}...`);

  const playerData = new Map();

  for (const { id, outputKey, fields, transform } of STAT_MAP) {
    console.log(`[pga-player-stats] Fetching ${outputKey} (statId ${id})...`);
    let rows;
    try {
      rows = await fetchStat(id);
    } catch (err) {
      console.error(`[pga-player-stats] FAILED to fetch ${outputKey}: ${err.message}`);
      console.error("[pga-player-stats] This usually means the PGA Tour API key has rotated.");
      process.exitCode = 1;
      return;
    }

    for (const row of rows) {
      const name = row.playerName;
      if (!name) continue;
      if (!playerData.has(name)) {
        playerData.set(name, {
          player: name,
          playerId: row.playerId ? String(row.playerId) : null,
          trendRank: null,
        });
      }

      const player = playerData.get(name);
      if (!player.playerId && row.playerId) player.playerId = String(row.playerId);

      const raw = statValueFor(row, fields);
      const value = raw != null ? transform(raw) : null;
      player[outputKey] = Number.isFinite(value) ? value : null;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const result = Array.from(playerData.values())
    .filter((player) => player.sgTotal != null)
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
    playersWithIds: result.filter((player) => player.playerId).length,
    source: "pga-tour-api-fallback",
  }, null, 2) + "\n");
  console.log(`[pga-player-stats] Wrote metadata to ${metaPath}`);

  const scheffler = result.find((player) => player.player === "Scottie Scheffler");
  if (scheffler) {
    console.log("[pga-player-stats] Spot-check Scottie Scheffler:", JSON.stringify(scheffler));
  }
}

main().catch((err) => {
  console.error("[pga-player-stats] Fatal error:", err.message);
  process.exitCode = 1;
});
