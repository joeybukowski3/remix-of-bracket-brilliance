/**
 * mlb-top-hr-tracking.mjs
 *
 * Shared helpers for the "Top HR Props" forward-tracking + backfill
 * scripts. Does NOT define or alter the selection rule -- that lives
 * exclusively in scripts/lib/mlb-hr-selection.mjs (selectDeterministicHrPicks),
 * which every caller here must use to decide who counts as a "Top HR Prop."
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const TOP_HR_TRACKING_MODEL_VERSION = "top-hr-tracking-v1";

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
  return `${record.date}|${record.playerId}|${record.gameId}`;
}

/**
 * Upserts pick snapshots into the existing performance file. Never
 * overwrites a record that's already graded (hit/miss/did_not_play) --
 * only "pending" or missing records get replaced, so reruns the same day
 * (or a later backfill pass) can't clobber a real result.
 */
export function mergeTopHrRecords(existingPayload, incomingRecords) {
  const existing = Array.isArray(existingPayload?.records) ? existingPayload.records : [];
  const byKey = new Map(existing.map((record) => [recordKey(record), record]));
  for (const record of incomingRecords) {
    const key = recordKey(record);
    const current = byKey.get(key);
    if (!current || current.resultStatus === "pending") {
      byKey.set(key, { ...current, ...record });
    }
  }
  const records = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
  return { records };
}

function americanOddsToDecimalProfit(oddsText) {
  const n = Number(String(oddsText ?? "").replace("+", ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

export function summarizeTopHrPerformance(performanceFile, trackingStartDate) {
  const records = performanceFile.records ?? [];
  const graded = records.filter((r) => r.resultStatus === "hit" || r.resultStatus === "miss");
  const hits = graded.filter((r) => r.resultStatus === "hit");
  const withOdds = graded.map((r) => americanOddsToDecimalProfit(r.odds)).filter((p) => p !== null);

  const roiUnits = graded.reduce((sum, r) => {
    const profit = americanOddsToDecimalProfit(r.odds);
    if (profit === null) return sum;
    return sum + (r.resultStatus === "hit" ? profit : -1);
  }, 0);

  const gradedDates = records.filter((r) => r.resultStatus !== "pending").map((r) => r.date).sort();

  return {
    generatedAt: new Date().toISOString(),
    trackingModelVersion: TOP_HR_TRACKING_MODEL_VERSION,
    trackingStartDate,
    totalTrackedDates: new Set(records.map((r) => r.date)).size,
    mostRecentGradedDate: gradedDates.length ? gradedDates[gradedDates.length - 1] : null,
    overall: {
      picks: records.length,
      gradedPicks: graded.length,
      hrHits: hits.length,
      hrHitRate: graded.length ? Number(((hits.length / graded.length) * 100).toFixed(1)) : null,
      avgOdds: withOdds.length ? Number(((withOdds.reduce((a, b) => a + b, 0) / withOdds.length) * 100).toFixed(1)) : null,
      // roiEligiblePicks/oddsCoveragePercent/flatBetRoi are derived ONLY from
      // graded records that carry a valid persisted odds value (withOdds) --
      // a missing odds value is excluded from the ROI calculation entirely,
      // never treated as a 0-profit, a loss, or an inferred +100 price.
      roiEligiblePicks: withOdds.length,
      oddsCoveragePercent: graded.length ? Number(((withOdds.length / graded.length) * 100).toFixed(1)) : 0,
      flatBetRoi: withOdds.length ? Number(((roiUnits / withOdds.length) * 100).toFixed(1)) : null,
    },
  };
}
