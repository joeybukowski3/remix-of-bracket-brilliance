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

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  { id: "143", outputKey: "par4ScoringAverage", fields: ["Avg", "AVG", "Average"], transform: Number },
  { id: "360", outputKey: "birdie125150", fields: ["%", "Birdie or Better %"], transform: parsePercent },
  { id: "361", outputKey: "birdieUnder125", fields: ["%", "Birdie or Better %"], transform: parsePercent },
];

const EXISTING_REQUIRED_OUTPUT_KEYS = [
  "sgTotal",
  "sgOTT",
  "sgApp",
  "sgAtG",
  "sgPutt",
  "drivingDistance",
  "drivingAccuracy",
  "bogeyAvoidance",
  "birdieBogeyRatio",
];
const NEW_REQUIRED_OUTPUT_KEYS = ["par4ScoringAverage", "birdie125150", "birdieUnder125"];

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
  const rows = json?.data?.statDetails?.rows ?? [];
  if (!Array.isArray(rows) || rows.length < 20) {
    throw new Error(`Suspiciously empty response for stat ${statId}: ${Array.isArray(rows) ? rows.length : "non-array"} rows`);
  }
  return { rows, status: res.status };
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
  const requestResults = [];

  for (const { id, outputKey, fields, transform } of STAT_MAP) {
    console.log(`[pga-player-stats] Fetching ${outputKey} (statId ${id})...`);
    let rows;
    try {
      const response = await fetchStat(id);
      rows = response.rows;
      requestResults.push({ id, outputKey, httpStatus: response.status, rowCount: rows.length });
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

  const metaPath = path.join(path.dirname(OUTPUT_PATH), "player-stats-meta.json");
  const previousRows = existsSync(OUTPUT_PATH) ? JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) : [];
  const previousMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
  const today = new Date().toISOString().split("T")[0];
  const meta = {
    exportDate: today,
    syncedAt: new Date().toISOString(),
    playerCount: result.length,
    playersWithIds: result.filter((player) => player.playerId).length,
    source: "pga-tour-api-fallback",
    provider: GRAPHQL_URL,
    requestCount: requestResults.length,
    categories: requestResults,
  };

  const validation = validateStatsRefresh({ previousRows, previousMeta, nextRows: result, nextMeta: meta });
  console.log(`[pga-player-stats] Validation passed: ${JSON.stringify(validation)}`);

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporaryDataPath = `${OUTPUT_PATH}.tmp-${process.pid}`;
  const temporaryMetaPath = `${metaPath}.tmp-${process.pid}`;
  const dataText = JSON.stringify(result, null, 2) + "\n";
  const metaText = JSON.stringify(meta, null, 2) + "\n";

  try {
    writeFileSync(temporaryDataPath, dataText, "utf8");
    writeFileSync(temporaryMetaPath, metaText, "utf8");
    const temporaryRows = JSON.parse(readFileSync(temporaryDataPath, "utf8"));
    const temporaryMeta = JSON.parse(readFileSync(temporaryMetaPath, "utf8"));
    validateStatsRefresh({ previousRows, previousMeta, nextRows: temporaryRows, nextMeta: temporaryMeta });
    writeFileSync(OUTPUT_PATH, dataText, "utf8");
    writeFileSync(metaPath, metaText, "utf8");
  } finally {
    rmSync(temporaryDataPath, { force: true });
    rmSync(temporaryMetaPath, { force: true });
  }

  console.log(`[pga-player-stats] Wrote ${result.length} validated players to ${OUTPUT_PATH}`);
  console.log(`[pga-player-stats] Wrote validated metadata to ${metaPath}`);
  console.log(`[pga-player-stats] Requests: ${JSON.stringify(requestResults)}`);

  const scheffler = result.find((player) => player.player === "Scottie Scheffler");
  if (scheffler) {
    console.log("[pga-player-stats] Spot-check Scottie Scheffler:", JSON.stringify(scheffler));
  }
}

export function validateStatsRefresh({ previousRows = [], previousMeta = null, nextRows, nextMeta }) {
  if (!Array.isArray(nextRows) || nextRows.length < 100) {
    throw new Error(`Refusing suspicious player stats output with ${Array.isArray(nextRows) ? nextRows.length : "non-array"} rows.`);
  }
  if (!nextMeta || nextMeta.playerCount !== nextRows.length || nextMeta.requestCount !== STAT_MAP.length) {
    throw new Error("Player stats metadata does not match the fetched output.");
  }
  const syncedAt = Date.parse(nextMeta.syncedAt);
  if (!Number.isFinite(syncedAt) || Math.abs(Date.now() - syncedAt) > 10 * 60 * 1000) {
    throw new Error("Player stats metadata timestamp is missing or not current.");
  }

  const normalizedNames = nextRows.map((row) => normalizePlayerName(row.player));
  if (normalizedNames.some((name) => !name) || new Set(normalizedNames).size !== nextRows.length) {
    throw new Error("Player stats output contains a missing or duplicate normalized player identity.");
  }

  const coverage = Object.fromEntries(
    [...EXISTING_REQUIRED_OUTPUT_KEYS, ...NEW_REQUIRED_OUTPUT_KEYS]
      .map((key) => [key, nextRows.filter((row) => Number.isFinite(row[key])).length]),
  );
  for (const key of NEW_REQUIRED_OUTPUT_KEYS) {
    if (coverage[key] < 75) throw new Error(`Required fetched category ${key} has suspicious coverage: ${coverage[key]}.`);
  }

  const previousCoverage = Object.fromEntries(
    EXISTING_REQUIRED_OUTPUT_KEYS.map((key) => [key, Array.isArray(previousRows) ? previousRows.filter((row) => Number.isFinite(row[key])).length : 0]),
  );
  if (Array.isArray(previousRows) && previousRows.length > 0) {
    if (nextRows.length < previousRows.length * 0.9) {
      throw new Error(`Player row count fell from ${previousRows.length} to ${nextRows.length}.`);
    }
    for (const key of EXISTING_REQUIRED_OUTPUT_KEYS) {
      if (coverage[key] < Math.floor(previousCoverage[key] * 0.95)) {
        throw new Error(`Existing category ${key} coverage fell from ${previousCoverage[key]} to ${coverage[key]}.`);
      }
    }
  }
  if (previousMeta?.source && nextMeta.source !== previousMeta.source) {
    throw new Error(`Player stats source changed from ${previousMeta.source} to ${nextMeta.source}.`);
  }

  return {
    previousRowCount: Array.isArray(previousRows) ? previousRows.length : 0,
    nextRowCount: nextRows.length,
    previousCoverage,
    coverage,
  };
}

function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[pga-player-stats] Fatal error:", err.message);
    process.exitCode = 1;
  });
}
