#!/usr/bin/env node
/**
 * build-mlb-phase2-shadow-comparison.mjs
 *
 * Builds public/data/mlb/ml-phase2-shadow-comparison.json: an internal,
 * shadow-only comparison of live vs. Phase 2 shadow output for today's
 * Moneyline picks and HR props, using the pure helpers in
 * scripts/lib/mlb-phase2-shadow-comparison.mjs.
 *
 * Reads ONLY the already-generated raw files (ml-picks-raw.json,
 * hr-props-raw.json) -- never the archive, never a generator, and never
 * writes back to either input file.
 *
 * This script does NOT wire the comparison artifact into any generator,
 * archive, grader, workflow, or public UI -- that integration (if ever
 * needed) is deferred to a later, separately approved commit. It is
 * gated behind ENABLE_PHASE2_SHADOW_COMPARISON (see mlb-phase2-flags.mjs)
 * so accidental/local invocation without the flag is a no-op.
 *
 * Usage:
 *   ENABLE_PHASE2_SHADOW_COMPARISON=true node scripts/build-mlb-phase2-shadow-comparison.mjs
 *   ENABLE_PHASE2_SHADOW_COMPARISON=true node scripts/build-mlb-phase2-shadow-comparison.mjs --validate-only
 *   ENABLE_PHASE2_SHADOW_COMPARISON=true node scripts/build-mlb-phase2-shadow-comparison.mjs --ml-input=/tmp/ml.json --hr-input=/tmp/hr.json --out=/tmp/out.json
 *
 * --ml-input=<path>   override the Moneyline raw input path (default: public/data/mlb/ml-picks-raw.json)
 * --hr-input=<path>   override the HR raw input path (default: public/data/mlb/hr-props-raw.json)
 * --out=<path>        write to an alternate path instead of the tracked public/data file
 *                      (use this for local/manual verification; never point --out at a tracked path)
 * --validate-only     build and log a summary, but do not write any file
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { getPhase2Flags } from "./lib/mlb-phase2-flags.mjs";
import { buildPhase2ShadowComparison } from "./lib/mlb-phase2-shadow-comparison.mjs";

// ROOT is process.cwd()-based (matching generate-mlb-ml-picks.mjs /
// generate-mlb-hr-props.mjs), NOT __dirname-based like the bullpen/
// hand-split CLIs -- this lets tests safely redirect the DEFAULT input/
// output paths via a scratch working directory instead of ever risking
// a write to the real repo's tracked path when the opt-in env var is set.
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const DEFAULT_ML_INPUT_PATH = path.join(DATA_DIR, "ml-picks-raw.json");
const DEFAULT_HR_INPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const DEFAULT_OUTPUT_PATH = path.join(DATA_DIR, "ml-phase2-shadow-comparison.json");

function parseArgs(argv) {
  const mlInputArg = argv.find((a) => a.startsWith("--ml-input="));
  const hrInputArg = argv.find((a) => a.startsWith("--hr-input="));
  const outArg = argv.find((a) => a.startsWith("--out="));
  return {
    mlInputPath: mlInputArg ? path.resolve(mlInputArg.slice("--ml-input=".length)) : DEFAULT_ML_INPUT_PATH,
    hrInputPath: hrInputArg ? path.resolve(hrInputArg.slice("--hr-input=".length)) : DEFAULT_HR_INPUT_PATH,
    outputPath: outArg ? path.resolve(outArg.slice("--out=".length)) : DEFAULT_OUTPUT_PATH,
    validateOnly: argv.includes("--validate-only"),
  };
}

/** Missing file -> null; malformed JSON -> bounded warning + null. Never throws, never writes. */
function loadRawJsonSafe(filePath, label) {
  if (!existsSync(filePath)) {
    console.warn(`[phase2-comparison] ${label} not found at ${filePath}; that section will be empty.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[phase2-comparison] Failed to parse ${label} at ${filePath}: ${err.message}. That section will be empty.`);
    return null;
  }
}

function main() {
  const flags = getPhase2Flags();
  if (!flags.ENABLE_PHASE2_SHADOW_COMPARISON) {
    console.log(
      "[phase2-comparison] ENABLE_PHASE2_SHADOW_COMPARISON is not \"true\" -- this is a shadow/candidate " +
        "report and is a no-op by default. Set ENABLE_PHASE2_SHADOW_COMPARISON=true to run it."
    );
    return;
  }

  const { mlInputPath, hrInputPath, outputPath, validateOnly } = parseArgs(process.argv.slice(2));

  if (!validateOnly && outputPath === DEFAULT_OUTPUT_PATH && process.env.MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE !== "true") {
    // Mirrors the bullpen/hand-split CLI tracked-write guard exactly: no
    // live-generated production JSON should be committed from this
    // commit. Writing to the tracked path requires an explicit opt-in
    // env var so manual/local runs don't accidentally create a file
    // that then gets committed.
    console.log(
      "[phase2-comparison] Refusing to write to the tracked public/data/mlb/ml-phase2-shadow-comparison.json " +
        "path without MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE=true. Use --out=<path> for local verification " +
        "or --validate-only to skip writing entirely."
    );
    return;
  }

  const mlRaw = loadRawJsonSafe(mlInputPath, "ml-picks-raw.json");
  const hrRaw = loadRawJsonSafe(hrInputPath, "hr-props-raw.json");

  const artifact = buildPhase2ShadowComparison({ mlRaw, hrRaw });

  const mlSummary = artifact.moneyline.summary;
  const hrSummary = artifact.hr.summary;
  console.log(
    `[phase2-comparison] ML: loaded=${mlSummary.totalRecords} withShadow=${mlSummary.recordsWithShadow} ` +
      `missingShadowRate=${round1(1 - mlSummary.shadowAvailabilityRate)} pickFlips=${mlSummary.pickFlipCount}`
  );
  console.log(
    `[phase2-comparison] HR: loaded=${hrSummary.totalRecords} withShadow=${hrSummary.recordsWithShadow} ` +
      `missingShadowRate=${round1(1 - hrSummary.shadowAvailabilityRate)} liveVsShadowSpearman=${hrSummary.liveVsShadowSpearman}`
  );
  for (const warning of artifact.summary.warnings) {
    console.warn(`[phase2-comparison] ${warning}`);
  }

  if (validateOnly) {
    console.log("[phase2-comparison] --validate-only set, not writing.");
    return;
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`[phase2-comparison] Wrote ${outputPath}`);
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

main();
