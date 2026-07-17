/**
 * Generate public/data/mlb/bvp-history.json — display-only historical
 * batter-vs-pitcher context (career and trailing-5-year PA/H/AVG/HR) for
 * the /mlb/hr-props and /mlb/batter-vs-pitcher "AVG vs P" column and
 * expandable history panel.
 *
 * Reads the already-generated public/data/mlb/hr-props-raw.json (the same
 * payload the HR props / batter-vs-pitcher pages already consume) and, for
 * each unique (batter MLB id, opposing pitcher MLB id) pair on the slate,
 * fetches career and trailing-5-year batter-vs-pitcher splits from the free
 * MLB StatsAPI.
 *
 * Isolation: this script only reads hr-props-raw.json and only writes
 * bvp-history.json. It never mutates hr-props-raw.json or
 * hr-props-best-bets.json, and nothing here feeds hrScore, matchup
 * scores, rankings, recommendations, confidence, eligibility, filters, or
 * sorting — those are computed entirely upstream of this script and are
 * never re-read or re-written by it.
 *
 * Fails softly per pair (never fabricates data — missing fields stay null
 * and a warning is logged) but hard-fails only if the input file is
 * missing/malformed, since that is required for every row.
 *
 * Usage:
 *   node scripts/generate-mlb-bvp-history.mjs
 *   node scripts/generate-mlb-bvp-history.mjs --dry-run
 *   node scripts/generate-mlb-bvp-history.mjs --input=path/to/hr-props-raw.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBvpHistoryEntry, buildBvpHistoryKey, parseVsPlayerSplit } from "./lib/mlb-bvp-history-core.mjs";
import { DEFAULT_CONCURRENCY, fetchBvpHistoryForPair, runLimited } from "./lib/mlb-bvp-history-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const DEFAULT_INPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const OUTPUT_PATH = path.join(DATA_DIR, "bvp-history.json");
const SOURCE_LABEL = "mlb_stats_api";

function parseArgs(argv) {
  const args = { dryRun: false, input: DEFAULT_INPUT_PATH };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--input=")) args.input = path.resolve(arg.slice("--input=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * One entry per unique (batterId, pitcherId) pair on the slate. A batter
 * facing the same opposing starter across a doubleheader still only needs
 * one history lookup, since career/trailing-5Y history doesn't change
 * within a single day.
 */
function dedupeBatterPitcherPairs(batters) {
  const seen = new Map();
  for (const batter of batters ?? []) {
    if (batter?.playerId == null || batter?.opposingPitcherId == null) continue;
    const key = buildBvpHistoryKey(batter.playerId, batter.opposingPitcherId);
    if (seen.has(key)) continue;
    seen.set(key, {
      batterId: batter.playerId,
      pitcherId: batter.opposingPitcherId,
      batter: batter.player ?? null,
      pitcher: batter.opposingPitcher ?? null,
    });
  }
  return Array.from(seen.values());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = JSON.parse(readFileSync(args.input, "utf8"));
  } catch (error) {
    throw new Error(`Could not read/parse ${args.input}: ${error.message}`);
  }
  const slateDate = raw?.date;
  if (!slateDate) throw new Error(`${args.input} is missing a "date" field — cannot determine slate date.`);

  const pairs = dedupeBatterPitcherPairs(raw.batters);
  console.log(`[bvp-history] slate ${slateDate}: ${pairs.length} unique batter/pitcher pairs to process`);

  if (!pairs.length) {
    console.warn("[bvp-history] No batter/pitcher pairs with both identity ids present — nothing to fetch.");
  }

  const warnings = [];
  let successCount = 0;
  let partialCount = 0;

  const history = await runLimited(pairs, DEFAULT_CONCURRENCY, async (pair) => {
    const { careerJson, careerError, last5yJson, last5yError } = await fetchBvpHistoryForPair(pair.batterId, pair.pitcherId);

    if (careerError) warnings.push(`${pair.batter} vs ${pair.pitcher}: career history unavailable (${careerError.message})`);
    if (last5yError) warnings.push(`${pair.batter} vs ${pair.pitcher}: last-5-year history unavailable (${last5yError.message})`);

    const career = careerError ? null : parseVsPlayerSplit(careerJson);
    const last5y = last5yError ? null : parseVsPlayerSplit(last5yJson);

    if (career != null || last5y != null) successCount += 1;
    else partialCount += 1;

    return buildBvpHistoryEntry({
      batterId: pair.batterId,
      pitcherId: pair.pitcherId,
      batter: pair.batter,
      pitcher: pair.pitcher,
      career,
      last5y,
    });
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_LABEL,
    date: slateDate,
    history,
  };

  console.log(`[bvp-history] built ${history.length} history records (${successCount} with data, ${partialCount} unavailable)`);
  if (warnings.length) {
    console.warn(`[bvp-history] ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 25)) console.warn(`  - ${warning}`);
    if (warnings.length > 25) console.warn(`  ... and ${warnings.length - 25} more`);
  }

  if (args.dryRun) {
    console.log("[bvp-history] --dry-run: not writing output file.");
    return;
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[bvp-history] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`[bvp-history] FAILED: ${error.message}`);
  process.exit(1);
});
