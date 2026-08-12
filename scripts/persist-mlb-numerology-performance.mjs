/**
 * persist-mlb-numerology-performance.mjs
 *
 * Forward-tracking persistence for the /mlb/performance-preview Numerology
 * section, decoupled from the email-delivery pipeline entirely.
 *
 * ROOT CAUSE (see performance-preview report): the only code that ever wrote
 * new records into public/data/mlb/numerology/performance.json lived inside
 * scripts/generate-mlb-numerology-email.mjs, called from the email
 * send/rescue workflows. scripts/lib/persist-mlb-numerology-email-receipt.sh
 * (added 2026-07-14) runs `git reset --hard HEAD` + `git clean -fd` right
 * after that script writes its files, discarding every tracking update
 * before it's ever committed -- only the tiny email-send-state.json receipt
 * survives. Grading (grade-mlb-numerology-plays.mjs) only mutates records
 * that already exist; it never adds new ones. Net effect: performance.json
 * has been frozen at its 2026-07-06..07-10 snapshot since 2026-07-14, even
 * though numerology-daily.json keeps regenerating fresh boards daily.
 *
 * FIX: this script reads the just-generated (and just-filtered) live board
 * (numerology-daily.json) directly -- the actual normal generation
 * lifecycle, with no dependency on whether any email ever sends -- and
 * persists the exact Top Play / Score 50+ selections using the SAME pure
 * helpers the email pipeline already used (buildDailyNumerologyCard,
 * buildTrackingRecordsFromCard, mergePerformanceRecords), so the record
 * shape and score/matches are unchanged from before. It also writes an
 * archive/{date}.json pregame snapshot, mirroring what the deleted email
 * pipeline used to preserve, restoring the ability to backfill in the
 * future without relying on the email path.
 *
 * Idempotent: mergePerformanceRecords() keys records by
 * `${selectionType}|${date}|${playerId}|${gameId}` and only touches records
 * that don't exist yet or are still "pending"/"missing-data" -- a rerun
 * later the same day (e.g. the lineup-confirmed phase) safely refreshes
 * still-pending records in place rather than duplicating them, and never
 * overwrites an already-graded ("final") record.
 *
 * Usage: node scripts/persist-mlb-numerology-performance.mjs [--date YYYY-MM-DD] [--dry-run]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildDailyNumerologyCard,
  buildTrackingRecordsFromCard,
  mergePerformanceRecords,
  summarizePerformance,
  loadJsonSafe,
  writeJson,
  getTodayEt,
} from "./lib/mlb-numerology-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const NUMEROLOGY_DAILY_PATH = path.join(DATA_DIR, "numerology-daily.json");
const HR_RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const PERFORMANCE_PATH = path.join(DATA_DIR, "numerology", "performance.json");
const SUMMARY_PATH = path.join(DATA_DIR, "numerology", "performance-summary.json");
const ARCHIVE_DIR = path.join(DATA_DIR, "numerology", "archive");

const args = process.argv.slice(2);
const DATE_ARG = (() => {
  const i = args.indexOf("--date");
  return i >= 0 ? args[i + 1] : null;
})();
const DRY_RUN = args.includes("--dry-run");

function main() {
  if (!existsSync(NUMEROLOGY_DAILY_PATH)) {
    console.error(`[numerology-persist] ${NUMEROLOGY_DAILY_PATH} does not exist -- nothing to persist.`);
    process.exitCode = 1;
    return;
  }

  const rawPayload = JSON.parse(readFileSync(NUMEROLOGY_DAILY_PATH, "utf8"));
  const hrPayload = existsSync(HR_RAW_PATH) ? JSON.parse(readFileSync(HR_RAW_PATH, "utf8")) : null;
  const date = DATE_ARG || rawPayload.date || getTodayEt();

  const card = buildDailyNumerologyCard(rawPayload, { date, hrPayload });
  const incomingRecords = buildTrackingRecordsFromCard(card);

  console.log(`[numerology-persist] date=${date} topPlay=${card.topPlay ? 1 : 0} over50=${card.allQualifiedPlaysOver50.length} incomingRecords=${incomingRecords.length}`);

  if (incomingRecords.length === 0) {
    console.log("[numerology-persist] No qualifying selections in today's board -- nothing to persist (not an error).");
    return;
  }

  const existingPerformance = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const beforeCount = existingPerformance.records?.length ?? 0;
  const merged = mergePerformanceRecords(existingPerformance, incomingRecords);
  const afterCount = merged.records.length;
  const newRecords = afterCount - beforeCount;
  const refreshedPending = incomingRecords.length - newRecords;

  console.log(`[numerology-persist] records before=${beforeCount} after=${afterCount} (new=${newRecords}, refreshed-pending=${refreshedPending})`);

  if (DRY_RUN) {
    console.log("[numerology-persist] Dry run -- not writing files.");
    return;
  }

  writeJson(PERFORMANCE_PATH, merged);
  writeJson(SUMMARY_PATH, summarizePerformance(merged, date));
  writeJson(path.join(ARCHIVE_DIR, `${date}.json`), card);

  console.log(`[numerology-persist] Wrote ${PERFORMANCE_PATH}, ${SUMMARY_PATH}, and archive/${date}.json`);
}

main();
