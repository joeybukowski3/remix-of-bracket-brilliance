import type { DirectionalResult, SidesPerformanceRow, TotalsPerformanceRow } from "@/types/nfl/performance";

/**
 * Simple W-L-P records for the Sides (ATS, SU) and Totals (O/U) tabs.
 *
 * ATS and O/U results are NOT recomputed here: they are read verbatim from the
 * canonical artifact fields `ats_result` / `directional_result` (graded by
 * scripts/lib/nfl-sides-performance.ts and nfl-totals-performance.ts). Only SU
 * is derived, from the canonical `projected_home_margin` and resolved
 * `actual_margin`; the market spread is never consulted.
 */
export type WlpRecord = {
  wins: number;
  losses: number;
  /** Pushes for ATS / O/U; ties for SU. */
  pushes: number;
  /** JKB had no lean (pick / NEUTRAL). Never part of the W-L-P denominator. */
  neutral: number;
  /** wins / (wins + losses); null when there are no decided games. */
  hitRate: number | null;
};

export type WeekSelection = number | "all";

export function tallyResults(results: readonly (DirectionalResult | null)[]): WlpRecord {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let neutral = 0;
  for (const result of results) {
    if (result === "WIN") wins += 1;
    else if (result === "LOSS") losses += 1;
    else if (result === "PUSH") pushes += 1;
    else if (result === "NEUTRAL") neutral += 1;
  }
  return { wins, losses, pushes, neutral, hitRate: wins + losses === 0 ? null : wins / (wins + losses) };
}

/**
 * Straight-up result for one game. JKB's projected winner is the sign of
 * `projected_home_margin` (0 = pick, NEUTRAL). A tied game is a PUSH.
 * Returns null for a game that is not final.
 */
export function computeSuResult(
  row: Pick<SidesPerformanceRow, "projected_home_margin" | "actual_margin" | "game_completion_status">
): DirectionalResult | null {
  if (row.game_completion_status !== "final") return null;
  if (row.projected_home_margin === 0) return "NEUTRAL";
  if (row.actual_margin === 0) return "PUSH";
  return Math.sign(row.projected_home_margin) === Math.sign(row.actual_margin) ? "WIN" : "LOSS";
}

export function computeAtsRecord(rows: readonly SidesPerformanceRow[]): WlpRecord {
  return tallyResults(rows.map((row) => row.ats_result));
}

export function computeSuRecord(rows: readonly SidesPerformanceRow[]): WlpRecord {
  return tallyResults(rows.map(computeSuResult));
}

export function computeOuRecord(rows: readonly TotalsPerformanceRow[]): WlpRecord {
  return tallyResults(rows.map((row) => row.directional_result));
}

export function rowsForWeek<T extends { week: number }>(rows: readonly T[], week: WeekSelection): T[] {
  return week === "all" ? [...rows] : rows.filter((row) => row.week === week);
}

/** Sorted distinct weeks present in the graded rows. */
export function availableWeeks(rows: readonly { week: number }[]): number[] {
  return [...new Set(rows.map((row) => row.week))].sort((a, b) => a - b);
}

/** "12-19-1"; the pushes segment is dropped when `hidePushesWhenZero` and there are none. */
export function formatRecord(record: WlpRecord, hidePushesWhenZero = false): string {
  const base = `${record.wins}-${record.losses}`;
  return hidePushesWhenZero && record.pushes === 0 ? base : `${base}-${record.pushes}`;
}
