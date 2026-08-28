// Single source of truth for the Numerology tab on /mlb/performance-preview:
// raw records -> finalized -> date window -> category -> the EXACT array
// that feeds both the summary strip and the result table.
//
// Category semantics (confirmed against the persisted schema, see the
// performance-preview audit):
//   - "Overall Top Single Plays" is the persisted selectionType === "top-play"
//     population. Exactly one such record exists per tracked date by
//     construction (buildDailyNumerologyCard produces a single topPlay
//     object, never an array) -- this is the existing semantic, not a new
//     ranking rule.
//   - 60+ / 70+ / 80+ are CUMULATIVE numeric bands over numerologyScore
//     (inclusive >=), evaluated against the selectionType === "over-50"
//     population (score > 50 by construction, a strict superset of every
//     score >= 60), using plain numeric comparison rather than the
//     persisted qualifiesOver50 boolean (which is a fixed >50 check, not
//     parameterized by the requested 60/70/80 thresholds).

import type { NumerologyPerformanceRecord } from "@/types/mlbNumerologyPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import type { SummaryMetric } from "./summaryMetric";

export type NumerologyCategoryId = "topPlay" | "60plus" | "70plus" | "80plus";

export const NUMEROLOGY_CATEGORIES: { id: NumerologyCategoryId; label: string; threshold: number | null }[] = [
  { id: "topPlay", label: "Overall Top Single Plays", threshold: null },
  { id: "60plus", label: "60+", threshold: 60 },
  { id: "70plus", label: "70+", threshold: 70 },
  { id: "80plus", label: "80+", threshold: 80 },
];

export function isNumerologyRecordFinalized(record: NumerologyPerformanceRecord): boolean {
  return record.resultStatus === "final";
}

export function matchesNumerologyCategory(record: NumerologyPerformanceRecord, category: NumerologyCategoryId): boolean {
  if (category === "topPlay") return record.selectionType === "top-play";
  const threshold = NUMEROLOGY_CATEGORIES.find((c) => c.id === category)?.threshold;
  if (threshold == null) return false;
  return record.selectionType === "over-50" && record.numerologyScore != null && record.numerologyScore >= threshold;
}

export interface NumerologyTrackerFilterParams {
  window: TimeWindowId;
  category: NumerologyCategoryId;
  referenceDate?: string;
}

export function filterNumerologyRecords(
  records: NumerologyPerformanceRecord[],
  { window, category, referenceDate }: NumerologyTrackerFilterParams,
): NumerologyPerformanceRecord[] {
  return records.filter(
    (r) => isNumerologyRecordFinalized(r) && isDateInWindow(r.date, window, referenceDate) && matchesNumerologyCategory(r, category),
  );
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function buildNumerologySummaryMetrics(filtered: NumerologyPerformanceRecord[]): SummaryMetric[] {
  const plays = filtered.length;
  const hrHits = filtered.filter((r) => r.hitHomeRun).length;
  const hrRate = plays > 0 ? Math.round((hrHits / plays) * 1000) / 10 : null;
  const avgHits = avg(filtered.map((r) => r.stats?.hits).filter((v): v is number => v != null));
  const avgTotalBases = avg(filtered.map((r) => r.stats?.totalBases).filter((v): v is number => v != null));

  return [
    { label: "Plays", value: String(plays) },
    { label: "HR Hits", value: String(hrHits), tone: hrHits > 0 ? "positive" : "neutral" },
    { label: "HR Rate", value: hrRate != null ? `${hrRate}%` : "—" },
    { label: "Avg Hits", value: avgHits != null ? avgHits.toFixed(2) : "—" },
    { label: "Avg TB", value: avgTotalBases != null ? avgTotalBases.toFixed(2) : "—" },
  ];
}
