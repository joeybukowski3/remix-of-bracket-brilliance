/**
 * backfill-mlb-performance-history.mjs
 *
 * One-time (repeatable) enrichment for the MLB performance-preview feature.
 *
 * Scope: hr-prediction-history.json already stores hrCount + plateAppearances
 * per graded record, but not the full actual batting line (AB, H, TB, RBI, R,
 * BB, K) that the preview page wants to display. This script fills that gap
 * ONLY for records whose game is already finalized (result.status is "hit",
 * "miss", or "did_not_play") by re-reading the same MLB Stats API boxscore
 * endpoint the grader already uses (scripts/lib/mlb-hr-grading.mjs,
 * scripts/grade-mlb-hr-results.mjs) -- no new provider, no new endpoint.
 *
 * It does NOT touch result.status, hrCount, gradedAt, hrQualityScore, or any
 * other existing field -- this is purely additive (result.battingLine).
 * did_not_play records are left with battingLine: null (the player was never
 * in the final box score, so there is nothing to backfill).
 *
 * Idempotent: records that already carry result.battingLine are skipped
 * unless --force is passed. Boxscore fetches are cached per gameId so the
 * ~5,700 finalized records only require one fetch per unique game.
 *
 * Numerology's performance.json already stores the full stat line for every
 * record (see stats.atBats/hits/totalBases/rbi/runs/baseOnBalls/strikeOuts) --
 * this script does NOT touch it, and only prints its coverage for the report.
 *
 * Usage:
 *   node scripts/backfill-mlb-performance-history.mjs [--dry-run] [--force] [--date YYYY-MM-DD] [--limit N]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createGameSummaryLoader } from "./grade-mlb-hr-results.mjs";
import { findPlayerBattingLine } from "./lib/mlb-hr-grading.mjs";

const ROOT = process.cwd();
const HR_ARCHIVE_PATH = path.join(ROOT, "public", "data", "mlb", "hr-prediction-history.json");
const NUMEROLOGY_PATH = path.join(ROOT, "public", "data", "mlb", "numerology", "performance.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const DATE_ARG = (() => {
  const i = args.indexOf("--date");
  return i >= 0 ? args[i + 1] : null;
})();
const LIMIT_ARG = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : null;
})();

const FINALIZED_STATUSES = new Set(["hit", "miss", "did_not_play"]);

function extractBattingLine(stat) {
  return {
    atBats: stat.atBats ?? null,
    hits: stat.hits ?? null,
    totalBases: stat.totalBases ?? null,
    rbi: stat.rbi ?? null,
    runs: stat.runs ?? null,
    baseOnBalls: stat.baseOnBalls ?? null,
    strikeOuts: stat.strikeOuts ?? null,
  };
}

function selectSideBattingLines(record, gameSummary) {
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.homeTeamId)) {
    return gameSummary.homeBattingLines;
  }
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.awayTeamId)) {
    return gameSummary.awayBattingLines;
  }
  const inHome = Boolean(findPlayerBattingLine(gameSummary.homeBattingLines, record.playerId));
  const inAway = Boolean(findPlayerBattingLine(gameSummary.awayBattingLines, record.playerId));
  if (inHome && !inAway) return gameSummary.homeBattingLines;
  if (inAway && !inHome) return gameSummary.awayBattingLines;
  return null;
}

function reportNumerologyCoverage() {
  const file = JSON.parse(readFileSync(NUMEROLOGY_PATH, "utf8"));
  const records = file.records ?? [];
  const withStats = records.filter((r) => r.stats && typeof r.stats.atBats === "number").length;
  console.log(`[backfill] Numerology performance.json: ${records.length} records, ${withStats} already carry a full batting line (no backfill needed).`);
}

async function main() {
  console.log(`[backfill] Mode: ${DRY_RUN ? "dry-run" : "write"}${FORCE ? " (force re-fetch)" : ""}${DATE_ARG ? ` date=${DATE_ARG}` : ""}${LIMIT_ARG ? ` limit=${LIMIT_ARG} games` : ""}`);

  reportNumerologyCoverage();

  const archive = JSON.parse(readFileSync(HR_ARCHIVE_PATH, "utf8"));
  const records = archive.records ?? [];

  // NOTE: did_not_play records legitimately store battingLine: null (there is
  // no line to backfill), so "already processed" must be judged by presence
  // of the battingLineBackfilledAt marker key, not by battingLine truthiness
  // -- checking truthiness alone made did_not_play records look like
  // candidates on every subsequent run (null is falsy), breaking idempotency.
  const isAlreadyBackfilled = (r) => Object.prototype.hasOwnProperty.call(r.result ?? {}, "battingLineBackfilledAt");

  const coverageBefore = records.filter((r) => FINALIZED_STATUSES.has(r.result?.status) && isAlreadyBackfilled(r)).length;
  const finalizedTotal = records.filter((r) => FINALIZED_STATUSES.has(r.result?.status)).length;

  const candidates = records.filter((r) => {
    if (!FINALIZED_STATUSES.has(r.result?.status)) return false;
    if (DATE_ARG && r.date !== DATE_ARG) return false;
    if (!FORCE && isAlreadyBackfilled(r)) return false;
    return true;
  });

  const uniqueGameIds = [...new Set(candidates.map((r) => r.gameId))];
  const limitedGameIds = LIMIT_ARG ? uniqueGameIds.slice(0, LIMIT_ARG) : uniqueGameIds;
  const limitedGameIdSet = new Set(limitedGameIds);

  console.log(`[backfill] Records inspected: ${records.length} total, ${finalizedTotal} finalized, ${candidates.length} candidates missing battingLine across ${uniqueGameIds.length} unique games${LIMIT_ARG ? ` (processing first ${limitedGameIds.length} games this run)` : ""}.`);

  const loader = createGameSummaryLoader();

  let enriched = 0;
  let unchanged = 0;
  let unresolved = 0;
  let providerFailures = 0;

  for (const record of candidates) {
    if (!limitedGameIdSet.has(record.gameId)) {
      unchanged++;
      continue;
    }

    if (record.result?.status === "did_not_play") {
      record.result.battingLine = null;
      record.result.battingLineBackfilledAt = new Date().toISOString();
      enriched++;
      continue;
    }

    let gameSummary;
    try {
      gameSummary = await loader.getGameSummary(record.gameId);
    } catch (err) {
      providerFailures++;
      console.warn(`[backfill] Provider failure for gameId=${record.gameId}: ${err.message}`);
      continue;
    }

    if (gameSummary.resolutionError) {
      unresolved++;
      console.warn(`[backfill] Unresolved gameId=${record.gameId}: ${gameSummary.resolutionError}`);
      continue;
    }

    const battingLines = selectSideBattingLines(record, gameSummary);
    if (!battingLines) {
      unresolved++;
      console.warn(`[backfill] Could not determine team side for playerId=${record.playerId} gameId=${record.gameId}`);
      continue;
    }

    const line = findPlayerBattingLine(battingLines, record.playerId);
    if (!line) {
      unresolved++;
      console.warn(`[backfill] No batting line found for playerId=${record.playerId} gameId=${record.gameId} despite status=${record.result.status}`);
      continue;
    }

    record.result.battingLine = extractBattingLine(line.stat);
    record.result.battingLineBackfilledAt = new Date().toISOString();
    enriched++;
  }

  const coverageAfter = records.filter((r) => FINALIZED_STATUSES.has(r.result?.status) && Object.prototype.hasOwnProperty.call(r.result ?? {}, "battingLineBackfilledAt")).length;

  const alreadyEnrichedBeforeRun = finalizedTotal - candidates.length;
  console.log(`[backfill] Records enriched: ${enriched}`);
  console.log(`[backfill] Records unchanged: ${unchanged + alreadyEnrichedBeforeRun} (${alreadyEnrichedBeforeRun} already had battingLine before this run, ${unchanged} skipped by --limit this run)`);
  console.log(`[backfill] Unresolved records: ${unresolved}`);
  console.log(`[backfill] Provider failures: ${providerFailures}`);
  console.log(`[backfill] Field coverage (finalized records with battingLine present): before=${coverageBefore}/${finalizedTotal} (${finalizedTotal ? ((coverageBefore / finalizedTotal) * 100).toFixed(1) : "0"}%) -> after=${coverageAfter}/${finalizedTotal} (${finalizedTotal ? ((coverageAfter / finalizedTotal) * 100).toFixed(1) : "0"}%)`);

  if (DRY_RUN) {
    console.log("[backfill] Dry run -- not writing file.");
    return;
  }

  if (enriched > 0) {
    archive.lastUpdatedAt = new Date().toISOString();
    writeFileSync(HR_ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`);
    console.log(`[backfill] Wrote ${HR_ARCHIVE_PATH}`);
  } else {
    console.log("[backfill] No changes to write.");
  }
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exitCode = 1;
});
