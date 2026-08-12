/**
 * mlb-top-k-tracking.mjs
 *
 * Shared helpers for the "Top K Props" forward-tracking scripts. Does NOT
 * define or alter the selection rule -- that lives exclusively in
 * src/lib/mlb/kPropBestBets.ts (buildKPropBestBets) and
 * src/lib/mlb/mlbSocialSelection.ts (buildPitcherStrikeoutRows), which
 * scripts/persist-top-k-picks.ts imports directly (via tsx) rather than
 * reimplementing.
 *
 * No historical archive exists for K props (confirmed during
 * investigation: no prior script ever persisted a day's actual K
 * recommendation), so unlike Top HR there is no backfill helper here --
 * tracking is forward-only from whenever this script is first deployed.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const TOP_K_TRACKING_MODEL_VERSION = "top-k-tracking-v1";

export function loadJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function recordKey(record) {
  return `${record.date}|${record.pitcherId}|${record.gameId}|${record.side}`;
}

/** Same upsert semantics as mergeTopHrRecords: never overwrites a graded record. */
export function mergeTopKRecords(existingPayload, incomingRecords) {
  const existing = Array.isArray(existingPayload?.records) ? existingPayload.records : [];
  const byKey = new Map(existing.map((record) => [recordKey(record), record]));
  for (const record of incomingRecords) {
    const key = recordKey(record);
    const current = byKey.get(key);
    if (!current || current.resultStatus === "pending") {
      byKey.set(key, { ...current, ...record });
    }
  }
  const records = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.side.localeCompare(b.side) || a.slot - b.slot);
  return { records };
}

/**
 * OVER: actual > line -> WIN, actual < line -> LOSS, actual === line -> PUSH (only possible for an integer line).
 * UNDER: actual < line -> WIN, actual > line -> LOSS, actual === line -> PUSH (only possible for an integer line).
 * Uses the persisted pregame line -- never a later sportsbook line.
 */
export function gradeKPropOutcome(side, line, actualStrikeOuts) {
  if (actualStrikeOuts === line) return "PUSH";
  const actualIsOver = actualStrikeOuts > line;
  if (side === "over") return actualIsOver ? "WIN" : "LOSS";
  return actualIsOver ? "LOSS" : "WIN";
}

function parseInningsPitchedToOuts(ipString) {
  if (ipString == null) return null;
  const [wholeStr, fracStr = "0"] = String(ipString).split(".");
  const whole = Number(wholeStr);
  const frac = Number(fracStr);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;
  return whole * 3 + frac;
}

export function inningsPitchedToDecimal(ipString) {
  const outs = parseInningsPitchedToOuts(ipString);
  return outs == null ? null : Number((outs / 3).toFixed(2));
}

function americanOddsToDecimalProfit(oddsText) {
  const n = Number(String(oddsText ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

export function summarizeTopKPerformance(performanceFile, trackingStartDate) {
  const records = performanceFile.records ?? [];
  const graded = records.filter((r) => ["WIN", "LOSS", "PUSH"].includes(r.result));
  const wins = graded.filter((r) => r.result === "WIN");
  const losses = graded.filter((r) => r.result === "LOSS");
  const pushes = graded.filter((r) => r.result === "PUSH");
  const decided = wins.length + losses.length;

  const withOdds = graded.map((r) => americanOddsToDecimalProfit(r.odds)).filter((p) => p !== null);
  const roiUnits = graded.reduce((sum, r) => {
    if (r.result === "PUSH") return sum;
    const profit = americanOddsToDecimalProfit(r.odds);
    if (profit === null) return sum;
    return sum + (r.result === "WIN" ? profit : -1);
  }, 0);

  const actualKs = graded.map((r) => r.actualStrikeOuts).filter((v) => typeof v === "number");
  const ips = graded.map((r) => inningsPitchedToDecimal(r.actualInningsPitched)).filter((v) => v != null);
  const edges = records.map((r) => r.projectionEdge).filter((v) => typeof v === "number");
  const kScores = records.map((r) => r.kScore).filter((v) => typeof v === "number");

  const avg = (values) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null);
  const totalActualKs = actualKs.reduce((a, b) => a + b, 0);
  const totalIp = ips.reduce((a, b) => a + b, 0);

  const gradedDates = records.filter((r) => r.resultStatus !== "pending").map((r) => r.date).sort();

  return {
    generatedAt: new Date().toISOString(),
    trackingModelVersion: TOP_K_TRACKING_MODEL_VERSION,
    trackingStartDate,
    totalTrackedDates: new Set(records.map((r) => r.date)).size,
    mostRecentGradedDate: gradedDates.length ? gradedDates[gradedDates.length - 1] : null,
    overall: {
      picks: records.length,
      wins: wins.length,
      losses: losses.length,
      pushes: pushes.length,
      winRate: decided ? Number(((wins.length / decided) * 100).toFixed(1)) : null,
      avgEdge: avg(edges),
      avgKScore: avg(kScores),
      gradedPicks: graded.length,
      // roiEligiblePicks/oddsCoveragePercent/flatBetRoi are derived ONLY from
      // graded records with a valid persisted odds value -- missing odds are
      // excluded from ROI entirely, never treated as 0-profit/loss/+100.
      roiEligiblePicks: withOdds.length,
      oddsCoveragePercent: graded.length ? Number(((withOdds.length / graded.length) * 100).toFixed(1)) : 0,
      flatBetRoi: withOdds.length ? Number(((roiUnits / withOdds.length) * 100).toFixed(1)) : null,
      actualKTotal: totalActualKs || null,
      avgActualK: avg(actualKs),
      avgIp: avg(ips),
      kPerNine: totalIp > 0 ? Number(((totalActualKs / totalIp) * 9).toFixed(2)) : null,
    },
  };
}
