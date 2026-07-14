/**
 * build-mlb-hr-performance-summary.mjs
 *
 * Reads the graded prediction archive and writes a compact empirical
 * performance summary to public/data/mlb/hr-model-performance.json using
 * the pure helper in scripts/lib/mlb-hr-performance-summary.mjs.
 *
 * IMPORTANT: this summary reports empirical historical outcome rates. It
 * does NOT claim HR Quality Score is a calibrated probability -- see the
 * "note" field always included in the output.
 *
 * Usage:
 *   node scripts/build-mlb-hr-performance-summary.mjs
 *   node scripts/build-mlb-hr-performance-summary.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildPerformanceSummary } from "./lib/mlb-hr-performance-summary.mjs";
import { assessCalibrationReadiness } from "./lib/mlb-hr-calibration-scaffold.mjs";
import { normalizeArchiveRecord } from "./lib/mlb-hr-tracking-integrity.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const ARCHIVE_PATH = path.join(DATA_DIR, "hr-prediction-history.json");
const SUMMARY_PATH = path.join(DATA_DIR, "hr-model-performance.json");
const DRY_RUN = process.argv.includes("--dry-run");

// Minimum sample size before reporting band-level statistics at all, to
// avoid a single-prediction band looking like a meaningful rate.
const MIN_SAMPLE_SIZE_WARNING = 20;

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[hr-performance] Failed to parse ${filePath}: ${err.message}.`);
    return fallback;
  }
}

async function main() {
  if (!existsSync(ARCHIVE_PATH)) {
    console.warn(`[hr-performance] ${ARCHIVE_PATH} does not exist yet. Nothing to summarize.`);
    return;
  }

  const archive = loadJsonSafe(ARCHIVE_PATH, null);
  if (!archive || !Array.isArray(archive.records)) {
    console.error("[hr-performance] Archive is missing or malformed. Aborting.");
    process.exitCode = 1;
    return;
  }

  const normalizedRecords = archive.records.map(normalizeArchiveRecord);
  const summary = buildPerformanceSummary(normalizedRecords);
  const calibration = assessCalibrationReadiness(normalizedRecords);

  const eligibleTotal = summary.totalGradedRecords;
  const sampleWarning = eligibleTotal < MIN_SAMPLE_SIZE_WARNING
    ? `Sample size (${eligibleTotal} graded predictions) is below the ${MIN_SAMPLE_SIZE_WARNING}-record warning threshold -- band-level rates below are not statistically meaningful yet.`
    : null;

  const output = {
    ...summary,
    sampleSizeWarning: sampleWarning,
    calibrationReadiness: calibration,
  };

  console.log(`[hr-performance] totalGradedRecords=${eligibleTotal}`);
  if (sampleWarning) console.log(`[hr-performance] ${sampleWarning}`);

  if (DRY_RUN) {
    console.log("[hr-performance] --dry-run set, not writing.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[hr-performance] Wrote ${SUMMARY_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[hr-performance] Fatal: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

export { main as performanceSummaryMain };
