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
 *   node scripts/grade-mlb-hr-results.mjs --regrade-unresolved # retry legacy unresolved records into a temp candidate
 *   MLB_HR_REGRADE_ALLOW_TRACKED_WRITE=true node scripts/grade-mlb-hr-results.mjs --regrade-unresolved --apply-regrade
 *
 * Always exits 0 on recoverable errors (network hiccups, missing games) so
 * a single bad lookup never blocks the rest of the grading run -- matching
 * the resilience pattern in grade-polymarket-results.mjs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildArchiveKey } from "./lib/mlb-hr-archive.mjs";
import { buildCompleteGameSummary, findPlayerBattingLine, gradePrediction, isGradeable } from "./lib/mlb-hr-grading.mjs";
import { assessPredictionTiming } from "./lib/mlb-hr-tracking-integrity.mjs";

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
const REGRADE_UNRESOLVED = args.includes("--regrade-unresolved");
const APPLY_REGRADE = args.includes("--apply-regrade");
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

/** Fetch a complete home+away game summary once per gameId. */
export function createGameSummaryLoader({ fetchJsonImpl = fetchJson } = {}) {
  const cache = new Map();
  async function getGameSummary(gameId) {
    if (cache.has(gameId)) return cache.get(gameId);
    const request = (async () => {
      try {
        const schedule = await fetchJsonImpl(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gameId}&hydrate=team,linescore`);
        const game = schedule?.dates?.[0]?.games?.[0];
        if (!game) {
          return { gameId, gameState: "unresolved_retryable", resolutionError: "schedule_game_not_found" };
        }
        let boxscore = null;
        if (game?.status?.abstractGameState === "Final") {
          boxscore = await fetchJsonImpl(`https://statsapi.mlb.com/api/v1/game/${gameId}/boxscore`);
        }
        return buildCompleteGameSummary(game, boxscore);
      } catch (err) {
        console.warn(`[hr-grading] Game summary fetch failed for gameId=${gameId}: ${err.message}`);
        return { gameId, gameState: "unresolved_retryable", resolutionError: `game_summary_fetch_failed:${err.message}` };
      }
    })();
    cache.set(gameId, request);
    return request;
  }
  return { getGameSummary, cache };
}

function statusCounts(records) {
  const counts = {};
  for (const record of records) {
    const status = record.result?.status ?? "missing";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function enrichRecordIdentity(record, gameSummary) {
  record.officialGameDate = gameSummary.officialGameDate ?? record.officialGameDate ?? record.date;
  record.gameStartTime = gameSummary.gameStartTime ?? record.gameStartTime ?? null;
  record.gameNumber = gameSummary.gameNumber ?? record.gameNumber ?? null;
  record.doubleHeader = gameSummary.doubleHeader ?? record.doubleHeader ?? null;
  record.timing = assessPredictionTiming(record.generatedAt, record.gameStartTime);

  if (record.teamId == null) {
    const inHome = Boolean(findPlayerBattingLine(gameSummary.homeBattingLines, record.playerId));
    const inAway = Boolean(findPlayerBattingLine(gameSummary.awayBattingLines, record.playerId));
    if (inHome !== inAway) {
      record.teamId = inHome ? gameSummary.homeTeamId : gameSummary.awayTeamId;
      record.opponentId = inHome ? gameSummary.awayTeamId : gameSummary.homeTeamId;
    }
  }
}

function isRetryableStatus(status) {
  return status === "pending"
    || status === "suspended"
    || status === "unresolved"
    || status === "unresolved_retryable";
}

function modelSnapshot(record) {
  return JSON.stringify({
    hrQualityScore: record.hrQualityScore ?? null,
    hrRank: record.hrRank ?? null,
    candidateHrQualityScore: record.candidateHrQualityScore ?? null,
    candidateRank: record.candidateRank ?? null,
    candidateModelVersion: record.candidateModelVersion ?? null,
    phase2Shadow: record.phase2Shadow ?? null,
  });
}

export function validateRegradedArchive(records, { beforeRecords = null } = {}) {
  const errors = [];
  const keys = records.map(buildArchiveKey);
  if (new Set(keys).size !== keys.length) errors.push("duplicate_archive_keys");
  if (records.some((record) => record.playerId == null || record.gameId == null)) errors.push("missing_player_or_game_id");

  const dateMismatches = records.filter(
    (record) => record.officialGameDate && record.date && record.officialGameDate !== record.date,
  ).length;
  if (dateMismatches > 0) errors.push(`official_date_mismatch:${dateMismatches}`);

  const binary = records.filter((record) => record.result?.status === "hit" || record.result?.status === "miss");
  const hits = binary.filter((record) => record.result.status === "hit").length;
  const hitRate = binary.length ? hits / binary.length : null;
  if (binary.length >= 100 && (hitRate < 0.005 || hitRate > 0.2)) {
    errors.push(`suspicious_hit_rate:${hitRate}`);
  }

  const providerFailureCount = records.filter((record) => (
    record.result?.status === "unresolved_retryable"
    && /^(game_summary_fetch_failed|schedule_game_not_found|final_boxscore_missing)/.test(record.result?.resolutionReason ?? "")
  )).length;
  if (providerFailureCount > 0) errors.push(`provider_resolution_failures:${providerFailureCount}`);

  const performanceTerminal = records.filter((record) => (
    record.result?.status === "hit"
    || record.result?.status === "miss"
    || record.result?.status === "did_not_play"
  ));
  const teamIdentityErrorCount = performanceTerminal.filter((record) => (
    record.teamId == null
    || record.opponentId == null
    || Number(record.teamId) === Number(record.opponentId)
  )).length;
  if (teamIdentityErrorCount > 0) errors.push(`terminal_team_identity_errors:${teamIdentityErrorCount}`);

  let beforeStatusCounts = null;
  let beforeRetryableCount = null;
  let afterRetryableCount = records.filter((record) => isRetryableStatus(record.result?.status)).length;
  let resolvedRetryableCount = null;
  let modelMutationCount = 0;
  if (Array.isArray(beforeRecords)) {
    beforeStatusCounts = statusCounts(beforeRecords);
    beforeRetryableCount = beforeRecords.filter((record) => isRetryableStatus(record.result?.status)).length;
    resolvedRetryableCount = beforeRetryableCount - afterRetryableCount;
    if (records.length !== beforeRecords.length) errors.push("record_count_changed");

    const beforeByKey = new Map(beforeRecords.map((record) => [buildArchiveKey(record), modelSnapshot(record)]));
    modelMutationCount = records.filter((record) => beforeByKey.get(buildArchiveKey(record)) !== modelSnapshot(record)).length;
    if (modelMutationCount > 0) errors.push(`model_score_mutations:${modelMutationCount}`);

    if (beforeRetryableCount >= 100) {
      const terminalCoverage = resolvedRetryableCount / beforeRetryableCount;
      if (terminalCoverage < 0.5) errors.push(`insufficient_terminal_coverage:${terminalCoverage}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    recordCount: records.length,
    beforeStatusCounts,
    statusCounts: statusCounts(records),
    beforeRetryableCount,
    afterRetryableCount,
    resolvedRetryableCount,
    binaryCount: binary.length,
    hitCount: hits,
    hitRate,
    dateMismatchCount: dateMismatches,
    providerFailureCount,
    teamIdentityErrorCount,
    modelMutationCount,
    validationThresholds: {
      hitRateMin: 0.005,
      hitRateMax: 0.2,
      minimumTerminalCoverage: 0.5,
    },
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

  if (APPLY_REGRADE && !REGRADE_UNRESOLVED) {
    throw new Error("--apply-regrade requires --regrade-unresolved.");
  }
  if (APPLY_REGRADE && process.env.MLB_HR_REGRADE_ALLOW_TRACKED_WRITE !== "true") {
    throw new Error("--apply-regrade requires MLB_HR_REGRADE_ALLOW_TRACKED_WRITE=true.");
  }

  let candidates = archive.records.filter((record) => isGradeable(record, { regradeUnresolved: REGRADE_UNRESOLVED }));
  if (DATE_ARG) {
    candidates = candidates.filter((r) => r.date === DATE_ARG);
  }

  if (candidates.length === 0) {
    console.log("[hr-grading] No retryable records to grade.");
    return;
  }

  const uniqueGameCount = new Set(candidates.map((record) => record.gameId).filter((value) => value != null)).size;
  console.log(`[hr-grading] Grading ${candidates.length} retryable record(s) across ${uniqueGameCount} unique game(s)${DATE_ARG ? ` for date=${DATE_ARG}` : ""}.`);

  let regradeBackupPath = null;
  let regradeOutputPath = null;
  const recordsBeforeRegrade = REGRADE_UNRESOLVED
    ? structuredClone(archive.records)
    : null;
  if (REGRADE_UNRESOLVED) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    regradeBackupPath = path.join(os.tmpdir(), `mlb-hr-prediction-history-${stamp}.backup.json`);
    regradeOutputPath = path.join(os.tmpdir(), `mlb-hr-prediction-history-${stamp}.regraded.json`);
    writeFileSync(regradeBackupPath, readFileSync(ARCHIVE_PATH));
    console.log(`[hr-grading] Historical regrade backup written: ${regradeBackupPath}`);
  }

  const { getGameSummary } = createGameSummaryLoader();
  let gradedCount = 0;
  let stillPendingCount = 0;
  let errorCount = 0;
  let changedCount = 0;

  for (const record of candidates) {
    if (record.gameId == null || record.playerId == null) {
      console.warn(`[hr-grading] Skipping record with missing gameId/playerId: ${record.playerName} (${record.date})`);
      errorCount++;
      continue;
    }
    try {
      const previousResult = JSON.stringify(record.result);
      const gameSummary = await getGameSummary(record.gameId);
      enrichRecordIdentity(record, gameSummary);
      const result = gradePrediction(record, gameSummary);
      record.result = result;
      if (JSON.stringify(result) !== previousResult) changedCount++;
      if (result.status === "pending") stillPendingCount++;
      else gradedCount++;
    } catch (err) {
      console.warn(`[hr-grading] Failed to grade ${record.playerName} (gameId=${record.gameId}): ${err.message}`);
      errorCount++;
    }
  }

  console.log(`[hr-grading] changed=${changedCount} graded=${gradedCount} stillPending=${stillPendingCount} errors=${errorCount}`);

  if (DRY_RUN) {
    console.log("[hr-grading] --dry-run set, not writing.");
    return;
  }

  if (changedCount === 0) {
    console.log("[hr-grading] No records changed status. Skipping write.");
    return;
  }

  archive.lastUpdatedAt = new Date().toISOString();
  const serialized = `${JSON.stringify(archive, null, 2)}\n`;

  if (REGRADE_UNRESOLVED) {
    const validation = validateRegradedArchive(archive.records, { beforeRecords: recordsBeforeRegrade });
    writeFileSync(regradeOutputPath, serialized, "utf8");
    console.log(`[hr-grading] Historical regrade candidate written: ${regradeOutputPath}`);
    console.log(`[hr-grading] Historical regrade validation: ${JSON.stringify(validation)}`);
    if (!validation.valid) {
      throw new Error(`Historical regrade validation failed; tracked archive preserved. ${validation.errors.join(", ")}`);
    }
    if (!APPLY_REGRADE) {
      console.log("[hr-grading] Historical regrade candidate validated; tracked archive preserved because --apply-regrade was not provided.");
      return;
    }
  }

  writeFileSync(ARCHIVE_PATH, serialized, "utf8");
  console.log(`[hr-grading] Wrote ${ARCHIVE_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : err;
    if (REGRADE_UNRESOLVED) {
      console.error(`[hr-grading] Historical regrade aborted: ${message}`);
      process.exitCode = 1;
      return;
    }
    // Ordinary scheduled grading remains non-blocking on an isolated provider
    // failure so one unavailable game cannot block the rest of the data job.
    console.error(`[hr-grading] Fatal (non-blocking): ${message}`);
    process.exitCode = 0;
  });
}

export { main as gradeMain, validateArchiveSchema };
