/**
 * grade-mlb-hr-results.mjs
 *
 * Grades pending HR prediction archive records against completed game
 * box scores, using the pure grading logic in scripts/lib/mlb-hr-grading.mjs.
 *
 * Data source: MLB Stats API schedule + boxscore endpoints -- the same
 * already-approved endpoints used by generate-mlb-hr-props.mjs
 * (fetchBoxscore) and grade-polymarket-results.mjs. No new provider.
 *
 * CLI modes:
 *   node scripts/grade-mlb-hr-results.mjs                    # grade all pending records
 *   node scripts/grade-mlb-hr-results.mjs --date 2026-06-30  # grade only records for one date
 *   node scripts/grade-mlb-hr-results.mjs --all-pending      # explicit alias for the default behavior
 *   node scripts/grade-mlb-hr-results.mjs --dry-run          # compute grades but do not write
 *   node scripts/grade-mlb-hr-results.mjs --validate-only    # check archive schema, make no provider calls, no writes
 *
 * Always exits 0 on recoverable errors (network hiccups, missing games) so
 * a single bad lookup never blocks the rest of the grading run -- matching
 * the resilience pattern in grade-polymarket-results.mjs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { classifyGameState, gradePrediction, isGradeable } from "./lib/mlb-hr-grading.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const ARCHIVE_PATH = path.join(DATA_DIR, "hr-prediction-history.json");
const TIMEOUT_MS = 12000;

const args = process.argv.slice(2);
const DATE_ARG = (() => {
  const i = args.indexOf("--date");
  return i >= 0 ? args[i + 1] : null;
})();
const DRY_RUN = args.includes("--dry-run");
const VALIDATE_ONLY = args.includes("--validate-only");
// --all-pending is the default behavior; accepted as an explicit no-op flag
// for callers (e.g. workflow YAML) that want to be unambiguous.

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the game status + relevant team boxscore for a single gameId, caching by gameId across the run. */
async function buildGameSummaryCache() {
  const cache = new Map();
  return async function getGameSummary(gameId, playerTeam) {
    if (cache.has(gameId)) return cache.get(gameId);
    try {
      const schedule = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gameId}&hydrate=linescore`);
      const game = schedule?.dates?.[0]?.games?.[0];
      if (!game) {
        const result = { gameState: "scheduled", boxscoreTeam: null };
        cache.set(gameId, result);
        return result;
      }
      const gameState = classifyGameState(game);
      let boxscoreTeam = null;
      if (gameState === "final") {
        const boxscore = await fetchJson(`https://statsapi.mlb.com/api/v1/game/${gameId}/boxscore`);
        const homeAbbr = game.teams?.home?.team?.abbreviation;
        const awayAbbr = game.teams?.away?.team?.abbreviation;
        boxscoreTeam = playerTeam === homeAbbr ? boxscore?.teams?.home : playerTeam === awayAbbr ? boxscore?.teams?.away : null;
      }
      const result = { gameState, boxscoreTeam };
      cache.set(gameId, result);
      return result;
    } catch (err) {
      console.warn(`[hr-grading] Game summary fetch failed for gameId=${gameId}: ${err.message}`);
      const result = { gameState: "scheduled", boxscoreTeam: null };
      cache.set(gameId, result);
      return result;
    }
  };
}

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[hr-grading] Failed to parse ${filePath}: ${err.message}.`);
    return fallback;
  }
}

function validateArchiveSchema(archive) {
  const errors = [];
  if (!archive || !Array.isArray(archive.records)) {
    errors.push("Archive is missing a records array.");
    return errors;
  }
  for (const [i, record] of archive.records.entries()) {
    if (!record.date) errors.push(`Record ${i} missing date`);
    if (!record.modelVersion) errors.push(`Record ${i} missing modelVersion`);
    if (!record.result || typeof record.result.status !== "string") errors.push(`Record ${i} missing result.status`);
  }
  return errors;
}

async function main() {
  if (!existsSync(ARCHIVE_PATH)) {
    console.warn(`[hr-grading] ${ARCHIVE_PATH} does not exist yet. Nothing to grade.`);
    return;
  }

  const archive = loadJsonSafe(ARCHIVE_PATH, null);
  if (!archive) {
    console.error("[hr-grading] Could not load archive. Aborting.");
    process.exitCode = 1;
    return;
  }

  const schemaErrors = validateArchiveSchema(archive);
  if (schemaErrors.length > 0) {
    console.error(`[hr-grading] Archive schema validation failed:\n${schemaErrors.slice(0, 10).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[hr-grading] Archive schema valid. ${archive.records.length} total records.`);

  if (VALIDATE_ONLY) {
    console.log("[hr-grading] --validate-only set. No provider calls, no grading performed.");
    return;
  }

  let candidates = archive.records.filter(isGradeable);
  if (DATE_ARG) {
    candidates = candidates.filter((r) => r.date === DATE_ARG);
  }

  if (candidates.length === 0) {
    console.log("[hr-grading] No pending records to grade.");
    return;
  }

  console.log(`[hr-grading] Grading ${candidates.length} pending record(s)${DATE_ARG ? ` for date=${DATE_ARG}` : ""}.`);

  const getGameSummary = await buildGameSummaryCache();
  let gradedCount = 0;
  let stillPendingCount = 0;
  let errorCount = 0;

  for (const record of candidates) {
    if (record.gameId == null || record.playerId == null) {
      console.warn(`[hr-grading] Skipping record with missing gameId/playerId: ${record.playerName} (${record.date})`);
      errorCount++;
      continue;
    }
    try {
      const gameSummary = await getGameSummary(record.gameId, record.team);
      const result = gradePrediction(record, gameSummary);
      record.result = result;
      if (result.status === "pending") stillPendingCount++;
      else gradedCount++;
    } catch (err) {
      console.warn(`[hr-grading] Failed to grade ${record.playerName} (gameId=${record.gameId}): ${err.message}`);
      errorCount++;
    }
  }

  console.log(`[hr-grading] graded=${gradedCount} stillPending=${stillPendingCount} errors=${errorCount}`);

  if (DRY_RUN) {
    console.log("[hr-grading] --dry-run set, not writing.");
    return;
  }

  if (gradedCount === 0) {
    console.log("[hr-grading] No records changed status. Skipping write.");
    return;
  }

  archive.lastUpdatedAt = new Date().toISOString();
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  console.log(`[hr-grading] Wrote ${ARCHIVE_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Always exit 0 on unexpected errors per the resilience pattern used by
    // grade-polymarket-results.mjs -- grading failures should never block
    // the rest of the pipeline.
    console.error(`[hr-grading] Fatal (non-blocking): ${err instanceof Error ? err.message : err}`);
    process.exitCode = 0;
  });
}

export { main as gradeMain, validateArchiveSchema };
