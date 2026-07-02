/**
 * grade-mlb-ml-results.mjs
 *
 * Grades pending Moneyline prediction archive records against completed
 * game results, using the pure grading logic in
 * scripts/lib/mlb-ml-grading.mjs. Also computes sportsbook and Polymarket
 * CLV proxies (see that module's header for the documented limitations).
 *
 * Data sources:
 *   - MLB Stats API schedule endpoint (same already-approved endpoint used
 *     by grade-mlb-hr-results.mjs) for the final score / game state.
 *   - public/data/polymarket/snapshots-{date}.json (already fetched
 *     intraday by fetch-polymarket-snapshots.mjs) for the Polymarket
 *     pregame snapshot time-series. No new provider.
 *
 * CLI modes:
 *   node scripts/grade-mlb-ml-results.mjs                    # grade all pending records
 *   node scripts/grade-mlb-ml-results.mjs --date 2026-06-30  # grade only records for one date
 *   node scripts/grade-mlb-ml-results.mjs --all-pending      # explicit alias for the default behavior
 *   node scripts/grade-mlb-ml-results.mjs --dry-run          # compute grades but do not write
 *   node scripts/grade-mlb-ml-results.mjs --validate-only    # check archive schema, make no provider calls, no writes
 *
 * Always exits 0 on recoverable errors (network hiccups, missing games) so
 * a single bad lookup never blocks the rest of the grading run -- matching
 * the resilience pattern in grade-mlb-hr-results.mjs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { classifyGameState, gradePrediction, isGradeable } from "./lib/mlb-ml-grading.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const POLYMARKET_DIR = path.join(ROOT, "public", "data", "polymarket");
const ARCHIVE_PATH = path.join(DATA_DIR, "ml-prediction-history.json");
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

/** Fetch the game status + score for a single gameId, caching by gameId across the run. */
async function buildGameSummaryCache() {
  const cache = new Map();
  return async function getGame(gameId) {
    if (cache.has(gameId)) return cache.get(gameId);
    try {
      const schedule = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gameId}&hydrate=linescore`);
      const game = schedule?.dates?.[0]?.games?.[0] ?? null;
      cache.set(gameId, game);
      return game;
    } catch (err) {
      console.warn(`[ml-grading] Schedule fetch failed for gameId=${gameId}: ${err.message}`);
      cache.set(gameId, null);
      return null;
    }
  };
}

/** Load (and cache) a day's Polymarket snapshot file, mapping by "AWY@HME" gameKey. */
function buildPolymarketSnapshotCache() {
  const cache = new Map();
  return function getPmGame(date, gameKey) {
    if (!cache.has(date)) {
      const filePath = path.join(POLYMARKET_DIR, `snapshots-${date}.json`);
      cache.set(date, loadJsonSafe(filePath, null));
    }
    const snapshot = cache.get(date);
    if (!snapshot || !Array.isArray(snapshot.games)) return null;
    const [awayAbbr, homeAbbr] = String(gameKey ?? "").split("@");
    return snapshot.games.find((g) => g.awayAbbr === awayAbbr && g.homeAbbr === homeAbbr) ?? null;
  };
}

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[ml-grading] Failed to parse ${filePath}: ${err.message}.`);
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
    console.warn(`[ml-grading] ${ARCHIVE_PATH} does not exist yet. Nothing to grade.`);
    return;
  }

  const archive = loadJsonSafe(ARCHIVE_PATH, null);
  if (!archive) {
    console.error("[ml-grading] Could not load archive. Aborting.");
    process.exitCode = 1;
    return;
  }

  const schemaErrors = validateArchiveSchema(archive);
  if (schemaErrors.length > 0) {
    console.error(`[ml-grading] Archive schema validation failed:\n${schemaErrors.slice(0, 10).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ml-grading] Archive schema valid. ${archive.records.length} total records.`);

  if (VALIDATE_ONLY) {
    console.log("[ml-grading] --validate-only set. No provider calls, no grading performed.");
    return;
  }

  let candidates = archive.records.filter(isGradeable);
  if (DATE_ARG) {
    candidates = candidates.filter((r) => r.date === DATE_ARG);
  }

  if (candidates.length === 0) {
    console.log("[ml-grading] No pending records to grade.");
    return;
  }

  console.log(`[ml-grading] Grading ${candidates.length} pending record(s)${DATE_ARG ? ` for date=${DATE_ARG}` : ""}.`);

  const getGame = await buildGameSummaryCache();
  const getPmGame = buildPolymarketSnapshotCache();
  let gradedCount = 0;
  let stillPendingCount = 0;
  let errorCount = 0;

  for (const record of candidates) {
    if (record.gameId == null) {
      console.warn(`[ml-grading] Skipping record with missing gameId: ${record.gameKey} (${record.date})`);
      errorCount++;
      continue;
    }
    try {
      const game = await getGame(record.gameId);
      const gameState = classifyGameState(game);
      const pmGame = getPmGame(record.date, record.gameKey);
      const result = gradePrediction(record, { gameState, game, pmGame });
      record.result = result;
      if (result.status === "pending") stillPendingCount++;
      else gradedCount++;
    } catch (err) {
      console.warn(`[ml-grading] Failed to grade ${record.gameKey} (gameId=${record.gameId}): ${err.message}`);
      errorCount++;
    }
  }

  console.log(`[ml-grading] graded=${gradedCount} stillPending=${stillPendingCount} errors=${errorCount}`);

  if (DRY_RUN) {
    console.log("[ml-grading] --dry-run set, not writing.");
    return;
  }

  if (gradedCount === 0) {
    console.log("[ml-grading] No records changed status. Skipping write.");
    return;
  }

  archive.lastUpdatedAt = new Date().toISOString();
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  console.log(`[ml-grading] Wrote ${ARCHIVE_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Always exit 0 on unexpected errors per the resilience pattern used by
    // grade-mlb-hr-results.mjs -- grading failures should never block the
    // rest of the pipeline.
    console.error(`[ml-grading] Fatal (non-blocking): ${err instanceof Error ? err.message : err}`);
    process.exitCode = 0;
  });
}

export { main as gradeMain, validateArchiveSchema };
