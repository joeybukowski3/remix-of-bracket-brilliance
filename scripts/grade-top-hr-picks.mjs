/**
 * grade-top-hr-picks.mjs
 *
 * Postgame grading for the "Top HR Props Performance" tracker section.
 * Reuses the exact same MLB Stats API boxscore call already used by
 * scripts/grade-mlb-hr-results.mjs -- no new provider.
 *
 * Usage: node scripts/grade-top-hr-picks.mjs [--dry-run]
 */

import path from "node:path";
import process from "node:process";
import { createGameSummaryLoader } from "./grade-mlb-hr-results.mjs";
import { findPlayerBattingLine } from "./lib/mlb-hr-grading.mjs";
import { loadJsonSafe, summarizeTopHrPerformance, writeJson } from "./lib/mlb-top-hr-tracking.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const PERFORMANCE_PATH = path.join(DATA_DIR, "top-hr-performance.json");
const SUMMARY_PATH = path.join(DATA_DIR, "top-hr-performance-summary.json");

const DRY_RUN = process.argv.includes("--dry-run");

function selectSideBattingLines(record, gameSummary) {
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.homeTeamId)) return gameSummary.homeBattingLines;
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.awayTeamId)) return gameSummary.awayBattingLines;
  return null;
}

async function gradeRecord(record, loader) {
  const gameSummary = await loader.getGameSummary(record.gameId);
  if (gameSummary.resolutionError || gameSummary.gameState !== "final") return { ...record };

  const battingLines = selectSideBattingLines(record, gameSummary);
  if (!battingLines) return { ...record, resultStatus: "unresolved", gradedAt: new Date().toISOString() };

  const line = findPlayerBattingLine(battingLines, record.playerId);
  if (!line) return { ...record, resultStatus: "did_not_play", battingLine: null, gradedAt: new Date().toISOString() };

  const stat = line.stat;
  const battingLine = {
    atBats: stat.atBats ?? null,
    hits: stat.hits ?? null,
    doubles: stat.doubles ?? null,
    homeRuns: stat.homeRuns ?? null,
    totalBases: stat.totalBases ?? null,
    rbi: stat.rbi ?? null,
    runs: stat.runs ?? null,
    baseOnBalls: stat.baseOnBalls ?? null,
    strikeOuts: stat.strikeOuts ?? null,
  };
  const resultStatus = (stat.homeRuns ?? 0) > 0 ? "hit" : "miss";
  return { ...record, resultStatus, battingLine, gradedAt: new Date().toISOString() };
}

async function main() {
  const performance = loadJsonSafe(PERFORMANCE_PATH, null);
  if (!performance) {
    console.log("[top-hr-grade] top-hr-performance.json does not exist yet -- nothing to grade.");
    return;
  }

  const pending = performance.records.filter((r) => r.resultStatus === "pending");
  console.log(`[top-hr-grade] ${performance.records.length} total records, ${pending.length} pending.`);

  if (pending.length > 0) {
    const loader = createGameSummaryLoader();
    const gradedByKey = new Map();
    for (const record of pending) {
      const graded = await gradeRecord(record, loader);
      gradedByKey.set(`${record.date}|${record.playerId}|${record.gameId}`, graded);
    }
    performance.records = performance.records.map((r) => gradedByKey.get(`${r.date}|${r.playerId}|${r.gameId}`) ?? r);
    const stillPending = performance.records.filter((r) => r.resultStatus === "pending").length;
    console.log(`[top-hr-grade] Graded ${pending.length - stillPending} records this run (${stillPending} remain pending).`);
  }

  const summary = summarizeTopHrPerformance(performance, performance.trackingStartDate);

  if (DRY_RUN) {
    console.log("[top-hr-grade] Dry run -- not writing files.");
    return;
  }

  writeJson(PERFORMANCE_PATH, performance);
  writeJson(SUMMARY_PATH, summary);
  console.log(`[top-hr-grade] Wrote ${PERFORMANCE_PATH} and ${SUMMARY_PATH}.`);
}

main().catch((err) => {
  console.error("[top-hr-grade] Fatal error:", err);
  process.exitCode = 1;
});
