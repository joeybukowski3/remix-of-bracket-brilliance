// Single source of truth for the Top K Prop tab on /mlb/performance-preview.
//
// PHASE 1 SAFETY RULE: this module must never fabricate a valueRank or
// compare the existing per-side valueScore values as though they share one
// scale. buildKPropBestBets() in src/lib/mlb/kPropBestBets.ts computes a
// DIFFERENT valueScore formula for "over" than for "under" -- those numbers
// are not comparable to each other, and only the top 3 candidates per side
// are ever persisted per day (no fuller candidate universe exists to derive
// a global rank from). See the performance-preview audit's Top K feasibility
// section for the full explanation.
//
// "Top 5 / 6-10 / 11+ Best Value" categories are therefore modeled here as
// declared-but-unavailable until a Phase 2 tracking schema persists a single
// unified valueScore across the full valid candidate universe with a real
// valueRank field. This module intentionally has no logic that assigns rank
// buckets from the existing TopKPickRecord shape.

import type { TopKPickRecord } from "@/types/mlbTopKPerformance";
import { isDateInWindow, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { computeFlatBetRoi, oddsCoveragePercent } from "./flatBetRoi";
import type { SummaryMetric } from "./summaryMetric";

export type TopKCategoryId = "all" | "top5" | "sixTo10" | "elevenPlus";

export const TOP_K_CATEGORIES: { id: TopKCategoryId; label: string; available: boolean }[] = [
  { id: "all", label: "All Tracked Picks", available: true },
  { id: "top5", label: "Top 5 Best Value", available: false },
  { id: "sixTo10", label: "6-10 Best Value", available: false },
  { id: "elevenPlus", label: "11+ Best Value", available: false },
];

export function isTopKCategoryAvailable(category: TopKCategoryId): boolean {
  return TOP_K_CATEGORIES.find((c) => c.id === category)?.available ?? false;
}

export interface TopKTrackerFilterParams {
  window: TimeWindowId;
  referenceDate?: string;
}

/**
 * Window-only filter -- the only dimension Phase 1 can legitimately support.
 * Callers must gate rank-bucket categories on isTopKCategoryAvailable()
 * rather than passing them here.
 */
export function filterTopKRecords(records: TopKPickRecord[], { window, referenceDate }: TopKTrackerFilterParams): TopKPickRecord[] {
  return records.filter((r) => isDateInWindow(r.date, window, referenceDate));
}

export function buildTopKSummaryMetrics(filtered: TopKPickRecord[]): SummaryMetric[] {
  const graded = filtered.filter((r) => r.result === "WIN" || r.result === "LOSS" || r.result === "PUSH");
  const wins = filtered.filter((r) => r.result === "WIN").length;
  const losses = filtered.filter((r) => r.result === "LOSS").length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : null;
  const roiEntries = graded.filter((r) => r.result !== "PUSH").map((r) => ({ odds: r.odds, isWin: r.result === "WIN" }));
  const roi = computeFlatBetRoi(roiEntries);
  const coverage = oddsCoveragePercent(roiEntries);

  return [
    { label: "Picks", value: String(filtered.length) },
    { label: "Wins", value: String(wins), tone: wins > 0 ? "positive" : "neutral" },
    { label: "Losses", value: String(losses), tone: losses > 0 ? "negative" : "neutral" },
    { label: "Win Rate", value: winRate != null ? `${winRate}%` : "—" },
    {
      label: "Flat-Bet ROI",
      value: roi != null && coverage >= 50 ? `${roi >= 0 ? "+" : ""}${roi}%` : "— (low odds coverage)",
      tone: roi == null || coverage < 50 ? "neutral" : roi >= 0 ? "positive" : "negative",
    },
  ];
}
