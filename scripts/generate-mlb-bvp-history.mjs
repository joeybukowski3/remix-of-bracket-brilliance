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
 * Isolation: this script only reads hr-props-raw.json (and its own prior
 * output, for same-slate cache reuse) and only writes bvp-history.json. It
 * never mutates hr-props-raw.json or hr-props-best-bets.json, and nothing
 * here feeds hrScore, matchup scores, rankings, recommendations,
 * confidence, eligibility, filters, or sorting — those are computed
 * entirely upstream of this script and are never re-read or re-written by
 * it.
 *
 * Fails softly per pair (never fabricates data — missing fields stay null
 * and a warning is logged) but hard-fails only if the input file is
 * missing/malformed, since that is required for every row. A pair whose
 * two windows disagree on a counting stat (last5y.pa/h/hr exceeding the
 * career total -- see violatesCareerInvariant) is also nulled out
 * entirely: neither MLB StatsAPI endpoint is proven authoritative when
 * they're inconsistent with each other, so this never publishes a value
 * it can't verify.
 *
 * Same-slate cache reuse: a pair already fully resolved (both windows
 * non-null) in a same-date prior run of this script is reused as-is,
 * without a fresh fetch -- valuable when the daily workflow runs this
 * generator more than once. Prior-slate cache (a different date) is
 * discarded outright. A pair no longer on today's slate is dropped from
 * the output even if it was cached. When a pair IS refetched and one
 * window's fetch attempt errors (network/HTTP failure, not a clean "no
 * data" result), that specific window falls back to its cached value
 * instead of being nulled -- a transient outage never destroys previously
 * -good data. Output is always written in deterministic key order.
 *
 * Rate limiting: every HTTP request start across every pair -- career,
 * last5y, and retries -- shares one global pacer capped at ~5 request
 * starts/second (see mlb-bvp-history-fetch.mjs).
 *
 * Usage:
 *   node scripts/generate-mlb-bvp-history.mjs
 *   node scripts/generate-mlb-bvp-history.mjs --dry-run
 *   node scripts/generate-mlb-bvp-history.mjs --input=path/to/hr-props-raw.json
 *   node scripts/generate-mlb-bvp-history.mjs --output=path/to/bvp-history.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBvpHistoryEntry,
  buildBvpHistoryKey,
  filterCacheForSlate,
  isCachedEntryFullyValid,
  parseVsPlayerSplit,
  resolveWindow,
  violatesCareerInvariant,
} from "./lib/mlb-bvp-history-core.mjs";
import { DEFAULT_CONCURRENCY, fetchBvpHistoryForPair, runLimited } from "./lib/mlb-bvp-history-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const DEFAULT_INPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const OUTPUT_PATH = path.join(DATA_DIR, "bvp-history.json");
const SOURCE_LABEL = "mlb_stats_api";

function parseArgs(argv) {
  const args = { dryRun: false, input: DEFAULT_INPUT_PATH, output: OUTPUT_PATH };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--input=")) args.input = path.resolve(arg.slice("--input=".length));
    else if (arg.startsWith("--output=")) args.output = path.resolve(arg.slice("--output=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * One entry per unique (batterId, pitcherId) pair on the slate. A batter
 * facing the same opposing starter across a doubleheader still only needs
 * one history lookup, since career/trailing-5Y history doesn't change
 * within a single day. Invalid identity ids (see buildBvpHistoryKey --
 * anything that isn't a positive finite integer) are skipped entirely:
 * there is no key to cache, fetch, or publish under.
 */
function dedupeBatterPitcherPairs(batters) {
  const seen = new Map();
  for (const batter of batters ?? []) {
    const key = buildBvpHistoryKey(batter?.playerId, batter?.opposingPitcherId);
    if (key == null) continue;
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      batterId: batter.playerId,
      pitcherId: batter.opposingPitcherId,
      batter: batter.player ?? null,
      pitcher: batter.opposingPitcher ?? null,
    });
  }
  return Array.from(seen.values());
}

/**
 * Loads the previous run's output for same-slate cache reuse. Returns an
 * empty map (never throws) when there is no prior output, it can't be
 * parsed, or its date doesn't match today's slate -- a stale or malformed
 * cache is exactly equivalent to a cold start, not an error.
 */
function loadPreviousCache(outputPath, slateDate) {
  try {
    if (!existsSync(outputPath)) return filterCacheForSlate(null, slateDate);
    const previous = JSON.parse(readFileSync(outputPath, "utf8"));
    return filterCacheForSlate(previous, slateDate);
  } catch {
    return new Map();
  }
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
    console.warn("[bvp-history] No batter/pitcher pairs with valid identity ids present — nothing to fetch.");
  }

  // Same-slate cache reuse: keyed lookup only, never a blanket carry-forward
  // of the whole prior file -- a pair no longer in `pairs` (today's slate)
  // simply never gets looked up here, so it's dropped from the output.
  const previousByKey = loadPreviousCache(args.output, slateDate);

  const warnings = [];
  let successCount = 0;
  let partialCount = 0;
  let reusedCount = 0;
  // Bounded counter (not a per-pair log line): how many pairs had a
  // career/last5y counting-stat invariant violation (see
  // violatesCareerInvariant) and were therefore nulled out entirely rather
  // than published with an untrustworthy value.
  let invariantRejectedCount = 0;

  const history = await runLimited(pairs, DEFAULT_CONCURRENCY, async (pair) => {
    const cached = previousByKey.get(pair.key);

    if (isCachedEntryFullyValid(cached)) {
      reusedCount += 1;
      return cached;
    }

    const { careerJson, careerError, last5yJson, last5yError } = await fetchBvpHistoryForPair(pair.batterId, pair.pitcherId);

    if (careerError) warnings.push(`${pair.batter} vs ${pair.pitcher}: career history unavailable (${careerError.message})`);
    if (last5yError) warnings.push(`${pair.batter} vs ${pair.pitcher}: last-5-year history unavailable (${last5yError.message})`);

    const freshCareer = careerError ? null : parseVsPlayerSplit(careerJson, "vsPlayerTotal");
    const freshLast5y = last5yError ? null : parseVsPlayerSplit(last5yJson, "vsPlayer5Y");

    // Window-level fallback: a fetch ERROR (not a clean "no data" result)
    // preserves whatever valid value was cached for that specific window.
    const career = resolveWindow(freshCareer, Boolean(careerError), cached?.career ?? null);
    const last5y = resolveWindow(freshLast5y, Boolean(last5yError), cached?.last5y ?? null);

    if (violatesCareerInvariant(career, last5y)) invariantRejectedCount += 1;

    const entry = buildBvpHistoryEntry({
      batterId: pair.batterId,
      pitcherId: pair.pitcherId,
      batter: pair.batter,
      pitcher: pair.pitcher,
      career,
      last5y,
    });

    if (entry.career != null || entry.last5y != null) successCount += 1;
    else partialCount += 1;

    return entry;
  });

  // Deterministic output ordering, independent of fetch completion order or dedupe insertion order.
  const sortedHistory = [...history].sort((a, b) => a.key.localeCompare(b.key));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_LABEL,
    date: slateDate,
    history: sortedHistory,
  };

  console.log(`[bvp-history] built ${sortedHistory.length} history records (${successCount} with data, ${partialCount} unavailable, ${reusedCount} reused from cache)`);
  if (invariantRejectedCount > 0) {
    console.warn(`[bvp-history] ${invariantRejectedCount} pair(s) rejected for violating the career/last5y counting-stat invariant (PA/H/HR) -- MLB StatsAPI's vsPlayerTotal and vsPlayer5Y disagreed, so both windows were set to null rather than publishing an unverified value.`);
  }
  if (warnings.length) {
    console.warn(`[bvp-history] ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 25)) console.warn(`  - ${warning}`);
    if (warnings.length > 25) console.warn(`  ... and ${warnings.length - 25} more`);
  }

  if (args.dryRun) {
    console.log("[bvp-history] --dry-run: not writing output file.");
    return;
  }

  writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[bvp-history] wrote ${args.output}`);
}

main().catch((error) => {
  console.error(`[bvp-history] FAILED: ${error.message}`);
  process.exit(1);
});
