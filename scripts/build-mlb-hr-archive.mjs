/**
 * build-mlb-hr-archive.mjs
 *
 * Reads today's generated hr-props-raw.json and upserts a prediction record
 * for every batter into the durable append-only archive at
 * public/data/mlb/hr-prediction-history.json, using the pure helpers in
 * scripts/lib/mlb-hr-archive.mjs (buildArchiveRecord, mergeArchiveBatch).
 *
 * Stable dedup key: date|playerId|gameId|modelVersion (see buildArchiveKey).
 * Records with a missing playerId or gameId are still archived (so no
 * prediction is silently dropped), but use a low-confidence fallback key
 * documented below rather than the player's display name alone.
 *
 * Safe to run multiple times per day before games start — same-day reruns
 * update the pregame record (see upsertArchiveRecord); once a record has
 * been graded it is never overwritten by this script.
 *
 * Usage:
 *   node scripts/build-mlb-hr-archive.mjs            # normal run
 *   node scripts/build-mlb-hr-archive.mjs --dry-run   # build but do not write
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { computeHrConfidence } from "./lib/mlb-hr-confidence.mjs";
import { buildArchiveRecord, mergeArchiveBatch, buildArchiveKey } from "./lib/mlb-hr-archive.mjs";
import { MLB_HR_MODEL_VERSION } from "./lib/mlb-hr-model-version.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_INPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const ARCHIVE_PATH = path.join(DATA_DIR, "hr-prediction-history.json");
const DRY_RUN = process.argv.includes("--dry-run");

// A repository-size safety cap. The archive grows by ~200-300 records/day;
// this is generously above a full season's worth (~180 days * 300 = 54,000)
// to avoid surprising truncation, while still catching a true runaway bug.
const MAX_ARCHIVE_RECORDS = 200_000;

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[hr-archive] Failed to parse ${filePath}: ${err.message}. Using fallback.`);
    return fallback;
  }
}

async function main() {
  if (!existsSync(RAW_INPUT_PATH)) {
    console.warn(`[hr-archive] ${RAW_INPUT_PATH} does not exist yet. Nothing to archive.`);
    return;
  }

  const raw = loadJsonSafe(RAW_INPUT_PATH, null);
  if (!raw || !Array.isArray(raw.batters) || raw.batters.length === 0) {
    console.warn("[hr-archive] hr-props-raw.json has no batters. Nothing to archive.");
    return;
  }

  const modelVersion = raw.modelVersion || MLB_HR_MODEL_VERSION;
  const date = raw.date;
  const generatedAt = raw.generatedAt;

  let missingIdCount = 0;
  const newRecords = raw.batters.map((player) => {
    if (player.playerId == null || player.gameId == null) missingIdCount++;
    const confidence = computeHrConfidence({
      lineupConfirmed: player.lineupStatus === "confirmed",
      starterConfirmed: player.starterConfirmed === true,
      hrOddsAvailable: player.hrOddsYes != null,
      weatherAvailable: player.weatherBoost !== 0 && player.weatherBoost != null,
      parkFactorAvailable: player.parkFactor != null,
      batterSampleSize: player.atBats ?? 0,
      opposingPitcherDataPresent: player.opposingPitcherHrVs != null,
      requiredInputsPresent: [player.barrelRate, player.hardHitRate, player.xba, player.whiffRate, player.last7HR, player.last30HR].every((v) => v != null),
    });
    const candidate = {
      candidateHrQualityScore: player.candidateHrQualityScore ?? null,
      candidateRank: player.candidateRank ?? null,
      candidateModelVersion: player.candidateModelVersion ?? null,
    };
    return buildArchiveRecord({ player, date, generatedAt, modelVersion, confidence, candidate });
  });

  if (missingIdCount > 0) {
    console.warn(`[hr-archive] ${missingIdCount}/${newRecords.length} records have a missing playerId or gameId. These are still archived (see buildArchiveKey) but cannot be deduplicated as reliably across reruns -- review the upstream lineup/schedule fetch if this count is unexpectedly high.`);
  }

  const existingArchive = loadJsonSafe(ARCHIVE_PATH, { records: [] });
  const existingRecords = Array.isArray(existingArchive.records) ? existingArchive.records : [];

  const { records, appended, updated, skippedGraded } = mergeArchiveBatch(existingRecords, newRecords);

  if (records.length > MAX_ARCHIVE_RECORDS) {
    console.error(`[hr-archive] Archive would grow to ${records.length} records, exceeding the safety cap of ${MAX_ARCHIVE_RECORDS}. Refusing to write -- investigate before raising the cap.`);
    process.exitCode = 1;
    return;
  }

  const output = {
    schemaVersion: 1,
    lastUpdatedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };

  console.log(`[hr-archive] date=${date} modelVersion=${modelVersion} appended=${appended} updated=${updated} skippedGraded=${skippedGraded} totalRecords=${records.length}`);

  if (DRY_RUN) {
    console.log("[hr-archive] --dry-run set, not writing.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[hr-archive] Wrote ${ARCHIVE_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[hr-archive] Fatal: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

export { main as buildArchiveMain };
