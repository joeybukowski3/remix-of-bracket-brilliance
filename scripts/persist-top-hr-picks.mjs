/**
 * persist-top-hr-picks.mjs
 *
 * Pregame snapshot for the "Top HR Props Performance" tracker section.
 * Persists the EXACT players shown to users under "Top HR Props Today" on
 * /mlb/hr-props (src/pages/MlbHrProps.tsx: `visibleBestBets.slice(0, 3)`,
 * where `visibleBestBets` is `bestBets.bestBets` from
 * public/data/mlb/hr-props-best-bets.json). Selection itself is decided
 * exclusively by scripts/lib/mlb-hr-selection.mjs's
 * selectDeterministicHrPicks -- this script only re-derives the same
 * bestBets slate (already written to hr-props-best-bets.json this run) and
 * records identity/context fields from hr-props-raw.json.
 *
 * Idempotent: keyed by date+playerId+gameId (mlb-top-hr-tracking.mjs),
 * never overwrites an already-graded record.
 *
 * Usage: node scripts/persist-top-hr-picks.mjs [--dry-run]
 */

import path from "node:path";
import process from "node:process";
import { loadJsonSafe, mergeTopHrRecords, TOP_HR_TRACKING_MODEL_VERSION, writeJson } from "./lib/mlb-top-hr-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const PERFORMANCE_PATH = path.join(DATA_DIR, "top-hr-performance.json");

const DRY_RUN = process.argv.includes("--dry-run");

function main() {
  const raw = loadJsonSafe(RAW_PATH, null);
  const bestBetsPayload = loadJsonSafe(BEST_BETS_PATH, null);
  if (!raw || !bestBetsPayload) {
    console.error("[top-hr-persist] hr-props-raw.json or hr-props-best-bets.json missing -- nothing to persist.");
    process.exitCode = 1;
    return;
  }

  const date = raw.date;
  const batterIndex = new Map((raw.batters ?? []).map((b) => [`${b.player}|${b.team}|${b.opponent}`, b]));

  // Same top-3 slice the page renders under "Top HR Props Today".
  const topThree = (bestBetsPayload.bestBets ?? []).slice(0, 3);

  const records = [];
  for (let i = 0; i < topThree.length; i++) {
    const pick = topThree[i];
    const batterRow = batterIndex.get(`${pick.player}|${pick.team}|${pick.opponent}`);
    if (!batterRow) {
      console.warn(`[top-hr-persist] Could not find raw batter row for ${pick.player} (${pick.team} vs ${pick.opponent}) -- skipping.`);
      continue;
    }
    records.push({
      trackingModelVersion: TOP_HR_TRACKING_MODEL_VERSION,
      date,
      persistedAt: new Date().toISOString(),
      playerId: batterRow.playerId,
      playerName: batterRow.player,
      team: batterRow.team,
      teamId: batterRow.teamId ?? null,
      opponent: batterRow.opponent,
      opponentId: batterRow.opponentId ?? null,
      gameId: batterRow.gameId,
      hrQualityScore: batterRow.hrScore ?? null,
      rank: batterRow.hrScoreRank ?? null,
      slot: i + 1,
      odds: pick.hrOddsYes ?? batterRow.hrOddsYes ?? null,
      oddsBook: batterRow.hrOddsBook ?? null,
      impliedProbability: pick.marketImpliedProbability ?? batterRow.marketImpliedProbability ?? null,
      lineupStatus: batterRow.lineupStatus ?? null,
      modelVersion: batterRow.modelVersion ?? bestBetsPayload.modelVersion ?? null,
      resultStatus: "pending",
      battingLine: null,
      gradedAt: null,
      // This is a real pregame snapshot -- persistedAt above is the actual
      // moment this script ran, before any game result was known.
      snapshotBasis: "pregame",
    });
  }

  console.log(`[top-hr-persist] date=${date} topThree=${topThree.length} matchedRecords=${records.length}`);

  if (records.length === 0) {
    console.log("[top-hr-persist] No Top HR Props identified today -- nothing to persist.");
    return;
  }

  const existing = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const beforeCount = existing.records?.length ?? 0;
  const merged = mergeTopHrRecords(existing, records);
  const afterCount = merged.records.length;

  console.log(`[top-hr-persist] records before=${beforeCount} after=${afterCount} (new=${afterCount - beforeCount})`);

  if (DRY_RUN) {
    console.log("[top-hr-persist] Dry run -- not writing file.");
    return;
  }

  writeJson(PERFORMANCE_PATH, { generatedAt: new Date().toISOString(), trackingModelVersion: TOP_HR_TRACKING_MODEL_VERSION, trackingStartDate: existing.trackingStartDate ?? date, records: merged.records });
  console.log(`[top-hr-persist] Wrote ${PERFORMANCE_PATH}`);
}

main();
