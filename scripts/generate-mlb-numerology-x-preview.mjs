import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildDailyNumerologyCard, ensureDirForFile, getTodayEt, loadJsonSafe, writeJson } from "./lib/mlb-numerology-tracking.mjs";
import { buildXPostPreview } from "./lib/mlb-numerology-x-post-core.mjs";

const ROOT = process.cwd();
const NUMEROLOGY_DAILY_PATH = path.join(ROOT, "public", "data", "mlb", "numerology-daily.json");
const HR_RAW_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "mlb", "numerology", "x-post-preview.json");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const requestedDate = getArgValue("--date") || getTodayEt();
const isDryRun = process.argv.includes("--dry-run");

function main() {
  const numerologyPayload = loadJsonSafe(NUMEROLOGY_DAILY_PATH, null);
  if (!numerologyPayload) {
    throw new Error(`Missing live numerology board payload at ${NUMEROLOGY_DAILY_PATH}. Run the "Generate MLB Numerology" workflow first.`);
  }
  const hrPayload = loadJsonSafe(HR_RAW_PATH, null);

  const card = buildDailyNumerologyCard(numerologyPayload, { date: requestedDate, hrPayload });
  const preview = buildXPostPreview(card);

  console.log(`[mlb-numerology-x] slate ${preview.date}`);
  console.log(`[mlb-numerology-x] daily number: ${preview.dayNumbers.universalDayLabel ?? "unknown"}`);
  console.log(`[mlb-numerology-x] top play: ${preview.topPlay ? `${preview.topPlay.player} (${preview.topPlay.numerologyScore})` : "none"}`);
  console.log(`[mlb-numerology-x] qualifying plays over ${preview.scoreThreshold}: ${preview.totalQualifiedCount}`);

  if (isDryRun) {
    console.log("[mlb-numerology-x] --dry-run: not writing output file.");
    return;
  }

  ensureDirForFile(OUTPUT_PATH);
  writeJson(OUTPUT_PATH, preview);
  console.log(`[mlb-numerology-x] wrote ${OUTPUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(`[mlb-numerology-x] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
