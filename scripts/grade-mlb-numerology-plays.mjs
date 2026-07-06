import path from "node:path";
import process from "node:process";
import {
  applyStatLineToRecord,
  extractBattingStatLine,
  getYesterdayEt,
  loadJsonSafe,
  summarizePerformance,
  writeJson,
} from "./lib/mlb-numerology-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb", "numerology");
const PERFORMANCE_PATH = path.join(DATA_DIR, "performance.json");
const PERFORMANCE_SUMMARY_PATH = path.join(DATA_DIR, "performance-summary.json");

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, */*",
  Referer: "https://www.mlb.com/",
};

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const requestedDate = getArgValue("--date") || getYesterdayEt();
const force = process.argv.includes("--force");

async function fetchJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.json();
}

async function fetchGameLive(gameId) {
  return fetchJson(`https://statsapi.mlb.com/api/v1.1/game/${gameId}/feed/live`);
}

async function fetchBoxscore(gameId) {
  return fetchJson(`https://statsapi.mlb.com/api/v1/game/${gameId}/boxscore`);
}

function isFinalStatus(status) {
  const code = String(status?.codedGameState ?? "").toUpperCase();
  const detailed = String(status?.detailedState ?? "").toLowerCase();
  return code === "F" || detailed === "final" || detailed.includes("game over");
}

function isPostponedStatus(status) {
  const detailed = String(status?.detailedState ?? "").toLowerCase();
  const code = String(status?.codedGameState ?? "").toUpperCase();
  return code === "D" || detailed.includes("postponed") || detailed.includes("suspended");
}

function findPlayerEntry(boxscore, playerId) {
  const key = `ID${playerId}`;
  const home = boxscore?.teams?.home?.players?.[key];
  const away = boxscore?.teams?.away?.players?.[key];
  return home ?? away ?? null;
}

async function gradeRecord(record) {
  if (!record.gameId) {
    return {
      ...record,
      resultStatus: "missing-data",
      hitHomeRun: null,
      stats: null,
      finalizedAt: null,
      source: "missing-game-id",
    };
  }

  let live;
  try {
    live = await fetchGameLive(record.gameId);
  } catch (error) {
    console.warn(`[mlb-numerology] Failed to fetch live feed for ${record.gameId}: ${error.message}`);
    return { ...record, resultStatus: "missing-data", source: "mlb-statsapi-live-error" };
  }

  const status = live?.gameData?.status;
  if (isPostponedStatus(status)) {
    return { ...record, resultStatus: "postponed", hitHomeRun: null, stats: null, finalizedAt: null, source: "mlb-statsapi" };
  }
  if (!isFinalStatus(status)) {
    return { ...record, resultStatus: "pending", source: "mlb-statsapi" };
  }

  let boxscore;
  try {
    boxscore = await fetchBoxscore(record.gameId);
  } catch (error) {
    console.warn(`[mlb-numerology] Failed to fetch boxscore for ${record.gameId}: ${error.message}`);
    return { ...record, resultStatus: "missing-data", source: "mlb-statsapi-boxscore-error" };
  }

  const playerEntry = findPlayerEntry(boxscore, record.playerId);
  const statLine = extractBattingStatLine(playerEntry);
  return applyStatLineToRecord(record, statLine, { status: "final", source: "mlb-statsapi" });
}

async function main() {
  const performance = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const records = Array.isArray(performance.records) ? performance.records : [];
  const updated = [];

  for (const record of records) {
    if (record.date !== requestedDate) {
      updated.push(record);
      continue;
    }
    if (!force && record.resultStatus === "final") {
      updated.push(record);
      continue;
    }
    updated.push(await gradeRecord(record));
  }

  const nextPerformance = {
    ...performance,
    generatedAt: new Date().toISOString(),
    records: updated,
  };
  const summary = summarizePerformance(nextPerformance, requestedDate);
  writeJson(PERFORMANCE_PATH, nextPerformance);
  writeJson(PERFORMANCE_SUMMARY_PATH, summary);

  const dateRecords = updated.filter((record) => record.date === requestedDate);
  const finalized = dateRecords.filter((record) => record.resultStatus === "final").length;
  const pending = dateRecords.filter((record) => record.resultStatus === "pending").length;
  console.log(`[mlb-numerology] Graded ${dateRecords.length} records for ${requestedDate}: ${finalized} final, ${pending} pending.`);
}

main().catch((error) => {
  console.error(`[mlb-numerology] ${error.stack || error.message}`);
  process.exitCode = 1;
});
