// Single source of truth for the Sin City tab on /mlb/performance-preview:
// raw records -> date window -> qualification level -> the EXACT array that
// feeds both the summary strip and the result table. qualificationLevel is
// already mutually exclusive ("5/5" xor "4/5") at persistence time in
// scripts/persist-sin-city-picks.mjs, so filtering is a plain equality
// check -- this module does not re-derive qualification.

import type { SinCityPickRecord, SinCityQualificationLevel } from "@/types/mlbSinCity";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { computeFlatBetRoi, oddsCoveragePercent } from "./flatBetRoi";
import type { SummaryMetric } from "./summaryMetric";

export type SinCityCategoryId = "fiveOfFive" | "fourOfFive";

export const SIN_CITY_CATEGORIES: { id: SinCityCategoryId; label: string; level: SinCityQualificationLevel }[] = [
  { id: "fiveOfFive", label: "5/5", level: "5/5" },
  { id: "fourOfFive", label: "4/5", level: "4/5" },
];

export interface SinCityTrackerFilterParams {
  window: TimeWindowId;
  category: SinCityCategoryId;
  referenceDate?: string;
}

export function filterSinCityRecords(
  records: SinCityPickRecord[],
  { window, category, referenceDate }: SinCityTrackerFilterParams,
): SinCityPickRecord[] {
  const level = SIN_CITY_CATEGORIES.find((c) => c.id === category)?.level;
  return records.filter((r) => r.qualificationLevel === level && isDateInWindow(r.date, window, referenceDate));
}

export function buildSinCitySummaryMetrics(filtered: SinCityPickRecord[]): SummaryMetric[] {
  const graded = filtered.filter((r) => r.resultStatus === "hit" || r.resultStatus === "miss");
  const hits = filtered.filter((r) => r.resultStatus === "hit").length;
  const hitRate = graded.length > 0 ? Math.round((hits / graded.length) * 1000) / 10 : null;
  const roiEntries = graded.map((r) => ({ odds: r.hrOddsYes, isWin: r.resultStatus === "hit" }));
  const roi = computeFlatBetRoi(roiEntries);
  const coverage = oddsCoveragePercent(roiEntries);

  return [
    { label: "Qualified", value: String(filtered.length) },
    { label: "Graded", value: String(graded.length) },
    { label: "HR Hits", value: String(hits), tone: hits > 0 ? "positive" : "neutral" },
    { label: "HR Rate", value: hitRate != null ? `${hitRate}%` : "—" },
    {
      label: "Flat-Bet ROI",
      value: roi != null && coverage >= 50 ? `${roi >= 0 ? "+" : ""}${roi}%` : "— (low odds coverage)",
      tone: roi == null || coverage < 50 ? "neutral" : roi >= 0 ? "positive" : "negative",
    },
  ];
}
