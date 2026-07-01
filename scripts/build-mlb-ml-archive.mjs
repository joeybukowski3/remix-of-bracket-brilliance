/**
 * build-mlb-ml-archive.mjs
 *
 * Reads today's generated ml-picks-raw.json and upserts a prediction
 * record for every pick into the durable append-only archive at
 * public/data/mlb/ml-prediction-history.json, using the pure helpers in
 * scripts/lib/mlb-ml-archive.mjs (buildArchiveRecord, mergeArchiveBatch).
 * Mirrors build-mlb-hr-archive.mjs's structure exactly.
 *
 * Stable dedup key: date|gameId|modelVersion (see buildArchiveKey).
 *
 * Safe to run multiple times per day before games start — same-day reruns
 * update the pregame record (see upsertArchiveRecord); once a record has
 * been graded it is never overwritten by this script.
 *
 * This archive is infrastructure only and is not exposed in any public UI.
 *
 * Usage:
 *   node scripts/build-mlb-ml-archive.mjs            # normal run
 *   node scripts/build-mlb-ml-archive.mjs --dry-run   # build but do not write
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildArchiveRecord, mergeArchiveBatch } from "./lib/mlb-ml-archive.mjs";
import { MLB_ML_MODEL_VERSION } from "./lib/mlb-ml-model-version.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_INPUT_PATH = path.join(DATA_DIR, "ml-picks-raw.json");
const ARCHIVE_PATH = path.join(DATA_DIR, "ml-prediction-history.json");
const DRY_RUN = process.argv.includes("--dry-run");

// A repository-size safety cap, mirroring the HR archive's cap. The ML
// archive grows by at most ~15 records/day (one per non-push game), far
// below this threshold — it exists to catch a true runaway bug.
const MAX_ARCHIVE_RECORDS = 50_000;

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[ml-archive] Failed to parse ${filePath}: ${err.message}. Using fallback.`);
    return fallback;
  }
}

async function main() {
  if (!existsSync(RAW_INPUT_PATH)) {
    console.warn(`[ml-archive] ${RAW_INPUT_PATH} does not exist yet. Nothing to archive.`);
    return;
  }

  const raw = loadJsonSafe(RAW_INPUT_PATH, null);
  if (!raw || !Array.isArray(raw.picks) || raw.picks.length === 0) {
    console.warn("[ml-archive] ml-picks-raw.json has no picks. Nothing to archive.");
    return;
  }

  const modelVersion = raw.modelVersion || MLB_ML_MODEL_VERSION;
  const date = raw.date;
  const generatedAt = raw.generatedAt;

  const newRecords = raw.picks.map((pick) =>
    buildArchiveRecord({ pick, date, generatedAt, modelVersion }),
  );

  const existingArchive = loadJsonSafe(ARCHIVE_PATH, { records: [] });
  const existingRecords = Array.isArray(existingArchive.records) ? existingArchive.records : [];

  const { records, appended, updated, skippedGraded } = mergeArchiveBatch(existingRecords, newRecords);

  if (records.length > MAX_ARCHIVE_RECORDS) {
    console.error(`[ml-archive] Archive would grow to ${records.length} records, exceeding the safety cap of ${MAX_ARCHIVE_RECORDS}. Refusing to write -- investigate before raising the cap.`);
    process.exitCode = 1;
    return;
  }

  const output = {
    schemaVersion: 1,
    lastUpdatedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };

  console.log(`[ml-archive] date=${date} modelVersion=${modelVersion} appended=${appended} updated=${updated} skippedGraded=${skippedGraded} totalRecords=${records.length}`);

  if (DRY_RUN) {
    console.log("[ml-archive] --dry-run set, not writing.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[ml-archive] Wrote ${ARCHIVE_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[ml-archive] Fatal: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

export { main as buildArchiveMain };
