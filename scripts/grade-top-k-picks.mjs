/**
 * grade-top-k-picks.mjs
 *
 * Postgame grading for the "Top K Props Performance" tracker section.
 * Reuses the exact same MLB Stats API boxscore call already used by
 * scripts/grade-mlb-hr-results.mjs -- no new provider. Grades the actual
 * strikeout-prop outcome (WIN/LOSS/PUSH/DNP/PENDING/UNRESOLVED) using ONLY
 * the persisted pregame line -- never a later sportsbook line.
 *
 * Usage: node scripts/grade-top-k-picks.mjs [--dry-run]
 */

import path from "node:path";
import process from "node:process";
import { createGameSummaryLoader } from "./grade-mlb-hr-results.mjs";
import { gradeKPropOutcome, loadJsonSafe, summarizeTopKPerformance, writeJson } from "./lib/mlb-top-k-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const PERFORMANCE_PATH = path.join(DATA_DIR, "top-k-performance.json");
const SUMMARY_PATH = path.join(DATA_DIR, "top-k-performance-summary.json");

const DRY_RUN = process.argv.includes("--dry-run");

function findPitcherEntry(battingLines, pitcherId) {
  const players = battingLines?.players ?? battingLines;
  if (!players) return null;
  return players[`ID${pitcherId}`] ?? null;
}

async function gradeRecord(record, loader) {
  const gameSummary = await loader.getGameSummary(record.gameId);
  if (gameSummary.resolutionError || gameSummary.gameState !== "final") return { ...record };

  const homeEntry = findPitcherEntry({ players: gameSummary.homeBattingLines }, record.pitcherId);
  const awayEntry = findPitcherEntry({ players: gameSummary.awayBattingLines }, record.pitcherId);
  const entry = homeEntry ?? awayEntry;

  if (!entry?.stats?.pitching) {
    return { ...record, resultStatus: "did_not_play", result: "DNP", actualStrikeOuts: null, actualInningsPitched: null, battersFaced: null, gradedAt: new Date().toISOString() };
  }

  const pitching = entry.stats.pitching;
  const actualStrikeOuts = pitching.strikeOuts ?? 0;
  const actualInningsPitched = pitching.inningsPitched ?? null;
  const battersFaced = pitching.battersFaced ?? null;
  const result = gradeKPropOutcome(record.side, record.line, actualStrikeOuts);

  return {
    ...record,
    resultStatus: "final",
    actualStrikeOuts,
    actualInningsPitched,
    battersFaced,
    result,
    gradedAt: new Date().toISOString(),
  };
}

async function main() {
  const performance = loadJsonSafe(PERFORMANCE_PATH, null);
  if (!performance) {
    console.log("[top-k-grade] top-k-performance.json does not exist yet -- nothing to grade.");
    return;
  }

  const pending = performance.records.filter((r) => r.resultStatus === "pending");
  console.log(`[top-k-grade] ${performance.records.length} total records, ${pending.length} pending.`);

  if (pending.length > 0) {
    const loader = createGameSummaryLoader();
    const gradedByKey = new Map();
    for (const record of pending) {
      const graded = await gradeRecord(record, loader);
      gradedByKey.set(`${record.date}|${record.pitcherId}|${record.gameId}|${record.side}`, graded);
    }
    performance.records = performance.records.map((r) => gradedByKey.get(`${r.date}|${r.pitcherId}|${r.gameId}|${r.side}`) ?? r);
    const stillPending = performance.records.filter((r) => r.resultStatus === "pending").length;
    console.log(`[top-k-grade] Graded ${pending.length - stillPending} records this run (${stillPending} remain pending).`);
  }

  const summary = summarizeTopKPerformance(performance, performance.trackingStartDate);

  if (DRY_RUN) {
    console.log("[top-k-grade] Dry run -- not writing files.");
    return;
  }

  writeJson(PERFORMANCE_PATH, performance);
  writeJson(SUMMARY_PATH, summary);
  console.log(`[top-k-grade] Wrote ${PERFORMANCE_PATH} and ${SUMMARY_PATH}.`);
}

main().catch((err) => {
  console.error("[top-k-grade] Fatal error:", err);
  process.exitCode = 1;
});
