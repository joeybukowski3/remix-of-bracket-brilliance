/**
 * backfill-top-hr-picks.mjs
 *
 * Reconstructs historical "Top HR Props Today" selections from
 * public/data/mlb/hr-prediction-history.json, using the EXACT same
 * deterministic rule the live site uses today
 * (scripts/lib/mlb-hr-selection.mjs's selectDeterministicHrPicks) --
 * this script does not invent or approximate the selection logic.
 *
 * Why this is safe (no hindsight bias): build-mlb-hr-archive.mjs archives
 * every batter's PREGAME prediction fields (hrQualityScore, hrRank, odds,
 * opposing pitcher) before any game result is known; the `result` object is
 * populated separately, later, by the grading pipeline. Re-running the
 * selection rule over those frozen pregame fields reproduces what the
 * selection WOULD have picked that day using only information that existed
 * before first pitch.
 *
 * CAVEAT (reported, not hidden): the archive record for a date reflects the
 * LAST generation run of that day (build-mlb-hr-archive.mjs updates
 * same-day records in place across intraday reruns), so this reconstructs
 * the final intraday "Top HR Props Today" view for each date, not
 * necessarily what an early-morning visitor saw before odds moved.
 *
 * Idempotent: merges via the same date+playerId+gameId key as
 * persist-top-hr-picks.mjs, so it never duplicates or overwrites a record
 * that a live forward-persist run (or a prior backfill run) already wrote.
 * Backfilled records are tagged `backfilled: true`.
 *
 * Usage: node scripts/backfill-top-hr-picks.mjs [--dry-run]
 */

import path from "node:path";
import process from "node:process";
import { selectDeterministicHrPicks } from "./lib/mlb-hr-selection.mjs";
import { loadJsonSafe, mergeTopHrRecords, summarizeTopHrPerformance, TOP_HR_TRACKING_MODEL_VERSION, writeJson } from "./lib/mlb-top-hr-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const HISTORY_PATH = path.join(DATA_DIR, "hr-prediction-history.json");
const PERFORMANCE_PATH = path.join(DATA_DIR, "top-hr-performance.json");
const SUMMARY_PATH = path.join(DATA_DIR, "top-hr-performance-summary.json");

const DRY_RUN = process.argv.includes("--dry-run");

const RESULT_STATUS_MAP = {
  hit: "hit",
  miss: "miss",
  did_not_play: "did_not_play",
};

function toSelectionRow(historyRecord) {
  return {
    player: historyRecord.playerName,
    team: historyRecord.team,
    opponent: historyRecord.opponent,
    opposingPitcher: historyRecord.opposingPitcherName ?? "",
    hrScore: historyRecord.hrQualityScore,
    hrOddsYes: historyRecord.hrOddsYes,
    __source: historyRecord,
  };
}

function main() {
  const history = loadJsonSafe(HISTORY_PATH, null);
  if (!history) {
    console.error(`[top-hr-backfill] ${HISTORY_PATH} not found.`);
    process.exitCode = 1;
    return;
  }

  const byDate = new Map();
  for (const record of history.records) {
    if (!byDate.has(record.date)) byDate.set(record.date, []);
    byDate.get(record.date).push(record);
  }

  const backfilledRecords = [];
  const dateReport = [];

  for (const [date, dateRecords] of byDate) {
    // Selection rule expects rows already rank-sorted descending by HR Quality Score.
    const sorted = dateRecords
      .filter((r) => r.hrQualityScore != null)
      .sort((a, b) => (b.hrQualityScore ?? -Infinity) - (a.hrQualityScore ?? -Infinity) || (a.hrRank ?? Infinity) - (b.hrRank ?? Infinity));

    const selectionRows = sorted.map(toSelectionRow);
    const { bestBets } = selectDeterministicHrPicks(selectionRows);
    const topThree = bestBets.slice(0, 3);

    if (topThree.length === 0) {
      dateReport.push({ date, reconstructed: 0, reason: "no eligible rows" });
      continue;
    }

    topThree.forEach((row, i) => {
      const source = row.__source;
      const rawStatus = source.result?.status;
      const mappedStatus = RESULT_STATUS_MAP[rawStatus] ?? (rawStatus === "pending" ? "pending" : "unresolved");
      backfilledRecords.push({
        trackingModelVersion: TOP_HR_TRACKING_MODEL_VERSION,
        date,
        persistedAt: source.generatedAt,
        playerId: source.playerId,
        playerName: source.playerName,
        team: source.team,
        teamId: source.teamId ?? null,
        opponent: source.opponent,
        opponentId: source.opponentId ?? null,
        gameId: source.gameId,
        hrQualityScore: source.hrQualityScore,
        rank: source.hrRank,
        slot: i + 1,
        odds: source.hrOddsYes ?? null,
        oddsBook: source.hrOddsBook ?? null,
        impliedProbability: source.marketImpliedProbability ?? null,
        lineupStatus: source.lineupStatus ?? null,
        modelVersion: source.modelVersion ?? null,
        resultStatus: mappedStatus,
        battingLine: mappedStatus === "hit" || mappedStatus === "miss" ? (source.result?.battingLine ?? null) : null,
        gradedAt: source.result?.gradedAt ?? null,
        backfilled: true,
        // persistedAt above (source.generatedAt) is the archive's LAST
        // generation-run timestamp for that date, not necessarily the
        // earliest morning snapshot a visitor saw -- see the caveat at the
        // top of this file. Recorded explicitly so the UI/data never imply
        // a fixed morning recommendation that can't be proven.
        snapshotBasis: "final-intraday",
      });
    });
    dateReport.push({ date, reconstructed: topThree.length });
  }

  console.log(`[top-hr-backfill] Reconstructed Top HR picks for ${dateReport.filter((d) => d.reconstructed > 0).length} of ${byDate.size} archived dates (${backfilledRecords.length} total picks).`);
  for (const entry of dateReport) {
    if (entry.reconstructed === 0) console.log(`[top-hr-backfill]   ${entry.date}: unrecoverable (${entry.reason})`);
  }

  const existing = loadJsonSafe(PERFORMANCE_PATH, { records: [] });
  const beforeCount = existing.records?.length ?? 0;
  const merged = mergeTopHrRecords(existing, backfilledRecords);
  const afterCount = merged.records.length;
  console.log(`[top-hr-backfill] Records before=${beforeCount} after=${afterCount} (new=${afterCount - beforeCount})`);

  const dates = [...byDate.keys()].sort();
  const trackingStartDate = existing.trackingStartDate ?? dates[0];

  if (DRY_RUN) {
    console.log("[top-hr-backfill] Dry run -- not writing files.");
    return;
  }

  const performanceFile = { generatedAt: new Date().toISOString(), trackingModelVersion: TOP_HR_TRACKING_MODEL_VERSION, trackingStartDate, records: merged.records };
  writeJson(PERFORMANCE_PATH, performanceFile);
  writeJson(SUMMARY_PATH, summarizeTopHrPerformance(performanceFile, trackingStartDate));
  console.log(`[top-hr-backfill] Wrote ${PERFORMANCE_PATH} and ${SUMMARY_PATH}.`);
}

main();
