// Single source of truth for the HR Model tab on /mlb/performance-preview:
// raw records -> graded eligibility -> date window -> score band -> the
// EXACT array that feeds both the summary strip and the result table. No
// consumer of this module may read the pre-generated hr-model-performance.json
// summary for a windowed/banded view -- that file remains available for
// other consumers (e.g. all-time context) but is not this tab's source of
// truth once a window or band is selected.
//
// Score-band comparisons are plain numeric >=/< against hrQualityScore --
// deliberately not the string-label lookup the old HrModelSection used, so a
// score of exactly 80/70/60/50 lands in the correct band without relying on
// a shared "must stay in lockstep" comment between two files.

import type { HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { computeFlatBetRoi, oddsCoveragePercent } from "./flatBetRoi";
import type { SummaryMetric } from "./summaryMetric";

export type HrScoreBandId = "80plus" | "70to79" | "60to69" | "50to59";

export const HR_SCORE_BANDS: { id: HrScoreBandId; label: string; min: number; max: number | null }[] = [
  { id: "80plus", label: "80+", min: 80, max: null },
  { id: "70to79", label: "70-79", min: 70, max: 80 },
  { id: "60to69", label: "60-69", min: 60, max: 70 },
  { id: "50to59", label: "50-59", min: 50, max: 60 },
];

/** score >= min && (max == null || score < max). Below 50 never matches any band -- deliberately not exposed in this tracker. */
export function matchesHrScoreBand(score: number | null, bandId: HrScoreBandId): boolean {
  if (score == null) return false;
  const band = HR_SCORE_BANDS.find((b) => b.id === bandId);
  if (!band) return false;
  return score >= band.min && (band.max == null || score < band.max);
}

/** Same eligibility rule as buildPerformanceSummary(): only graded hit/miss records count. */
export function isHrRecordGraded(record: HrPredictionRecord): boolean {
  return record.result.status === "hit" || record.result.status === "miss";
}

export interface HrTrackerFilterParams {
  window: TimeWindowId;
  band: HrScoreBandId;
  referenceDate?: string;
}

/**
 * raw records -> graded -> date window -> score band. This exact array is
 * what both the summary strip and the result table must render from.
 */
export function filterHrRecords(records: HrPredictionRecord[], { window, band, referenceDate }: HrTrackerFilterParams): HrPredictionRecord[] {
  return records.filter(
    (r) => isHrRecordGraded(r) && isDateInWindow(r.date, window, referenceDate) && matchesHrScoreBand(r.hrQualityScore, band),
  );
}

export function buildHrSummaryMetrics(filtered: HrPredictionRecord[]): SummaryMetric[] {
  const plays = filtered.length;
  const hits = filtered.filter((r) => r.result.status === "hit").length;
  const hitRate = plays > 0 ? Math.round((hits / plays) * 1000) / 10 : null;
  const roiEntries = filtered.map((r) => ({ odds: r.hrOddsYes, isWin: r.result.status === "hit" }));
  const roi = computeFlatBetRoi(roiEntries);
  const coverage = oddsCoveragePercent(roiEntries);

  return [
    { label: "Plays", value: String(plays) },
    { label: "HR Hits", value: String(hits), tone: hits > 0 ? "positive" : "neutral" },
    { label: "HR Rate", value: hitRate != null ? `${hitRate}%` : "—" },
    {
      label: "Flat-Bet ROI",
      value: roi != null && coverage >= 50 ? `${roi >= 0 ? "+" : ""}${roi}%` : "— (low odds coverage)",
      tone: roi == null || coverage < 50 ? "neutral" : roi >= 0 ? "positive" : "negative",
    },
  ];
}
