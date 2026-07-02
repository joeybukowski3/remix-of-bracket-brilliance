/**
 * build-mlb-ml-performance-summary.mjs
 *
 * Reads the graded Moneyline prediction archive and writes a compact
 * internal-only performance summary to
 * public/data/mlb/ml-model-performance.json using the pure helper in
 * scripts/lib/mlb-ml-performance-summary.mjs.
 *
 * IMPORTANT: this summary reports empirical historical outcome rates and
 * CLV proxy statistics. It does NOT claim Edge Strength (confidence) is a
 * calibrated probability -- see the "note" field always included in the
 * output. No public UI reads this file in Phase 1.
 *
 * Usage:
 *   node scripts/build-mlb-ml-performance-summary.mjs
 *   node scripts/build-mlb-ml-performance-summary.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildPerformanceSummary, EDGE_TIERS } from "./lib/mlb-ml-performance-summary.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const ARCHIVE_PATH = path.join(DATA_DIR, "ml-prediction-history.json");
const SUMMARY_PATH = path.join(DATA_DIR, "ml-model-performance.json");
const DRY_RUN = process.argv.includes("--dry-run");

// Minimum sample size before reporting a group's rates as statistically
// meaningful, mirroring build-mlb-hr-performance-summary.mjs's threshold.
const MIN_SAMPLE_SIZE_WARNING = 20;

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[ml-performance] Failed to parse ${filePath}: ${err.message}.`);
    return fallback;
  }
}

function buildSampleSizeWarnings(summary) {
  const warnings = {};
  if (summary.overall.totalGraded < MIN_SAMPLE_SIZE_WARNING) {
    warnings.overall = `Sample size (${summary.overall.totalGraded} graded picks) is below the ${MIN_SAMPLE_SIZE_WARNING}-record warning threshold -- overall rates are not statistically meaningful yet.`;
  }
  const byEdgeTier = {};
  for (const tier of EDGE_TIERS) {
    const group = summary.byEdgeTier[tier];
    if (group.totalGraded < MIN_SAMPLE_SIZE_WARNING) {
      byEdgeTier[tier] = `Sample size (${group.totalGraded} graded picks) is below the ${MIN_SAMPLE_SIZE_WARNING}-record warning threshold -- this tier's rates are not statistically meaningful yet.`;
    }
  }
  if (Object.keys(byEdgeTier).length > 0) warnings.byEdgeTier = byEdgeTier;
  return Object.keys(warnings).length > 0 ? warnings : null;
}

async function main() {
  if (!existsSync(ARCHIVE_PATH)) {
    console.warn(`[ml-performance] ${ARCHIVE_PATH} does not exist yet. Nothing to summarize.`);
    return;
  }

  const archive = loadJsonSafe(ARCHIVE_PATH, null);
  if (!archive || !Array.isArray(archive.records)) {
    console.error("[ml-performance] Archive is missing or malformed. Aborting.");
    process.exitCode = 1;
    return;
  }

  const summary = buildPerformanceSummary(archive.records);
  const sampleSizeWarnings = buildSampleSizeWarnings(summary);

  const output = { ...summary, sampleSizeWarnings };

  console.log(`[ml-performance] totalArchivedPicks=${summary.totalArchivedPicks} totalGradedPicks=${summary.totalGradedPicks}`);
  if (sampleSizeWarnings) console.log(`[ml-performance] sample-size warnings present -- see output.sampleSizeWarnings`);

  if (DRY_RUN) {
    console.log("[ml-performance] --dry-run set, not writing.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[ml-performance] Wrote ${SUMMARY_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[ml-performance] Fatal: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

export { main as performanceSummaryMain };
