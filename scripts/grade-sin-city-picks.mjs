/**
 * grade-sin-city-picks.mjs
 *
 * Postgame grading step for Sin City forward-tracking. Grades every
 * "pending" record in public/data/mlb/sin-city-performance.json against the
 * final MLB boxscore (same MLB Stats API endpoints already used by
 * scripts/grade-mlb-hr-results.mjs -- no new provider), then rebuilds
 * public/data/mlb/sin-city-performance-summary.json with separate 5/5 and
 * 4/5 aggregates.
 *
 * Does not touch the Sin City selection algorithm or the pregame snapshot
 * (factors/qualificationLevel) -- only fills in resultStatus, battingLine,
 * and gradedAt for records that were already persisted pregame.
 *
 * Usage: node scripts/grade-sin-city-picks.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createGameSummaryLoader } from "./grade-mlb-hr-results.mjs";
import { findPlayerBattingLine } from "./lib/mlb-hr-grading.mjs";

const ROOT = process.cwd();
const PERFORMANCE_PATH = path.join(ROOT, "public", "data", "mlb", "sin-city-performance.json");
const SUMMARY_PATH = path.join(ROOT, "public", "data", "mlb", "sin-city-performance-summary.json");

const DRY_RUN = process.argv.includes("--dry-run");

function americanOddsToDecimalProfit(oddsText) {
  const n = Number(String(oddsText ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function selectSideBattingLines(record, gameSummary) {
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.homeTeamId)) return gameSummary.homeBattingLines;
  if (record.teamId != null && Number(record.teamId) === Number(gameSummary.awayTeamId)) return gameSummary.awayBattingLines;
  return null;
}

async function gradeRecord(record, loader) {
  const gameSummary = await loader.getGameSummary(record.gameId);

  if (gameSummary.resolutionError) return { ...record };
  if (gameSummary.gameState !== "final") return { ...record };

  const battingLines = selectSideBattingLines(record, gameSummary);
  if (!battingLines) {
    return { ...record, resultStatus: "unresolved", gradedAt: new Date().toISOString() };
  }

  const line = findPlayerBattingLine(battingLines, record.playerId);
  if (!line) {
    return { ...record, resultStatus: "did_not_play", battingLine: null, gradedAt: new Date().toISOString() };
  }

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

function summarizeLevel(records, level) {
  const levelRecords = records.filter((r) => r.qualificationLevel === level);
  const graded = levelRecords.filter((r) => r.resultStatus === "hit" || r.resultStatus === "miss");
  const hits = graded.filter((r) => r.resultStatus === "hit");
  const withOdds = graded.map((r) => americanOddsToDecimalProfit(r.hrOddsYes)).filter((p) => p !== null);

  const roiUnits = graded.reduce((sum, r) => {
    const profit = americanOddsToDecimalProfit(r.hrOddsYes);
    if (profit === null) return sum;
    return sum + (r.resultStatus === "hit" ? profit : -1);
  }, 0);

  return {
    qualifiedPlays: levelRecords.length,
    hrHits: hits.length,
    hrHitRate: graded.length ? Number(((hits.length / graded.length) * 100).toFixed(1)) : null,
    averageOdds: withOdds.length ? Number((withOdds.reduce((a, b) => a + b, 0) / withOdds.length * 100).toFixed(1)) : null,
    oddsCoveragePercent: graded.length ? Number(((withOdds.length / graded.length) * 100).toFixed(1)) : 0,
    flatBetRoi: withOdds.length ? Number(((roiUnits / withOdds.length) * 100).toFixed(1)) : null,
  };
}

async function main() {
  const performanceFile = JSON.parse(readFileSync(PERFORMANCE_PATH, "utf8"));
  const pending = performanceFile.records.filter((r) => r.resultStatus === "pending");
  console.log(`[sin-city-grade] ${performanceFile.records.length} total records, ${pending.length} pending.`);

  if (pending.length === 0) {
    console.log("[sin-city-grade] Nothing to grade.");
  } else {
    const loader = createGameSummaryLoader();
    const gradedRecords = new Map();
    for (const record of pending) {
      const graded = await gradeRecord(record, loader);
      gradedRecords.set(`${record.date}|${record.playerId}|${record.gameId}`, graded);
    }

    performanceFile.records = performanceFile.records.map((r) => {
      const key = `${r.date}|${r.playerId}|${r.gameId}`;
      return gradedRecords.get(key) ?? r;
    });

    const stillPending = performanceFile.records.filter((r) => r.resultStatus === "pending").length;
    const nowGraded = pending.length - stillPending;
    console.log(`[sin-city-grade] Graded ${nowGraded} records this run (${stillPending} remain pending -- game not yet final).`);
  }

  const gradedDates = performanceFile.records
    .filter((r) => r.resultStatus !== "pending")
    .map((r) => r.date)
    .sort();
  const mostRecentGradedDate = gradedDates.length ? gradedDates[gradedDates.length - 1] : null;

  const summary = {
    generatedAt: new Date().toISOString(),
    trackingModelVersion: performanceFile.trackingModelVersion,
    trackingStartDate: performanceFile.trackingStartDate,
    totalTrackedDates: new Set(performanceFile.records.map((r) => r.date)).size,
    mostRecentGradedDate,
    fiveOfFive: summarizeLevel(performanceFile.records, "5/5"),
    fourOfFive: summarizeLevel(performanceFile.records, "4/5"),
  };

  if (DRY_RUN) {
    console.log("[sin-city-grade] Dry run -- not writing files.");
    return;
  }

  writeFileSync(PERFORMANCE_PATH, `${JSON.stringify(performanceFile, null, 2)}\n`);
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[sin-city-grade] Wrote ${PERFORMANCE_PATH} and ${SUMMARY_PATH}.`);
}

main().catch((err) => {
  console.error("[sin-city-grade] Fatal error:", err);
  process.exitCode = 1;
});
