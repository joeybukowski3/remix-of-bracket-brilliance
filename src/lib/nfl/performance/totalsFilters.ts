import type { DirectionalResult, MarketDirection, TotalsPerformanceRow } from "@/types/nfl/performance";

export type TotalsFilters = {
  week: number | "all";
  direction: MarketDirection | "all";
  result: DirectionalResult | "all";
  projectedTotalBucket: string | "all";
  jkbMarketDifferenceBucket: string | "all";
};

export const DEFAULT_TOTALS_FILTERS: TotalsFilters = {
  week: "all",
  direction: "all",
  result: "all",
  projectedTotalBucket: "all",
  jkbMarketDifferenceBucket: "all",
};

export function applyTotalsFilters(rows: readonly TotalsPerformanceRow[], filters: TotalsFilters): TotalsPerformanceRow[] {
  return rows.filter((row) => {
    if (filters.week !== "all" && row.week !== filters.week) return false;
    if (filters.direction !== "all" && row.jkb_market_direction !== filters.direction) return false;
    if (filters.result !== "all" && row.directional_result !== filters.result) return false;
    if (filters.projectedTotalBucket !== "all" && row.projected_total_bucket !== filters.projectedTotalBucket) return false;
    if (filters.jkbMarketDifferenceBucket !== "all" && row.jkb_market_difference_bucket !== filters.jkbMarketDifferenceBucket) return false;
    return true;
  });
}

export type TotalsSortKey = "week" | "projected_game_total" | "market_total" | "abs_jkb_market_diff" | "actual_game_total" | "absolute_total_error";

export type TotalsSortState = { key: TotalsSortKey; direction: "asc" | "desc" } | null;

const SORT_VALUE: Record<TotalsSortKey, (row: TotalsPerformanceRow) => number | null> = {
  week: (r) => r.week,
  projected_game_total: (r) => r.projected_game_total,
  market_total: (r) => r.market_total,
  abs_jkb_market_diff: (r) => (r.jkb_minus_market == null ? null : Math.abs(r.jkb_minus_market)),
  actual_game_total: (r) => r.actual_game_total,
  absolute_total_error: (r) => r.absolute_total_error,
};

export function sortTotalsRows(rows: readonly TotalsPerformanceRow[], sort: TotalsSortState): TotalsPerformanceRow[] {
  if (!sort) return [...rows];
  const getValue = SORT_VALUE[sort.key];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * factor;
  });
}

export function nextTotalsSort(current: TotalsSortState, key: TotalsSortKey, firstDirection: "asc" | "desc" = "desc"): TotalsSortState {
  if (!current || current.key !== key) return { key, direction: firstDirection };
  if (current.direction === firstDirection) return { key, direction: firstDirection === "asc" ? "desc" : "asc" };
  return null;
}
